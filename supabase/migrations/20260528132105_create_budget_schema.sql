-- F-01: Domain data model + per-user RLS
-- Creates categories and expenses tables with constraints, indexes, RLS policies,
-- and two categories triggers (cascade-on-delete, protect-system-row).

-- =============================================================================
-- CATEGORIES
-- =============================================================================

CREATE TABLE public.categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  year        SMALLINT    NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  name        TEXT        NOT NULL CHECK (length(trim(name)) > 0),
  type        TEXT        NOT NULL CHECK (type IN ('recurring', 'irregular')),
  limit_cents BIGINT      CHECK (limit_cents >= 0),
  is_system   BOOLEAN     NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- No two categories with the same name in the same year for the same user.
  CONSTRAINT categories_unique_user_year_name UNIQUE (user_id, year, name),

  -- System rows have no limit; user rows must have one.
  CONSTRAINT categories_system_limit_check CHECK (
    (is_system = true AND limit_cents IS NULL) OR
    (is_system = false AND limit_cents IS NOT NULL)
  )
);

-- Fast list-by-year queries.
CREATE INDEX idx_categories_user_year ON public.categories (user_id, year);

-- =============================================================================
-- EXPENSES
-- =============================================================================

CREATE TABLE public.expenses (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  category_id UUID        NOT NULL REFERENCES public.categories (id),
  name        TEXT        NOT NULL CHECK (length(trim(name)) > 0),
  amount_cents BIGINT     NOT NULL CHECK (amount_cents > 0),
  expense_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Report queries that scan by year.
CREATE INDEX idx_expenses_user_expense_at ON public.expenses (user_id, expense_at);

-- Cascade-on-delete UPDATE target.
CREATE INDEX idx_expenses_category_id ON public.expenses (category_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses   ENABLE ROW LEVEL SECURITY;

CREATE POLICY categories_owner_all ON public.categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY expenses_owner_all ON public.expenses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- TRIGGER: cascade expenses to "other" on non-system category delete
-- =============================================================================

CREATE FUNCTION public.fn_cascade_to_other()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE other_id UUID;
BEGIN
  IF OLD.is_system THEN
    -- Bypass the system-row protection when the owning auth.users row
    -- is being deleted (FK ON DELETE CASCADE). Without this, deleting
    -- a user account fails because the cascade tries to delete 'other'.
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id) THEN
      RAISE EXCEPTION 'Cannot delete the system category';
    END IF;
    RETURN OLD;
  END IF;

  SELECT id INTO other_id FROM public.categories
  WHERE user_id = OLD.user_id AND year = OLD.year AND is_system = true;

  IF other_id IS NULL THEN
    RAISE EXCEPTION 'No "other" category for user % in year %', OLD.user_id, OLD.year;
  END IF;

  UPDATE public.expenses SET category_id = other_id
  WHERE category_id = OLD.id;

  RETURN OLD;
END $$;

CREATE TRIGGER categories_cascade_other_before_delete
BEFORE DELETE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.fn_cascade_to_other();

-- =============================================================================
-- TRIGGER: protect system rows from UPDATE
-- =============================================================================

CREATE FUNCTION public.fn_protect_system_category()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_system AND (
    NEW.name <> OLD.name OR
    NEW.type <> OLD.type OR
    NEW.is_system <> OLD.is_system OR
    NEW.user_id <> OLD.user_id OR
    NEW.year <> OLD.year OR
    NEW.limit_cents IS DISTINCT FROM OLD.limit_cents
  ) THEN
    RAISE EXCEPTION 'Cannot modify the system category';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER categories_protect_system_before_update
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.fn_protect_system_category();

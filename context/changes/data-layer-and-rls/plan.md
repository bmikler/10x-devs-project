# Data Layer + Per-User RLS (F-01) Implementation Plan

## Overview

Stand up the first domain migration for 10xmoney-tracker: a year-scoped
`categories` table, a `name`-bearing `expenses` table, two `categories`
triggers (cascade expense-reassignment on category delete; protect system
rows from UPDATE), and a `FOR ALL` RLS policy per table
that enforces per-user isolation structurally via `auth.uid() = user_id`.
Generate `src/db/database.types.ts` from the live linked project, upgrade
`src/lib/supabase.ts` to a typed `createServerClient<Database>(...)`, and amend
PRD FR-007 / FR-008 + `roadmap.md` to record the name-field and category-precondition
decisions taken during planning.

## Current State Analysis

- `supabase/config.toml` exists; `supabase/migrations/` is empty — this is the
  first DDL the project will ever apply.
- Supabase CLI v2.23.4 is in `devDependencies`. No `supabase link` has been run
  yet (per deploy-plan, the project + secrets exist but the schema has never
  been pushed).
- `src/lib/supabase.ts:5-24` calls `createServerClient(...)` without a generic
  `<Database>` type — every `.from(...)` call today returns `any`.
- `src/db/` does not exist; will be the new home for `database.types.ts`.
- `src/middleware.ts:11-13` already populates `context.locals.user` from
  `supabase.auth.getUser()`. The SSR client used in API routes will carry the
  user's JWT into Supabase, so `auth.uid()` resolves correctly inside RLS
  predicates — no extra plumbing needed for policies to work.
- `wrangler.jsonc` has `compatibility_flags: ["nodejs_compat"]` and
  `compatibility_date: 2026-05-08`, both required for the SSR + Supabase path
  on Workers.
- No domain API routes yet; only `/api/auth/{signin,signup,signout}.ts` exist.
  This plan adds zero API routes — that work belongs to S-02 and downstream.

## Desired End State

After this plan lands:

1. The linked Supabase project has `categories` and `expenses` tables with the
   constraints, indexes, RLS policies, and triggers described below.
2. Querying as any authenticated user returns only that user's rows; INSERTs
   that set `user_id` to anyone other than `auth.uid()` are rejected by RLS
   `WITH CHECK`.
3. The schema supports the app-level seeding pattern that S-02 will ship:
   inserting an `is_system = true` 'other' row per (user, year) alongside the
   user's first non-system category. F-01 itself does NOT auto-seed — the
   pattern lives in S-02's code. F-01 delivers the fail-fast backstop: the
   cascade trigger raises `'No "other" category for user X in year Y'` if any
   path bypasses the seeding rule.
4. Deleting a non-system category reassigns its expenses to the same year's
   "other" row atomically. Deleting a system row from a user-initiated path
   raises an exception; cascade-deletes triggered by removing the owning
   `auth.users` row pass through cleanly.
5. `src/db/database.types.ts` exists, is committed, and is regenerable via
   `npm run db:types`.
6. `src/lib/supabase.ts` uses `createServerClient<Database>(...)`; `npm run
build` succeeds with no type errors.
7. `prd.md` FR-007 mentions the `name` field; FR-008 mentions the
   at-least-one-category precondition. `roadmap.md` records F-01 as `done`.

Verifiable end-to-end by: applying the migration, regenerating types, building
the app, and running two `supabase db psql` queries (one as a fake user A,
one as a fake user B) that confirm each only sees their own rows.

### Key Discoveries

- Roadmap F-01 (`context/foundation/roadmap.md:65-79`) defined the scope and
  flagged the two questions resolved during planning: "other" → seeded
  per-(user,year), and categories carry a `year` column.
- PRD §Business Logic (`context/foundation/prd.md:236-269`) makes the
  calendar-year boundary load-bearing — every report sums must clip to a
  single year, which is why `expense_at` is `TIMESTAMPTZ` and we standardize
  on `AT TIME ZONE 'Europe/Warsaw'` for year-edge queries.
- Infrastructure plan
  (`context/foundation/infrastructure.md:191-202`) recommends Supabase
  branching for risky migrations. This first migration is non-destructive
  (creates empty tables on an empty project), so we push directly; the
  branching habit lands from S-02 onward when the project has real data.
- `@supabase/ssr` `createServerClient` accepts a `<Database>` generic that
  flows types into every `.from()` call — the upgrade in Phase 2 is a one-line
  generic change once `database.types.ts` exists.

## What We're NOT Doing

- **No API routes.** Reading/writing categories and expenses from the app is
  S-02 / S-03 territory. F-01 builds the surface those slices will consume.
- **No UI work.** All UI lives downstream.
- **No copy-from-previous-year function.** Per the user's roadmap clarification,
  the year-scoped schema _supports_ a future copy workflow; building the actual
  copy RPC or UI is a later slice.
- **No Hyperdrive binding.** The deploy-plan's risk register recommends
  Hyperdrive in front of Supabase; this plan does not provision it. F-01 only
  defines schema — query-path performance work waits until we have a measured
  latency problem.
- **No `description` column on categories.** PRD FR-003 specifies name + type
  - limit. `name` is sufficient.
- **No soft-delete columns on expenses.** S-06 will decide soft vs hard
  delete; F-01 sets no `deleted_at`.
- **No CI hooks for `npm run db:types`.** Manual regeneration is the MVP
  posture; CI integration is a future concern.
- **No Supabase branch for the first push.** Empty schema on an empty project.
  Branching becomes the convention once there are rows to protect.

## Implementation Approach

Three phases, each independently mergeable:

1. **Schema first.** One migration file lands the entire data model — both
   tables, RLS policies, both triggers, the system-row guards. Apply it to the
   linked Supabase project. Manual smoke test verifies tables exist and RLS
   isolates by user.

2. **Types second.** Generate `src/db/database.types.ts` from the now-live
   schema. Upgrade `src/lib/supabase.ts` to flow the type into the SSR client.
   Build to confirm.

3. **Docs third.** Amend PRD FR-007/FR-008 to match the actual schema and
   user-flow rules settled during planning. Mark F-01 done in the roadmap.
   Capture the RLS / trigger / system-row pattern in `lessons.md` so the next
   slice doesn't re-derive it.

The order matters: types depend on the schema being live; doc updates record
what the schema actually does, so they're last.

## Critical Implementation Details

- **"Other"-seeding lives in app code, not the database.** S-02 (the
  create-category API route) is responsible for ensuring an
  `is_system = true` 'other' row exists for `(auth.uid(), NEW.year)` whenever
  it creates a non-system category. The recommended shape is two inserts in
  sequence — the user's category, then `INSERT ... 'other' ... WHERE NOT
EXISTS` — both idempotent under retry. The BEFORE DELETE cascade trigger
  raises `'No "other" category for user X in year Y'` if 'other' is missing
  at delete time; treat that exception as a fail-fast signal that some path
  (a script, Supabase Studio, a future RPC) bypassed the seeding rule and
  needs to learn it. F-01 does NOT enforce seeding at DB level by design —
  the rule lives in app code so the schema stays minimal.
- **Auth-user cascade-delete bypasses the system-row guard.** `categories.user_id`
  uses `references auth.users on delete cascade`. When the auth user is deleted,
  the FK cascade fires `DELETE` on every category for that user — including the
  `is_system = true` 'other' row. The cascade trigger detects this case via
  `EXISTS (SELECT 1 FROM auth.users WHERE id = OLD.user_id)` and lets the cascade
  through. The user-facing invariant ("you cannot delete your own 'other' row")
  still holds for every other delete path.
- **`auth.uid()` requires the user JWT.** RLS predicates evaluate
  `auth.uid()` from the request's `Authorization` header / session cookie. The
  Supabase SSR client (already wired in `src/lib/supabase.ts:9`) handles this
  via the `cookies` adapter, so policies "just work" from API routes. The
  `service_role` key bypasses RLS — never put it in a request-reachable
  client.
- **Year-boundary timezone.** `expense_at` is `TIMESTAMPTZ`. Any future
  year-boundary query (S-04) must compute the year via
  `EXTRACT(YEAR FROM expense_at AT TIME ZONE 'Europe/Warsaw')`, not a naked
  `EXTRACT(YEAR FROM expense_at)` (which uses session TZ — UTC on Cloudflare).
  F-01 establishes the column type and documents the convention; it does not
  yet write the report query.

## Phase 1: Schema migration + RLS + triggers

### Overview

Land the database. One Supabase migration file creates both tables, all
constraints, both triggers, and the RLS policy pair. Apply via `supabase db
push` against the linked project.

### Changes Required

#### 1. Link the local repo to the live Supabase project (one-time)

**File**: developer-machine setup (not committed; no file change)

**Intent**: Connect the `supabase` CLI to the existing Supabase project so
`db push` and `gen types --linked` target the right database. The
project-ref is the same one used during deploy-plan secret provisioning;
fetch it from the Supabase dashboard URL (`/project/<ref>`).

**Contract**: After `supabase login` and `supabase link --project-ref <ref>`,
`supabase status` reports the linked project. `~/.supabase/access-token` is
populated. No file in this repo changes.

#### 2. Create the schema migration

**File**: `supabase/migrations/<utc-timestamp>_create_budget_schema.sql`
(filename via `supabase migration new create_budget_schema` so the timestamp
matches the CLI's expected format)

**Intent**: Define `categories` and `expenses` with their constraints, indexes,
RLS policies, and the two `categories` triggers (cascade-on-delete to 'other';
protect the system row from UPDATE / DELETE). Seeding the per-year 'other' row
is intentionally NOT a DB trigger — that lives in S-02's app code; see Critical
Implementation Details. One migration — splitting buys nothing because both
triggers live on the same table.

**Contract**: a single `.sql` file that, when applied to an empty database,
produces:

- `public.categories(id UUID PK default gen_random_uuid(), user_id UUID NOT
NULL references auth.users on delete cascade, year SMALLINT NOT NULL CHECK
year BETWEEN 2000 AND 2100, name TEXT NOT NULL CHECK length(trim(name)) > 0,
type TEXT NOT NULL CHECK type IN ('recurring','irregular'), limit_cents
BIGINT CHECK limit_cents >= 0, is_system BOOLEAN NOT NULL DEFAULT false,
created_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  - `UNIQUE (user_id, year, name)` — no two categories with the same name
    in the same year for the same user.
  - `CHECK ((is_system = true AND limit_cents IS NULL) OR (is_system = false
AND limit_cents IS NOT NULL))` — system rows have no limit; user rows
    must.
  - Index: `(user_id, year)` for list-by-year queries.
- `public.expenses(id UUID PK default gen_random_uuid(), user_id UUID NOT
  NULL references auth.users on delete cascade, category_id UUID NOT NULL
  references public.categories(id), name TEXT NOT NULL CHECK
  length(trim(name)) > 0, amount_cents BIGINT NOT NULL CHECK amount_cents
  > 0, expense_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_at TIMESTAMPTZ
  > NOT NULL DEFAULT now())`
  - Index: `(user_id, expense_at)` for report queries that scan by year.
  - Index: `(category_id)` so the cascade-on-delete `UPDATE` is fast.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on both tables.
- One policy per table:
  ```sql
  CREATE POLICY categories_owner_all ON public.categories
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  -- same shape for expenses_owner_all on public.expenses
  ```
  `WITH CHECK` is what stops an authenticated user from inserting a row with
  someone else's `user_id`; without it, the `FOR ALL` policy would only
  filter reads. Both clauses are required.
- BEFORE DELETE trigger `categories_cascade_other_before_delete`:

  ```sql
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
  ```

  The `IF other_id IS NULL THEN RAISE` clause is load-bearing — it's the
  fail-fast signal that some path created a non-system category without
  also seeding 'other' (the seeding rule that lives in S-02's API route).

- BEFORE UPDATE trigger that protects system rows from rename / retype /
  re-limit / un-system:

  ```sql
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
  ```

The migration file is the single source of truth for everything above. Future
schema work goes in _new_ timestamped migration files; this one is never edited
once it lands on the linked project.

#### 3. Apply the migration

**File**: terminal — `npx supabase db push`

**Intent**: Push the migration to the linked Supabase project. The project is
empty, so there's nothing to break.

**Contract**: After `supabase db push`, `supabase migration list` shows the
new migration as applied locally and remotely. The Supabase dashboard
"Database → Tables" lists `categories` and `expenses` under `public`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly: `npx supabase db push` exits 0.
- Schema-list confirms both tables: `npx supabase db psql -c "\dt public.*"`
  shows `public.categories` and `public.expenses`.
- RLS is enabled on both: `npx supabase db psql -c "SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('categories','expenses');"`
  returns `t` for both rows.
- Both triggers are registered: `npx supabase db psql -c "SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.categories'::regclass AND NOT tgisinternal;"`
  lists `categories_cascade_other_before_delete` and
  `categories_protect_system_before_update`.
- Lint + build still pass: `npm run lint && npm run build`.

#### Manual Verification

- Sign in as the live test user. Manually insert (via the Supabase dashboard
  SQL editor) one user-category AND one `is_system = true` 'other' sibling
  for the same `(user_id, year)` — this is the manual stand-in for what
  S-02's API route will do automatically.
- Attempt to `DELETE` the system row from the SQL editor — confirm it
  raises `Cannot delete the system category`.
- Insert an expense against the user category, then `DELETE` the
  user category — confirm the expense's `category_id` now equals the
  `is_system = true` row's id.
- Insert a second user-category WITHOUT a matching system 'other', then
  try to delete it — confirm the cascade trigger raises
  `'No "other" category for user X in year Y'`. This is the fail-fast
  backstop that signals an S-02 seeding bug.
- Spawn a second auth user (Supabase dashboard) and query categories as
  them — confirm no rows from the first user are visible.

**Implementation Note**: After completing Phase 1 and all automated
verification passes, pause for manual confirmation that the four manual
checks above are clean before moving to Phase 2.

---

## Phase 2: Generated TypeScript types + typed Supabase client

### Overview

Generate `src/db/database.types.ts` from the now-live schema, add the
regeneration script to `package.json`, and upgrade the SSR client factory in
`src/lib/supabase.ts` to flow the schema's types through every `.from()` call.

### Changes Required

#### 1. Add the types-generation script

**File**: `package.json`

**Intent**: Make type regeneration a single named command per target (linked
remote vs local Docker stack) so it appears in `npm run` listings and in
CI / docs without bash incantations.

**Contract**: Two new `scripts` entries:

- `"db:types": "supabase gen types typescript --linked > src/db/database.types.ts"`
  — pulls types from the linked Supabase project. Default; this is the path
  used at PR time so the committed file matches what ships.
- `"db:types:local": "supabase gen types typescript --local > src/db/database.types.ts"`
  — pulls types from the Docker stack started via `supabase start`. Use this
  during in-flight iteration on a migration that hasn't been pushed remote
  yet (e.g. verifying a trigger or RLS shape locally). Requires Docker and
  `supabase start` to be running.

No other scripts change. The two scripts write to the same file, so a
developer who alternates between local and remote regeneration must
re-run the relevant command before committing — the file always reflects
its last source.

#### 2. Generate and commit the types file

**File**: `src/db/database.types.ts` (new — `src/db/` is created in this
step)

**Intent**: A committed snapshot of the live schema's types, regenerable on
demand. Committing (vs generating at build time) keeps the repo
self-contained — clones type-check without needing Supabase access.

**Contract**: The file is the verbatim output of `npm run db:types`. It
exports a `Database` interface whose `public.Tables` includes `categories`
and `expenses` with the columns from Phase 1. No manual edits to this file
ever — regenerate it whenever the schema changes.

#### 3. Wire the typed client

**File**: `src/lib/supabase.ts`

**Intent**: Replace the untyped `createServerClient(...)` call with
`createServerClient<Database>(...)` so every downstream `.from('categories')`
or `.from('expenses')` call returns typed rows. Existing callers don't break
— the generic is additive.

**Contract**: Add `import type { Database } from "@/db/database.types";` at
the top, and change line 9's `createServerClient(...)` to
`createServerClient<Database>(...)`. The return type tightens from
`SupabaseClient<any, ..., any>` to `SupabaseClient<Database, "public",
Database["public"]>`. Existing call sites in `src/pages/api/auth/*.ts`
continue to work because they only touch `supabase.auth.*`, not `.from()`.

### Success Criteria

#### Automated Verification

- Types file regenerates idempotently: `npm run db:types` exits 0; the file
  contains a `Database` export with `categories` and `expenses` under
  `public.Tables`.
- Type-check passes: `npm run build` exits 0 (Astro runs `astro check` as
  part of build).
- Lint passes: `npm run lint`.

#### Manual Verification

- In a scratch `.ts` file (or in a future S-02 PR), call
  `supabase.from('categories').select('*')` and confirm the editor's
  IntelliSense shows `id`, `user_id`, `year`, `name`, `type`,
  `limit_cents`, `is_system`, `created_at` as the row shape — not `any`.
- Confirm `src/db/database.types.ts` exists in the repo (`git status` shows
  it as a new tracked file).

**Implementation Note**: After completing Phase 2 and all automated
verification passes, pause for manual confirmation before moving to Phase 3.

---

## Phase 3: Doc updates — PRD FR-007 / FR-008, roadmap, lessons

### Overview

Reflect the planning decisions in the upstream contracts so future slices
read the same rules. Three files change: `prd.md` (functional requirements),
`roadmap.md` (F-01 status), and `lessons.md` (capture the trigger/RLS
pattern as a reusable rule).

### Changes Required

#### 1. Amend PRD FR-007 (expense fields)

**File**: `context/foundation/prd.md`

**Intent**: FR-007 currently says "amount + category + date". The schema
adds a required `name` field with UI default-from-category. Update the FR
text and its Socrates blockquote rationale; don't touch unrelated FRs.

**Contract**: Replace the FR-007 paragraph (lines around 170-177) with
text that names: amount, category (or default to "other"), date defaulting
to today, and a short text `name` defaulting to the chosen category's name
(or "other") and overridable by the user. The Socrates blockquote is
extended with one sentence: "Counter-argument considered: 'A required name
field slows the 10-second criterion.' Resolution: UI prefills the field
from the selected category, so the default-path keystrokes don't change;
the override is opt-in for cases like 'McDonalds' under food, and
populates the v1.1 grouped-by-name report on day one." No other FR text
changes.

#### 2. Amend PRD FR-008 (logging precondition)

**File**: `context/foundation/prd.md`

**Intent**: FR-008 currently reads as if the user can log an expense
without ever creating a category. The decided rule is stricter: the user
must have created at least one category in the current year before any
expense can be logged; "other" is auto-seeded by the first category
insert, so the FR-008 fallback ("no category picked → goes to 'other'")
still applies, just gated behind that one prior action.

**Contract**: Update FR-008's paragraph to: "The user can log an expense
without picking a category — the expense is recorded under the implicit
'other' category, which is automatically present once the user has
created at least one category in the current year." Extend the Socrates
blockquote with: "Counter-argument considered: 'Why not seed "other"
preemptively so the very first action of every year works?' Resolution:
the trigger model auto-seeds 'other' alongside the user's first
intentional category creation for the year, which is the only path that
makes sense — creating categories is the act of declaring the plan, and
the catch-all only matters once a plan exists."

#### 3. Mark F-01 done in the roadmap

**File**: `context/foundation/roadmap.md`

**Intent**: Once Phases 1 and 2 land on master, F-01's roadmap entry
should reflect it. Two touchpoints: the `At a glance` row (line ~32, set
status to `done`), and the `Done` section at the bottom (add one line).
The Backlog Handoff table row for F-01 should also flip its "Ready for
`/10x-plan`" cell to "shipped" or be removed — both options are valid;
prefer flipping to keep the historical mapping.

**Contract**: F-01 row in `At a glance` table → `Status: done`. The
`## Done` section gets a new entry: `- F-01 / data-layer-and-rls —
shipped <date>. Migration <timestamp>_create_budget_schema.sql; types
in src/db/database.types.ts.` (date filled at land-time). No other
roadmap content changes — downstream slices stay `proposed` until they
themselves ship.

#### 4. Capture the pattern in `lessons.md`

**File**: `context/foundation/lessons.md`

**Intent**: `lessons.md` is currently a stub. F-01 introduces four
reusable patterns worth capturing so the next slice doesn't re-derive
them: (a) RLS shape (`FOR ALL ... USING ... WITH CHECK`); (b) the
seeding convention — S-02 (and every other category-creating path) must
also seed the per-year `is_system = true` 'other' row, because F-01
intentionally does not enforce this at DB level; (c) the
`AT TIME ZONE 'Europe/Warsaw'` convention for any calendar-year boundary;
(d) the layer-split principle — data-loss-prevention invariants
(FR-006 cascade) live at DB level; UX-convenience invariants ('other'
seeding) live in app code.

**Contract**: Append a new top-level section "Data layer patterns" with
four short rule entries — each one rule, with a one-sentence "why"
and one-sentence "when to apply". No prescriptive code; the rule is the
pattern, the migration file is the canonical example. Length per
rule: ~3 lines.

### Success Criteria

#### Automated Verification

- Lint + build still pass: `npm run lint && npm run build`.
- No broken cross-references in foundation docs (text search for the
  changed FR IDs — they should still resolve):
  `rg -l "FR-007|FR-008|F-01" context/foundation/`.

#### Manual Verification

- Re-read PRD FR-007 + FR-008 — the new text aligns with the schema in
  Phase 1 (no orphan claims about fields the table doesn't have).
- The "Done" entry in `roadmap.md` correctly names the migration file.
- `lessons.md` reads as a useful future reference, not a journal entry —
  someone landing on it cold should be able to apply the rule to a new
  slice without reading this plan.

**Implementation Note**: This phase is doc-only; once it lands, F-01 is
complete and S-02 / `categories-create-list` is unblocked.

---

## Testing Strategy

### Unit Tests

- None. The project has no test runner (per `CLAUDE.md`), and adding one is
  out of scope for F-01.

### Integration Tests

- None automated. Manual verification (Phase 1 § Manual Verification) covers
  the four invariants that matter: per-user isolation (RLS), auto-seed
  (trigger 1), cascade-to-other (trigger 2), system-row protection (trigger
  3).

### Manual Testing Steps

(Already enumerated in Phase 1 § Manual Verification — single source of
truth.)

## Performance Considerations

F-01 ships schema only; no query paths exist yet. Two notes for downstream:

- The `(user_id, expense_at)` index on `expenses` is sized for S-04's
  "year-bounded sum" query — verify with `EXPLAIN` when S-04 lands.
- The cascade-on-delete UPDATE in trigger 2 scans `expenses` by
  `category_id`; the `(category_id)` index keeps this fast.
- Workers' 10 ms CPU limit (per `infrastructure.md`) is not a concern at the
  schema level. It becomes a concern when S-04's aggregation query lands —
  the rule is to keep aggregation in SQL, not in the Astro route's
  TypeScript.

## Migration Notes

- This is the first migration ever. Empty project → no data to preserve. We
  push directly via `supabase db push`, no branching.
- Going forward (S-02 and beyond), the rule is: any migration that touches
  existing rows uses `supabase branch create <name>` first; merge to main
  only after verifying on the branch. F-01 captures this convention in
  `lessons.md`.
- Rollback for this specific migration is a manual `DROP TABLE public.expenses;
DROP TABLE public.categories;` plus deleting the migration file — the
  project hasn't accumulated state worth preserving yet. This is the only
  migration where that's true.

## References

- Roadmap: `context/foundation/roadmap.md:65-79` (F-01 spec)
- PRD: `context/foundation/prd.md:170-186` (FR-007/008), `context/foundation/prd.md:206-216`
  (FR-011 — drives the year-boundary convention), `context/foundation/prd.md:236-269`
  (Business Logic), `context/foundation/prd.md:283-296` (Access Control)
- Infrastructure: `context/foundation/infrastructure.md:191-202` (migration
  risk register)
- Tech stack: `context/foundation/tech-stack.md` (Supabase rationale)
- Baseline auth/SSR client: `src/lib/supabase.ts:5-24`,
  `src/middleware.ts:6-25`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema migration + RLS + triggers

#### Automated

- [x] 1.1 Migration applies cleanly: `npx supabase db push` exits 0 — e2e26c9
- [x] 1.2 Schema-list confirms both tables via `\dt public.*` — e2e26c9
- [x] 1.3 RLS enabled on both tables (`relrowsecurity = t`) — e2e26c9
- [x] 1.4 Both triggers registered on `public.categories` (cascade-other, protect-system) — e2e26c9
- [x] 1.5 Lint + build still pass: `npm run lint && npm run build` — e2e26c9

#### Manual

- [x] 1.6 With user-category + manually-seeded 'other' present, `DELETE` on the system row raises `Cannot delete the system category` — e2e26c9
- [x] 1.7 Deleting a non-system category reassigns its expenses to 'other' — e2e26c9
- [x] 1.8 Deleting a non-system category with no 'other' present raises the fail-fast cascade error — e2e26c9
- [x] 1.9 A second authenticated user sees none of the first user's rows — e2e26c9

### Phase 2: Generated TypeScript types + typed Supabase client

#### Automated

- [x] 2.1 `npm run db:types` exits 0; file contains `Database` export with both tables — ceca7b5
- [x] 2.2 `npm run build` exits 0 (Astro runs `astro check`) — ceca7b5
- [x] 2.3 `npm run lint` passes — ceca7b5

#### Manual

- [x] 2.4 IntelliSense on `supabase.from('categories').select('*')` shows the typed row shape — ceca7b5
- [x] 2.5 `src/db/database.types.ts` is tracked in git — ceca7b5

### Phase 3: Doc updates — PRD FR-007 / FR-008, roadmap, lessons

#### Automated

- [x] 3.1 `npm run lint && npm run build` still pass — 90fedf2
- [x] 3.2 `rg -l "FR-007|FR-008|F-01" context/foundation/` resolves cleanly — 90fedf2

#### Manual

- [x] 3.3 PRD FR-007/FR-008 text aligns with the schema in Phase 1 — 90fedf2
- [x] 3.4 Roadmap `Done` entry names the migration file correctly — 90fedf2
- [x] 3.5 `lessons.md` reads as a usable future reference (not a journal entry) — 90fedf2

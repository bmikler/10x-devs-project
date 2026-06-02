# Data Layer + Per-User RLS (F-01) — Plan Brief

> Full plan: `context/changes/data-layer-and-rls/plan.md`

## What & Why

Stand up the first domain migration for 10xmoney-tracker — `categories` and
`expenses` tables with structural per-user isolation via row-level security —
so every downstream slice (categories CRUD, expense logging, the report) can
trust that "this user only ever sees their own data" without re-implementing
the check in every API route. F-01 is the roadmap's foundation slice; it
unblocks S-02 and transitively the north-star slice S-04.

## Starting Point

`supabase/migrations/` is empty — this is the first DDL the project will ever
apply. The Supabase project + secrets exist (per deploy-plan), and
`src/lib/supabase.ts:9` wires the SSR client, but no domain tables exist and
`src/db/database.types.ts` does not exist. Auth middleware
(`src/middleware.ts:6-25`) already populates `context.locals.user`, so RLS
predicates evaluating `auth.uid()` will resolve correctly from API routes
once policies land.

## Desired End State

`categories` and `expenses` live in the linked Supabase Postgres project,
both with RLS enforcing `auth.uid() = user_id` on every read and write. A
year-scoped categories model supports the user's "different limits each
year, easy copy from prior year" workflow. An auto-seeded "other" row
(per-user, per-year) absorbs uncategorised expenses and acts as the cascade
target when a category is deleted. `src/db/database.types.ts` is committed
and flows through `createServerClient<Database>(...)` so every future
`.from()` call is type-safe. PRD FR-007/FR-008 and the roadmap reflect the
schema decisions taken during planning.

## Key Decisions Made

| Decision                             | Choice                                                                                                                                                                   | Why (1 sentence)                                                                                                                                                                                                                                                                                                                         | Source |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| "Other" category modeling            | Seeded `is_system = true` row per (user, year)                                                                                                                           | One uniform code path: every expense always has a real `category_id`; cascade and report queries don't branch on null.                                                                                                                                                                                                                   | Plan   |
| Year scope on categories             | Categories carry a `year` SMALLINT; unique on `(user_id, year, name)`                                                                                                    | The user wants per-year limits with a future copy-from-prior-year workflow; the schema makes that a downstream feature, not a migration.                                                                                                                                                                                                 | Plan   |
| Money + dates                        | `amount_cents BIGINT`; `expense_at TIMESTAMPTZ` (year-boundary queries use `AT TIME ZONE 'Europe/Warsaw'`)                                                               | Cents-as-bigint keeps arithmetic exact; TIMESTAMPTZ gives us audit precision while the documented TZ convention keeps the FR-011 year boundary unambiguous.                                                                                                                                                                              | Plan   |
| When + where "other" is seeded       | App-level — S-02's create-category route inserts user-category + idempotent `INSERT 'other' WHERE NOT EXISTS`                                                            | Schema stays minimal; logic reads in TypeScript; the BEFORE DELETE cascade trigger raises a fail-fast error if 'other' is missing at delete time, which surfaces any S-02 seeding bug loudly.                                                                                                                                            | Plan   |
| Expense ↔ category year coupling     | Simple FK to `categories.id`; UI defends year-scoping                                                                                                                    | A composite FK was an option, but the UI will always show only the current year's categories at expense-entry time; explicit risk accepted and recorded.                                                                                                                                                                                 | Plan   |
| Delete-category cascade (FR-006)     | `BEFORE DELETE` trigger reassigns expenses to that year's "other"; system rows raise on delete                                                                           | Keeps the cascade structural (a future cron / psql bypass still preserves history) and refuses to let the user delete the catch-all.                                                                                                                                                                                                     | Plan   |
| Expense identifier text              | Required `name TEXT NOT NULL`; UI defaults from the picked category (or "other")                                                                                         | The v1.1 grouped-by-name report needs _something_ to group by; defaulting from category keeps the 10-second mobile-entry criterion intact, and "McDonalds under food" is the override path.                                                                                                                                              | Plan   |
| RLS policy shape                     | One `FOR ALL` permissive policy per table with both `USING` and `WITH CHECK`                                                                                             | Less SQL than four-per-table; the explicit `WITH CHECK` clause keeps the read-filter / write-check pair symmetric and rejects cross-user inserts.                                                                                                                                                                                        | Plan   |
| Types generation + local-dev posture | Both paths — `npm run db:types` against the linked remote (default at PR time) and `npm run db:types:local` against the Docker stack (`supabase start`); types committed | Default path keeps types in lockstep with the live prod schema; the local path lets a developer iterate on a migration against a Docker-backed Postgres before pushing remote (useful for verifying triggers / RLS without touching prod); whichever path generates the file, the committed types remain the source of truth at PR time. | Plan   |

## Scope

**In scope:**

- One Supabase migration creating both tables, all constraints, indexes, two
  `categories` triggers (cascade-to-'other' on delete; protect-system on update),
  and the RLS policy pair.
- `supabase link` to the live project; `supabase db push` to apply.
- `npm run db:types` script + committed `src/db/database.types.ts`.
- `src/lib/supabase.ts` upgrade to `createServerClient<Database>(...)`.
- PRD FR-007 / FR-008 amendments; roadmap F-01 marked done; `lessons.md`
  pattern entries.

**Out of scope:**

- Any API routes (`src/pages/api/categories/*`, `.../expenses/*`).
- UI components, pages, or islands.
- The copy-from-previous-year RPC or workflow (slice-level, post-F-01).
- Hyperdrive provisioning.
- Soft-delete on expenses.
- Test runner setup.
- CI integration of `npm run db:types`.

## Architecture / Approach

Two tables; RLS-by-default on each via a `FOR ALL ... USING (auth.uid() =
user_id) WITH CHECK (auth.uid() = user_id)` policy. Two triggers on
`categories` carry the schema's invariants — refuse delete on system rows
while reassigning their child expenses to that year's 'other' (FR-006
guardrail), and protect system rows from any UPDATE that would rename /
retype them. Seeding the per-year 'other' row is deliberately NOT a DB
trigger: it lives in S-02's create-category route as a paired idempotent
insert. The cascade trigger's `IF other_id IS NULL THEN RAISE` clause is
the fail-fast backstop if any path forgets to seed.

Types flow from the live schema via `supabase gen types typescript --linked`
into `src/db/database.types.ts`; the SSR client picks them up via a
`<Database>` generic. The migration runs against the linked Supabase
project directly (no branch) because the project is empty — branching
becomes the convention starting with S-02.

## Phases at a Glance

| Phase                                    | What it delivers                                                                 | Key risk                                                                                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Schema migration + RLS + triggers     | The database itself — both tables, policies, both `categories` triggers, applied | Missing the 'other' seeding rule in S-02 means the cascade trigger raises on first category delete; recoverable via app fix, but surfaces only on delete attempts. |
| 2. Generated types + typed client        | `src/db/database.types.ts`, `npm run db:types`, typed `createServerClient`       | None real — additive change; existing callers (`auth.*`) are unaffected.                                                                                           |
| 3. Doc updates (PRD / roadmap / lessons) | FR-007 + FR-008 amended, F-01 marked done, RLS / trigger pattern captured        | Drift if a future agent only reads PRD; mitigated by amending in this same change.                                                                                 |

**Prerequisites:** Supabase project + secrets already provisioned (per
`context/deployment/deploy-plan.md`); `supabase` CLI in devDependencies (✓);
`nodejs_compat` + `compatibility_date >= 2024-09-23` already set in
`wrangler.jsonc` (✓). Developer must run `supabase login` and `supabase
link --project-ref <ref>` once before Phase 1.

**Estimated effort:** ~1 evening session — Phase 1 is the bulk (one
migration file + verification SQL); Phases 2 and 3 are short.

## Open Risks & Assumptions

- **Expense↔category year coupling is UI-enforced, not schema-enforced.** A
  malformed insert could pair a 2027-dated expense with a 2026 category. The
  report (S-04) bounds reads by `expense_at`, so even a wrong FK wouldn't
  pollute the wrong year's totals; mitigation is that the S-03 picker
  always filters categories to the expense's year.
- **First-time Supabase CLI workflow on this machine.** `supabase login`
  and `supabase link --project-ref <ref>` haven't been run yet; first
  invocation may surface auth prompts or browser flows. Non-blocking.
- **`@astrojs/cloudflare` adapter version churn.** Pinned at `^13.5.0`; a
  future minor changing `Astro.locals.runtime.env` shape could break the
  client. Out of scope for F-01 to mitigate, but flagged in
  `infrastructure.md`'s risk register.

## Success Criteria (Summary)

- An authenticated user can insert / select / update / delete their own
  rows in `categories` and `expenses`; the same operations attempted
  against another user's `user_id` are refused by RLS.
- Creating the first user-category in a year auto-creates that year's
  "other" row; deleting a user-category reassigns its expenses to "other"
  atomically; the system row cannot be deleted or renamed.
- `npm run build` succeeds with the typed Supabase client in place;
  `src/db/database.types.ts` reflects the live schema.

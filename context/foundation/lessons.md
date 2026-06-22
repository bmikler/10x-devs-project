# Lessons Learned

## Data layer patterns

### RLS shape: FOR ALL … USING … WITH CHECK

Every user-scoped table uses a single `FOR ALL TO authenticated` policy with both `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`. Why: `WITH CHECK` is what blocks an authenticated user from inserting rows with someone else's `user_id` — without it the policy only filters reads. Apply to every new table that carries a `user_id` column.

### Seeding convention: app code, not DB triggers

The per-year `is_system = true` 'other' category is seeded by the API route that creates the first non-system category for that `(user, year)`, not by a database trigger. Why: keeping the seeding rule in app code means the schema stays minimal and the rule is testable without DB roundtrips. The cascade trigger's `RAISE EXCEPTION 'No "other" category …'` is the fail-fast backstop that catches any path that bypasses the seeding rule. Apply whenever a domain object has a system-provided default that must exist before siblings reference it.

### Timezone convention: AT TIME ZONE 'Europe/Warsaw'

Any query that derives a calendar year from `expense_at` (TIMESTAMPTZ) must use `EXTRACT(YEAR FROM expense_at AT TIME ZONE 'Europe/Warsaw')`, not a naked `EXTRACT(YEAR FROM expense_at)` which uses the session timezone (UTC on Cloudflare Workers). Apply to every report or aggregation query that crosses a year boundary.

### Layer-split principle: data-loss prevention in DB, UX convenience in app

Invariants that prevent data loss (cascade-to-'other' on category delete) live as database triggers. Invariants that enforce UX convenience ('other' must be seeded before logging) live in application code. Why: DB-level enforcement survives every code path (API, Supabase Studio, future RPCs); app-level enforcement is easier to evolve without migrations. Apply when choosing where a new business rule should live.

## FK integrity checks bypass RLS — don't rely on RLS for ownership-scoped references

- **Context**: Multi-tenant / RLS-protected tables — any cross-user isolation or ownership test (e.g. `tests/integration/data-isolation.test.ts`) and any schema defining foreign keys on user-scoped tables.
- **Problem**: Postgres runs FK integrity checks with system privileges, bypassing the inserting user's RLS. A user can insert a row referencing another user's row id even when RLS hides that row from them. The cross-user FK test wrongly assumed the FK lookup honors RLS and would deny it — surfaced when the CI integration gate first ran the suite against a clean migrated DB. (Not a data leak: the referencing row is the attacker's own and exposes none of the target's data.)
- **Rule**: Never assume FK constraint checks are RLS-filtered. Enforce ownership-scoped references with a composite FK on `(id, user_id)` or a trigger — not RLS. Isolation/ownership tests must assert what RLS actually guarantees (the target's rows stay unreadable/unmodified), not FK-level denial of the reference.
- **Applies to**: plan, implement, impl-review, research

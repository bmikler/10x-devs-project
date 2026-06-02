# Categories — Create and List (S-02) — Plan Brief

> Full plan: `context/changes/categories-create-list/plan.md`

## What & Why

Give the user a `/categories` page where they can create a budget category (name + type `recurring|irregular` + spending limit) and see all current-year categories listed — their own plus the implicit system **"other"**. This is roadmap S-02 (critical path to the north star) and the first slice to exercise RLS on a real read **and** write path. It also owns the app-level seeding of the per-`(user, year)` "other" row that F-01 deliberately deferred.

## Starting Point

F-01 shipped the schema: `categories`/`expenses` tables, the unique `(user_id, year, name)` constraint, `system_limit_check` (system rows have a null limit, user rows must have one), the `FOR ALL` RLS policy, and the cascade/protect-system triggers. `src/db/database.types.ts` is committed and the SSR client is typed. `/categories` is already in `middleware.ts`'s protected routes, and the dashboard hub already links to it — but the page, the API route, and the "other" seeding don't exist yet.

## Desired End State

A signed-in user opens `/categories`, fills the inline form, submits, and the page reloads showing the new category — and, after the first create of the year, the accented "other" row. Invalid/duplicate input returns inline. All writes are RLS-scoped to the signed-in user; the seeded "other" row carries `limit_cents = NULL`.

## Key Decisions Made

| Decision                  | Choice                                                                                                      | Why (1 sentence)                                                                                             | Source |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------ |
| "other" seeding mechanism | App-level two-step: insert user category, then idempotent upsert "other" (`onConflict`, `ignoreDuplicates`) | Pure TypeScript, no new migration — exactly what lessons.md §Seeding prescribes; DB trigger is the backstop. | Plan   |
| Form error handling       | Native form POST → redirect to `/categories?error=…` (match auth)                                           | Identical to the shipped auth flow, works without JS, minimal new code.                                      | Plan   |
| Page layout               | Single `/categories` page (SSR list + inline create-form island)                                            | Fewer files, one mobile screen, immediate see-result-after-add loop; route already protected.                | Plan   |
| "other" visual treatment  | Distinct accent color + icon, sorted last, no edit/delete control                                           | Default for designer Open Q #2; signals it's the non-editable catch-all.                                     | Plan   |
| Limit input               | PLN decimal → integer cents; label switches by type; required > 0                                           | Natural money entry; makes the type→period meaning explicit; satisfies the user-row limit-NOT-NULL check.    | Plan   |
| Current-year derivation   | `getCurrentBudgetYear()` in `Europe/Warsaw`                                                                 | Workers run in UTC; lessons.md §Timezone requires Warsaw for every year-boundary decision.                   | Plan   |

## Scope

**In scope:**

- `POST /api/categories` (validate → insert user category → seed "other") + `budget-year` / `money` helpers.
- `/categories` SSR list page + `CategoryForm.tsx` island.
- Roadmap S-02 status update.

**Out of scope:**

- Edit/delete a category (S-07), multi-year/year switcher, any expense or report UI (S-03/S-04).
- A service layer, JSON-fetch forms, or a Postgres seeding RPC.

## Architecture / Approach

Direct-Supabase API route (no service layer, like the auth routes). The create route validates, inserts the user category under the Warsaw year, then idempotently upserts the `is_system` "other" row; insert-user-first means a failed/duplicate create leaves no stray "other". The `.astro` page SSR-queries the current year's categories and renders glass cards mobile-first; the create form is a React island doing a native POST and surfacing `?error=`. Two pure helpers carry the Warsaw-year and PLN↔cents logic.

## Phases at a Glance

| Phase                        | What it delivers                                     | Key risk                                                                                 |
| ---------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. API route + helpers       | `POST /api/categories`, `budget-year.ts`, `money.ts` | Seeding/ordering bug leaves "other" unseeded → cascade trigger raises on a later delete. |
| 2. Page + create-form island | `/categories` SSR list + `CategoryForm.tsx`          | Mobile-usability NFR (≤320px, thumb targets); losing field values on redirect error.     |
| 3. Roadmap doc update        | S-02 marked done in both roadmap tables              | Doc drift if not amended in this change.                                                 |

**Prerequisites:** F-01 (shipped) + S-01 (shipped); signed-in session for manual verification; Supabase secrets already wired.
**Estimated effort:** ~1 evening session — Phase 1 + 2 are the bulk; Phase 3 is a few lines.

## Open Risks & Assumptions

- **Reserved-name collision:** a user category named "other" collides with the seed row's unique key; mitigated by a case-insensitive guard returning a friendly error before insert.
- **Non-transactional two-step write:** user insert succeeds but "other" upsert fails (near-impossible) would leave "other" unseeded; the error is surfaced and the cascade trigger backstops any later delete.
- **"other" visual treatment is an MVP default** for designer Open Q #2 — may be revisited.

## Success Criteria (Summary)

- A signed-in user can create a category and immediately see it (and "other") listed for the current Warsaw year; another user's data is never visible (RLS).
- The first successful create of the year seeds exactly one `is_system` "other" row with a null limit; repeats don't duplicate it.
- Invalid/duplicate input is rejected with an inline message and creates nothing; `npm run build` + `npm run lint` pass.

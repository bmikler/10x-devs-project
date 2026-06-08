# Per-Category Report (Monthly / Yearly) Implementation Plan

## Overview

S-04, the roadmap's north-star slice. Build a read-only `/report` page that
proves the product's core thesis — that the app shows the live delta between the
annual plan and actual spend. The report groups categories into two sections by
type:

- **Monthly section** (recurring categories): average monthly spend vs the
  monthly limit, with a per-month over/under delta and a burn percentage.
- **Yearly section** (irregular categories + the system "other"): year-to-date
  spend vs the annual limit, with a remaining figure and a burn percentage.

All aggregation happens in TypeScript on the server-rendered page — no migration,
no React island, no client JS.

## Current State Analysis

What exists today (verified against the codebase):

- **Schema** (`supabase/migrations/20260528132105_create_budget_schema.sql`):
  `categories(id, user_id, year, name, type, limit_cents, is_system, created_at)`
  and `expenses(id, user_id, category_id, name, amount_cents, expense_at,
  created_at)`. `type IN ('recurring','irregular')`. `limit_cents` is `NULL` for
  the `is_system` "other" row and `NOT NULL` (CHECK ≥ 0) for user rows. Money is
  integer cents throughout. RLS (`*_owner_all`, `FOR ALL … USING/​WITH CHECK
  auth.uid() = user_id`) already isolates both tables per user.
- **`expense_at` is stored at Warsaw noon** (`warsawNoon()` in
  `src/pages/api/expenses/index.ts:24-39`). This is the load-bearing invariant
  that lets the report bound a calendar year with a plain UTC range filter on
  `expense_at` — every stored instant is mid-day UTC, far from any midnight
  boundary, so `[year-01-01, (year+1)-01-01)` is exact without `AT TIME ZONE`.
- **`/report` is already wired but unbuilt**: `src/middleware.ts:4` protects it;
  `src/pages/dashboard.astro` already renders a `📊 Report` card linking to it.
  No `src/pages/report.astro` file exists yet.
- **Reusable helpers**: `formatCentsToPln()` (`src/lib/money.ts`),
  `getCurrentBudgetYear()` (`src/lib/budget-year.ts`, Warsaw-TZ year),
  `createClient()` (`src/lib/supabase.ts`), `SYSTEM_OTHER_NAME` / `CATEGORY_TYPES`
  (`src/lib/categories.ts`), `cn()` (`src/lib/utils.ts`).
- **Page conventions** (from `categories.astro` / `expenses.astro`): server-fetch
  with `Astro.locals.user` + `createClient`, cosmic styling (`bg-cosmic`,
  `rounded-2xl border border-white/10 bg-white/10 backdrop-blur-xl`, gradient
  title, `max-w-md` container), `Topbar`, and an empty-state card that links to
  the page that resolves it.
- **No test runner is configured** (per CLAUDE.md). Verification is `npm run
  build` + `npm run lint` + manual UI testing.

## Desired End State

Signed in, the user opens `/report` and sees, for the current budget year:

- A **Monthly** section listing each recurring category with its average monthly
  spend, monthly limit, an over/under delta (negative when overspending that
  month on average), and a burn %. Overspend reads at a glance via color + sign.
- A **Yearly** section listing each irregular category with year spend, annual
  limit, remaining (negative allowed), and a burn %; the system **"other"** row
  appears last, spent-only (no limit, no remaining, no burn %).
- Sensible empty/partial states: no categories → a link to create one; categories
  but no expenses → rows render with zeros.

Verified by: `npm run build` passes, `npm run lint` passes, and manual checks on
a phone-width viewport confirm the math and styling against seeded data.

### Key Discoveries:

- Warsaw-noon storage of `expense_at` (`src/pages/api/expenses/index.ts:24-39`)
  makes a plain UTC year-range filter exact — no SQL timezone extraction needed.
- "other" is a real `is_system=true` row with `limit_cents = NULL`
  (`src/pages/api/categories/index.ts:59-74`) — it has no budget, so remaining and
  burn % are undefined for it by design.
- `/report` middleware + dashboard link already exist — this slice only adds the
  page and its aggregation helper.
- Existing pages order categories `is_system` ascending then `name` — the report
  reuses that ordering so user rows are alphabetical and "other" sorts last.

## What We're NOT Doing

- No database migration, RPC, or view — aggregation is in TypeScript.
- No React island / `client:*` directive — the page is static, zero JS.
- No month switcher / month navigation (considered, then cut by the user).
- No year switcher or multi-year view — current budget year only (v1.1).
- No burn-rate proration by elapsed time for irregular categories — burn % for
  irregular is simply `spent ÷ year-limit` (the user's explicit definition).
- No grouped-by-name "other" breakdown — that is the v1.1 unplanned-spend report.
- No editing/sorting/filtering controls on the report.
- No progress bars or new UI primitives — overspend uses color + sign only.

## Implementation Approach

Split the load-bearing math from the rendering. A pure helper
(`src/lib/report.ts`) turns the raw `categories[]` + current-year `expenses[]`
(plus an `elapsedMonths` integer) into a fully-computed two-section view model.
The page (`src/pages/report.astro`) does I/O only: fetch, compute
`elapsedMonths`, call the helper, render. Keeping the arithmetic in a separate
pure module isolates the single riskiest part of the slice (period attribution +
plan-relative roll-up) from Astro/Supabase concerns, and makes it reviewable on
its own before the page is wired.

## Critical Implementation Details

- **Year-range filter relies on the Warsaw-noon invariant.** Filtering
  `expense_at >= '{year}-01-01' AND expense_at < '{year+1}-01-01'` (UTC date
  literals) is correct only because every `expense_at` is stored at Warsaw noon
  (mid-day UTC). Do not replace this with a naive `EXTRACT(YEAR …)` without
  `AT TIME ZONE 'Europe/Warsaw'` — and do not change the noon-storage convention
  in the expense route without revisiting this filter (see
  `context/foundation/lessons.md` → "Timezone convention").
- **`elapsedMonths` is the current Warsaw month number (1–12), current month
  inclusive.** It is the divisor for the recurring average. It is always ≥ 1
  (January = 1), so the average never divides by zero. Because the report shows
  only the current budget year, elapsed months = current month — no need to
  special-case past years.
- **Burn % guards against a zero limit.** User limits are `> 0` in practice
  (`parsePlnToCents` rejects ≤ 0), but the schema CHECK allows `0`; the helper
  must treat a `0` or `null` limit as "no burn %" rather than dividing by zero.

## Phase 1: Report aggregation helper

### Overview

A pure, side-effect-free module that computes the entire report view model from
in-memory data. No Supabase, no Astro, no I/O — it is the testable heart of the
slice.

### Changes Required:

#### 1. Report aggregation module

**File**: `src/lib/report.ts` (new)

**Intent**: Given the year's categories, the year's expenses, and the number of
elapsed months, produce a two-section view model the page can render directly:
the Monthly rows (recurring), the Yearly rows (irregular, non-system), and the
spent-only "other" row. Centralizes all the per-type roll-up math so the page
holds none of it.

**Contract**: A `buildReport(categories, expenses, elapsedMonths)` function
returning a view model shaped roughly as:

- `monthly: { id, name, avgCents, limitCents, deltaCents, burnPct }[]` for
  `type === 'recurring'` rows, sorted by `name`. `avgCents = round(totalSpent /
  elapsedMonths)`; `deltaCents = limitCents - avgCents` (may be negative);
  `burnPct = limitCents > 0 ? round(avgCents / limitCents * 100) : null`.
- `yearly: { id, name, spentCents, limitCents, remainingCents, burnPct }[]` for
  `type === 'irregular' && !is_system` rows, sorted by `name`. `remainingCents =
  limitCents - spentCents` (may be negative); `burnPct = limitCents > 0 ?
  round(spentCents / limitCents * 100) : null`.
- `other: { name, spentCents } | null` — the `is_system` row's year spend only.

Sum expenses by `category_id` once (a `Map<categoryId, totalCents>`); a category
with no expenses contributes `0`. Expenses whose `category_id` is not in
`categories` are ignored (cannot happen given the FK, but the reduce must not
assume presence). Define and export the row/view-model TypeScript types from this
module. Types only — no Supabase types leak in; the page maps DB rows to the
plain input shape.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Hand-trace one recurring and one irregular example against the formulas and
  confirm `avg`, `delta`, `remaining`, and `burn %` match (e.g. recurring limit
  1500/mo, 3 elapsed months, 6000 spent → avg 2000, delta −500, burn 133%).
- Confirm an overspent category yields a negative delta/remaining, not a clamp.
- Confirm the "other" row carries spend only and never a limit/remaining/burn.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Report page

### Overview

The server-rendered `/report` page: fetch the year's data, compute elapsed
months, call `buildReport`, and render the two sections with the project's cosmic
styling, overspend coloring, and empty/partial states. Static `.astro`, no island.

### Changes Required:

#### 1. Report page

**File**: `src/pages/report.astro` (new)

**Intent**: Load the current budget year's categories and expenses, hand them to
the aggregation helper, and render the Monthly and Yearly sections. Mirror the
structure and styling of `categories.astro` / `expenses.astro`.

**Contract**:

- Server frontmatter: get `Astro.locals.user`; `year = getCurrentBudgetYear()`;
  `createClient(Astro.request.headers, Astro.cookies)`. Compute `elapsedMonths`
  as the current Warsaw month number (1–12) via `Intl.DateTimeFormat` with
  `timeZone: 'Europe/Warsaw'` (same pattern as `getCurrentBudgetYear`).
- Fetch categories: `.from('categories').select('id,name,type,limit_cents,
  is_system').eq('year', year)`.
- Fetch expenses for the year:
  `.from('expenses').select('category_id,amount_cents')
  .gte('expense_at', '${year}-01-01').lt('expense_at', '${year + 1}-01-01')`.
  (Exact because of the Warsaw-noon storage invariant — see Critical
  Implementation Details.)
- Call `buildReport(categories, expenses, elapsedMonths)`; render from the view
  model.
- Layout: `<Layout title="Report">`, `Topbar`, gradient title, `bg-cosmic` +
  `max-w-md` container, budget-year subtitle — identical shell to the sibling
  pages.
- Monthly section: one card per `monthly` row showing avg vs limit
  (`formatCentsToPln`), the delta, and `burn %`. Yearly section: one card per
  `yearly` row showing spent vs limit, remaining, and `burn %`, then the `other`
  row last (spent only). Section bodies show a muted "No recurring/irregular
  categories yet" note when their list is empty.
- Overspend styling: negative `delta`/`remaining` rendered with an explicit minus
  and a red/amber accent from the existing palette; `burn % > 100` in the same
  warning accent; otherwise neutral. Color is paired with the sign/number, never
  color-only.
- Empty state: when there are no categories at all, render a single card linking
  to `/categories` ("Create a category first.") — mirror `expenses.astro:57-68`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Signed in with seeded data, `/report` renders both sections; recurring rows
  show avg/limit/delta/burn, irregular rows show spent/limit/remaining/burn,
  "other" shows spend only at the end of the Yearly section.
- An overspent recurring category shows a negative delta and burn % > 100 in the
  warning accent; an overspent irregular category shows negative remaining.
- No categories → the "Create a category first" card appears.
- Categories but no expenses → rows render with zeros (avg 0, delta = full limit,
  burn 0%).
- Usable one-handed at 320px width — no horizontal scroll; report paints well
  under the < 2s NFR (no client JS to hydrate).
- Numbers match a hand-check against the database for at least one category of
  each type.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation that the UI and math are
correct on a phone-width viewport.

---

## Testing Strategy

No automated test runner is configured (CLAUDE.md). Verification is build + lint
+ manual.

### Manual Testing Steps:

1. Seed (via the app) at least one recurring and one irregular category with
   limits, plus a few expenses across them — including one that pushes a category
   over budget and one logged to "other".
2. Open `/report`; confirm section placement, ordering (user rows alphabetical,
   "other" last in Yearly), and that every figure matches a hand calculation.
3. Force the over-budget case; confirm negative delta/remaining and burn % > 100
   render in the warning accent with a visible sign.
4. Delete all expenses (or use a fresh year); confirm zeroed rows. Delete all
   categories; confirm the "Create a category first" empty state.
5. Check at 320px width: no horizontal scroll, tap-friendly layout.

## Performance Considerations

Single-user scale; a year of expenses is a small result set. Two indexed reads
(`idx_categories_user_year`, `idx_expenses_user_expense_at`) plus an O(n) reduce.
No client JS to hydrate keeps the report comfortably inside the < 2s NFR.

## Migration Notes

None — no schema change.

## References

- Roadmap slice: `context/foundation/roadmap.md` → S-04
- PRD: `context/foundation/prd.md` → FR-011, US-01, § Business Logic
- Lessons: `context/foundation/lessons.md` → Timezone convention
- Expense storage invariant: `src/pages/api/expenses/index.ts:24-39`
- Page pattern to mirror: `src/pages/expenses.astro`, `src/pages/categories.astro`
- Reuse: `src/lib/money.ts`, `src/lib/budget-year.ts`, `src/lib/categories.ts`

## Open Risks & Assumptions

- **FR-011 narrowing (recorded deviation).** FR-011 names "remaining for the
  current calendar year" for every category. By the user's decision, recurring
  rows show a *monthly* over/under delta (`limit − avg`) instead of a
  year-remaining figure; the year-remaining concept is kept only in the Yearly
  (irregular) section. This is a conscious, user-approved narrowing of the FR's
  literal wording, not an oversight.
- **Irregular burn % is not time-prorated.** Per the user's definition, irregular
  burn % is `spent ÷ year-limit` — a "% of annual budget consumed", not a
  pace-vs-elapsed-time figure. Early-year it will read low; this is intended.
- **Recurring average counts the current (partial) month as whole.** `÷ elapsed
  months` with the current month inclusive understates the average early in each
  month. Accepted; matches the "whole months" decision.
- **Burn % with no spend or a zero limit.** No spend → burn 0%; a `0`/`null`
  limit → no burn % shown (guarded). User limits are `> 0` in practice.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step
> lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Report aggregation helper

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — 5e47cf6
- [x] 1.2 Linting passes: `npm run lint` — 5e47cf6

#### Manual

- [ ] 1.3 Hand-traced recurring + irregular examples match the formulas
- [ ] 1.4 Overspent category yields negative delta/remaining (no clamp)
- [ ] 1.5 "other" row carries spend only (no limit/remaining/burn)

### Phase 2: Report page

#### Automated

- [x] 2.1 Build passes: `npm run build` — 6a02431
- [x] 2.2 Linting passes: `npm run lint` — 6a02431

#### Manual

- [ ] 2.3 Both sections render correctly with seeded data
- [ ] 2.4 Overspend shows negative delta/remaining + burn % > 100 in warning accent
- [ ] 2.5 No-categories empty state links to /categories
- [ ] 2.6 Categories-with-no-expenses render zeroed rows
- [ ] 2.7 Usable one-handed at 320px, paints within the < 2s NFR
- [ ] 2.8 Numbers match a database hand-check for one category of each type

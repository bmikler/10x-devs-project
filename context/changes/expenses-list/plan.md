# Monthly Report — Expenses-List Drill-Down Implementation Plan

## Overview

Roadmap slice **S-05 (expenses-list, FR-009)** — "view the list of previously logged expenses" — delivered as a **monthly report** rather than a standalone flat list. Reporting splits into a chooser hub at `/report` (two cards: **Monthly**, **Yearly**). The existing yearly report moves to `/report/yearly` unchanged. A new `/report/monthly` shows **one month at a time** via a client-island switcher, grouping that month's expenses by category, listing each individual expense, and comparing recurring-category spend to its monthly limit. Every logged expense is individually rendered, which gives S-06 (edit/delete) the per-row substrate it needs.

## Current State Analysis

- `/report` (`src/pages/report.astro`) is the **yearly** report: a static `.astro` page, zero client JS. It loads RLS-scoped categories + the current budget year's expenses server-side and aggregates via the pure helper `src/lib/report.ts:buildReport`. Monthly section (recurring: avg/limit/delta/burn%), Yearly section (irregular: spent/limit/remaining/burn%), "other" last.
- The expense query selects only `category_id,amount_cents` and caps `expense_at` at the start of next month so future-dated rows don't inflate totals (`report.astro:34-44`).
- `expenses` table (`src/db/database.types.ts`) carries `id, category_id, name, amount_cents, expense_at` (TIMESTAMPTZ at Warsaw noon), `created_at, user_id`. Category name lives on the `categories` row (join by `category_id`); the expense also has its own denormalized `name` (defaults to the category name at log time — see `src/pages/api/expenses/index.ts:84`).
- The dashboard (`src/pages/dashboard.astro`) has three action cards; "Report" links to `/report`.
- Auth middleware protects routes by `startsWith` (`src/middleware.ts:18`), so `/report/yearly` and `/report/monthly` are already gated — no middleware change.
- Money: `formatCentsToPln` (`src/lib/money.ts`) — `Intl`-based, browser-safe. Budget year: `getCurrentBudgetYear()` (`src/lib/budget-year.ts`), Warsaw-derived.
- No test runner is configured (per CLAUDE.md); automated verification = `npm run build` + `npm run lint`.

### Key Discoveries:

- **report.ts is pure** (no imports) — safe to import into a React client island. `formatCentsToPln` is `Intl`-based and also browser-safe. The monthly switcher can be a client island that imports both. (`src/lib/report.ts`, `src/lib/money.ts:30`)
- **Warsaw-TZ bucketing is mandatory.** `lessons.md` — any calendar derivation from `expense_at` must use `Europe/Warsaw`, never the host clock (UTC on Workers / arbitrary in the browser). Month bucketing must format `expense_at` with an explicit `timeZone: "Europe/Warsaw"`.
- **Recurring `limit_cents` is already a monthly figure; irregular `limit_cents` is annual** (S-04 renders recurring as "Limit / month", irregular as "Annual limit"). So the monthly view compares recurring spend directly against `limit_cents` and shows irregular/"other" as spend-only.
- **Astro routing**: `src/pages/report.astro` (→ `/report`) coexists with a `src/pages/report/` directory (`yearly.astro` → `/report/yearly`, `monthly.astro` → `/report/monthly`).
- **No new endpoint or RLS surface needed.** The monthly page reuses the report's existing server-side RLS-scoped query (widened to include `id, name, expense_at`) and hands the rows to the island as props — same trust boundary as any SSR page.

## Desired End State

- Dashboard "Report" card → `/report`, which shows two cards: **Monthly** and **Yearly** (cosmic card styling, matching the dashboard).
- `/report/yearly` is the current yearly report, behaving exactly as `/report` does today.
- `/report/monthly` shows a month `<select>` (January → the current Warsaw month of the budget year), defaulting to the current month. For the selected month, expenses are grouped by category:
  - **Recurring** categories: month spend vs the monthly limit, an over/under signal (colour + sign) and burn %, with the month's individual expenses (date, name, amount) nested beneath. Recurring categories are **always listed** so the limit bar is stable month to month, even at zero spend.
  - **Irregular** and **"other"** categories: spend only (no limit/burn), shown **only when they have spend** that month, with expenses nested.
  - Category order: user rows alphabetical, "other" last (`is_system`-then-`name`). Expenses within a category: newest first.
  - Empty month (no spend anywhere): recurring rows show zeroed spend; a friendly "No expenses logged in <month>" line covers the irregular/other absence.

Verify: from the dashboard, Report → Monthly → switch months → each month shows its expenses grouped by category with recurring limits compared; Report → Yearly is unchanged; `npm run build` and `npm run lint` pass.

## What We're NOT Doing

- **No edit or delete** of expenses — that's S-06. This slice is read-only; rows are merely displayed.
- **No new API endpoint** — data is server-rendered into the island via the existing RLS-scoped query.
- **No multi-year / past-year support** — scoped to the current budget year (multi-year is parked in the roadmap).
- **No change to the yearly report's content or math** — it is relocated verbatim, not rewritten.
- **No pagination / virtual scrolling** — single-user, one-year dataset; out of scope.
- **No month switcher on the yearly page** — the two reports are separate.
- **No proration of annual limits to a monthly figure** — irregular categories stay spend-only in the monthly view (a per-month bar for lumpy annual spend would mislead).

## Implementation Approach

Three phases, mirroring the S-04 helper-then-page rhythm and extended with a navigation phase:

1. **Pure aggregation first** — `buildMonthBreakdown` in `report.ts`, testable in isolation, no UI.
2. **Navigation restructure** — turn `/report` into a chooser hub and relocate the yearly report to `/report/yearly`. Self-contained and shippable on its own (no dependency on Phase 1).
3. **The monthly view** — a new static `.astro` shell that loads data server-side and renders a client island consuming the Phase 1 helper.

Phases 1 and 2 are independent and could be done in either order; Phase 3 depends on both.

## Critical Implementation Details

- **Warsaw-TZ month bucketing.** Bucketing `expense_at` into a `YYYY-MM` month key must format with an explicit `timeZone: "Europe/Warsaw"` (e.g. `Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" })`), never the host clock. The island runs in the browser where the local TZ is arbitrary, so this is load-bearing for correctness, not just a Workers concern (`context/foundation/lessons.md` §Timezone convention). The same `Intl` "en-CA" formatter yields a sortable `YYYY-MM` and per-expense date labels.
- **Month range upper bound.** The switcher lists January → the **current Warsaw month** only (no future months), consistent with the yearly report's future-exclusion cutoff and the "date cannot be in the future" rule on logging. Derive the current month server-side from `getCurrentBudgetYear()` + a Warsaw month extraction and pass the option list to the island.

## Phase 1: Monthly breakdown helper

### Overview

Add a pure, UI-free aggregation helper to `src/lib/report.ts` that, given the categories, the year's expenses, and a target month key, returns the per-category grouping the monthly view renders. No page or component changes in this phase.

### Changes Required:

#### 1. Monthly breakdown helper + types

**File**: `src/lib/report.ts`

**Intent**: Add the data shapes and a pure function that buckets the year's expenses into a single month and groups them by category, computing recurring-vs-monthly-limit figures and leaving irregular/"other" as spend-only. Keep it pure so it is reusable by the client island and verifiable by the build.

**Contract**:
- New interface `MonthExpense { id: string; category_id: string; name: string; amount_cents: number; expense_at: string }` (the widened expense row the monthly page will fetch).
- New interfaces for the result: a per-expense row `{ id; name; dateLabel; amountCents }`; a category group `{ id; name; type; isSystem; spentCents; limitCents: number | null; burnPct: number | null; expenses: <row>[] }`; and `MonthBreakdown { groups: <group>[] }`.
- New function `buildMonthBreakdown(categories: ReportCategory[], expenses: MonthExpense[], monthKey: string): MonthBreakdown` where `monthKey` is `"YYYY-MM"`. Behaviour:
  - Bucket each expense by its Warsaw `YYYY-MM` (see Critical Implementation Details) and keep only those matching `monthKey`.
  - Group kept expenses by `category_id`; sum `amount_cents` per category.
  - **Recurring** categories: always emit a group (even with zero spend); `limitCents = limit_cents ?? 0`; `burnPct = limit > 0 ? round(spent/limit*100) : null`.
  - **Irregular** and **system ("other")** categories: emit a group **only if** they have ≥1 expense this month; `limitCents = null`, `burnPct = null`.
  - Sort groups `is_system`-then-`name` (matches existing pages); sort each group's `expenses` by `expense_at` descending; `dateLabel` is the Warsaw-formatted day of `expense_at`.
- Reuses the existing `ReportCategory` interface (`id, name, type, limit_cents, is_system`). No change to `buildReport`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Spot-check `buildMonthBreakdown` against a small hand-made dataset (e.g. in the dev server or a scratch import): an expense dated 2026-06-30 23:30 UTC buckets into Warsaw July (offset proof); a recurring category with no June expense still appears with zeroed spend; an irregular category with no June expense is absent.

---

## Phase 2: Report hub + yearly relocation

### Overview

Turn `/report` into a two-card chooser (Monthly / Yearly) and move the existing yearly report body to `/report/yearly` unchanged. The dashboard's single "Report" card keeps pointing at `/report`. No reporting math changes.

### Changes Required:

#### 1. Relocate the yearly report

**File**: `src/pages/report/yearly.astro` (new — moved from `src/pages/report.astro`)

**Intent**: Move the current yearly report verbatim to the new sub-route so its behaviour is preserved exactly. The "create a category first" link and all aggregation stay as-is.

**Contract**: New route `/report/yearly` renders today's `/report` content (the `buildReport` Monthly/Yearly/other view). No logic change. Title/heading may keep "Report" or read "Yearly report" for clarity.

#### 2. Report chooser hub

**File**: `src/pages/report.astro` (rewritten)

**Intent**: Replace the yearly report body with a small hub page offering two cards, Monthly and Yearly, reusing the dashboard's action-card pattern.

**Contract**: `/report` renders two cards within the standard `Layout` + `Topbar` + `max-w-md` cosmic shell — **Monthly** → `/report/monthly`, **Yearly** → `/report/yearly` — styled like `src/pages/dashboard.astro`'s action cards (icon + title + description). No data fetching required.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Dashboard "Report" card opens `/report`, which shows two cards.
- "Yearly" opens `/report/yearly` and it looks/behaves identical to the pre-change `/report` (same rows, same numbers).
- Unauthenticated access to `/report`, `/report/yearly` redirects to `/auth/signin` (middleware `startsWith` coverage).

---

## Phase 3: Monthly report page + switcher island

### Overview

Add the `/report/monthly` page: a static `.astro` shell that loads categories and the widened year-expense list server-side and renders a new `MonthlyReport` client island. The island holds the selected-month state, renders a month `<select>` (Jan → current Warsaw month), and uses the Phase 1 helper to render category-grouped cards with nested expense rows and recurring-limit comparison.

### Changes Required:

#### 1. Monthly report page shell

**File**: `src/pages/report/monthly.astro` (new)

**Intent**: Server-render the data the island needs and mount it. Reuse the report's existing RLS-scoped query, widened to carry the fields the list needs, and compute the selectable month list and default month server-side (Warsaw-derived).

**Contract**:
- Fetch categories: `id,name,type,limit_cents,is_system` for the current `year`, ordered `is_system` then `name` (same as `report.astro`).
- Fetch expenses for the budget year with the **widened select** `id,category_id,name,amount_cents,expense_at`, keeping the existing `gte` year-start / `lt` next-month cutoff.
- Compute `months`: a list of `{ key: "YYYY-MM", label: "Month YYYY" }` from January through the current Warsaw month (inclusive) of the budget year; `defaultMonth` = current Warsaw month key.
- Render `<MonthlyReport client:load categories={categories} expenses={expenses} months={months} defaultMonth={defaultMonth} />` inside the standard `Layout` + `Topbar` + `max-w-md` shell. Empty-categories state mirrors `report.astro` (link to `/categories`).

#### 2. Monthly report island

**File**: `src/components/report/MonthlyReport.tsx` (new)

**Intent**: Client island that lets the user pick a month and renders that month's category-grouped breakdown. All aggregation delegates to the Phase 1 helper; the component is presentation + the select state.

**Contract**:
- Props: `categories: ReportCategory[]`, `expenses: MonthExpense[]`, `months: { key: string; label: string }[]`, `defaultMonth: string`.
- State: `selectedMonth` (init `defaultMonth`). A `<select>` (or prev/next controls) over `months` drives it.
- Per render: call `buildMonthBreakdown(categories, expenses, selectedMonth)` and render each group as a cosmic card — category name; for recurring, spend vs monthly limit with over/under colour+sign and burn % (reuse the yearly report's red/emerald/amber conventions, `report.astro:91-100`); for irregular/other, spend only. Nested under each: the month's expenses (date label · name · amount via `formatCentsToPln`), newest first.
- Empty selected month: render "No expenses logged in <label>" while still showing the always-present recurring rows at zero.
- Imports `buildMonthBreakdown` + types from `@/lib/report` and `formatCentsToPln` from `@/lib/money`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `/report/monthly` defaults to the current month and lists this month's expenses grouped by category.
- Switching months updates the list and the recurring spend-vs-limit figures correctly.
- A recurring category over its monthly limit reads red/over; under reads emerald/under; burn % shows.
- Irregular and "other" rows appear only in months where they have spend, and show spend with no limit.
- An expense logged late on the last day of a month (near the Warsaw/UTC boundary) appears in the correct month.
- Mobile width (`max-w-md`) renders cleanly; no console errors.

---

## Testing Strategy

### Unit Tests:

- No test runner is configured (CLAUDE.md). `buildMonthBreakdown` is written as a pure function so it *can* be unit-tested later; for now it is verified by build + the manual spot-check in Phase 1.

### Integration Tests:

- None automated. The end-to-end path (dashboard → Report → Monthly → switch month) is covered by manual verification.

### Manual Testing Steps:

1. Sign in; from the dashboard tap **Report** → confirm two cards.
2. Tap **Yearly** → confirm it matches the previous `/report` exactly.
3. Back, tap **Monthly** → confirm current month is selected and shows this month's expenses grouped by category.
4. Switch to a prior month with known expenses → confirm the right expenses, per-category subtotals, and recurring limit comparison.
5. Switch to a month with no expenses → confirm zeroed recurring rows + "No expenses logged" line.
6. Log an expense dated late on a month's final day, then confirm it lands in the correct month in the monthly view.

## Performance Considerations

Single-user, one-budget-year dataset (bounded to the year via the existing query cutoff). The full year's expenses are serialized into the island once; month switching is pure client-side computation over an in-memory array — well within the NFR < 2s budget. No pagination needed at this scale.

## Migration Notes

No data migration. Pure additive routing + UI change. Rollback = restore `src/pages/report.astro` to the yearly body and remove the `src/pages/report/` directory + the island; no schema or data impact.

## References

- Roadmap slice: `context/foundation/roadmap.md` §S-05 (expenses-list, FR-009)
- Yearly report (pattern to mirror + relocate): `src/pages/report.astro`, `src/lib/report.ts`
- Card pattern for the hub: `src/pages/dashboard.astro`
- Lessons: `context/foundation/lessons.md` §Timezone convention (`AT TIME ZONE 'Europe/Warsaw'`)
- Money/year helpers: `src/lib/money.ts`, `src/lib/budget-year.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Monthly breakdown helper

#### Automated

- [x] 1.1 Build passes: `npm run build` — 077521c
- [x] 1.2 Lint passes: `npm run lint` — 077521c

#### Manual

- [ ] 1.3 Spot-check `buildMonthBreakdown` (Warsaw-boundary bucketing; recurring shown at zero; irregular absent when no spend) — superseded: per user request every category is now always listed (irregular no longer hidden); bucketing + recurring-at-zero verified via 3.7/3.3

### Phase 2: Report hub + yearly relocation

#### Automated

- [x] 2.1 Build passes: `npm run build` — 5b70a0a
- [x] 2.2 Lint passes: `npm run lint` — 5b70a0a

#### Manual

- [x] 2.3 Dashboard "Report" → `/report` shows two cards
- [x] 2.4 "Yearly" → `/report/yearly` identical to pre-change `/report` (plus an added "← Reports" back link)
- [x] 2.5 Unauthenticated `/report`, `/report/yearly` redirect to `/auth/signin`

### Phase 3: Monthly report page + switcher island

#### Automated

- [x] 3.1 Build passes: `npm run build` — 5853812
- [x] 3.2 Lint passes: `npm run lint` — 5853812

#### Manual

- [x] 3.3 `/report/monthly` defaults to current month and lists grouped expenses
- [x] 3.4 Switching months updates list + recurring spend-vs-limit correctly
- [x] 3.5 Over/under/burn colour conventions render for recurring rows (burn % replaced by a spending/limit traffic light: over=red, equal=yellow, under=green)
- [ ] 3.6 Irregular & "other" rows appear only with spend, spend-only — superseded: per user request all categories are now always listed (spend-only still holds for irregular/"other")
- [x] 3.7 Month-boundary expense lands in the correct month
- [x] 3.8 Mobile width renders cleanly, no console errors

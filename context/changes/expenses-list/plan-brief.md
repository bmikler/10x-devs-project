# Monthly Report — Expenses-List Drill-Down — Plan Brief

> Full plan: `context/changes/expenses-list/plan.md`

## What & Why

Roadmap slice S-05 (FR-009) — "view previously logged expenses" — delivered as a **monthly report** instead of a flat list. The user wants to see, per month, every expense grouped by category, with recurring-category spend measured against its monthly limit. This also gives S-06 (edit/delete) the per-expense rows it will later hook into.

## Starting Point

`/report` is today's **yearly** report: a static, zero-JS `.astro` page that RLS-loads the year's expenses and aggregates via the pure helper `src/lib/report.ts`. It shows year-level averages/limits per category — no individual expenses, no month breakdown. The dashboard has a single "Report" card pointing at `/report`.

## Desired End State

The dashboard "Report" card opens `/report`, now a **chooser hub** with two cards: **Monthly** and **Yearly**. Yearly is the current report, relocated to `/report/yearly` unchanged. **Monthly** (`/report/monthly`) shows one month at a time via a client-island `<select>` switcher (Jan → current month); the selected month lists its expenses grouped by category, recurring categories compared to their monthly limit (colour + burn %), irregular/"other" shown spend-only.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Delivery shape | Monthly report, not a flat list | User reframed: integrate into reporting as month detail | Plan |
| Navigation | Dashboard "Report" → `/report` hub with Monthly/Yearly cards | One card stays on dashboard; choose at the hub | Plan |
| Yearly report | Relocated verbatim to `/report/yearly` | Keep shipped S-04 view untouched | Plan |
| Monthly rendering | One month at a time + client-island switcher | Compact, focused on a single month | Plan |
| Month layout | Grouped by category; expenses nested under each | Directly answers "spend against limit" per category | Plan |
| Limit basis | Recurring vs monthly limit; irregular/"other" spend-only | Matches data model (recurring limit is monthly, irregular is annual) | Plan |
| Time scope | Current budget year only | Consistent with every other page; multi-year parked | Plan |
| Data delivery | Server widens the existing RLS query, hands rows to the island | No new endpoint/RLS surface; small single-user dataset | Plan |

## Scope

**In scope:** Report chooser hub; relocate yearly to `/report/yearly`; new `/report/monthly` with month switcher; pure `buildMonthBreakdown` helper; category-grouped month view with nested expense rows and recurring-limit comparison.

**Out of scope:** Edit/delete (S-06); new API endpoint; multi-year/past-year; pagination; any change to yearly report math; proration of annual limits to monthly.

## Architecture / Approach

`report.ts` gains a pure `buildMonthBreakdown(categories, expenses, monthKey)` (Warsaw-TZ month bucketing, per-category grouping, recurring-vs-limit math). `/report` becomes a static hub; the yearly body moves to `/report/yearly`. `/report/monthly.astro` reuses the existing server-side RLS query — widened to `id, name, expense_at` — computes the Jan→current month list, and mounts a `MonthlyReport.tsx` client island that holds the selected-month state and renders the helper's output. No new endpoint; middleware already protects `/report/*` via `startsWith`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Monthly breakdown helper | Pure `buildMonthBreakdown` + types in `report.ts` | Warsaw-TZ bucketing must be exact at month boundaries |
| 2. Report hub + yearly relocation | `/report` chooser + `/report/yearly` (verbatim) | Regressing the shipped yearly view during the move |
| 3. Monthly page + switcher island | `/report/monthly` + `MonthlyReport.tsx` | First client JS in the report area; correct per-month limit math |

**Prerequisites:** S-03 shipped (expenses table + log flow). Phases 1 and 2 are independent; Phase 3 needs both.
**Estimated effort:** ~1–2 sessions across 3 small phases (same patterns as the shipped S-04 report).

## Open Risks & Assumptions

- **Warsaw-TZ bucketing in the browser.** The island runs in the user's local timezone, so month bucketing must format `expense_at` with an explicit `Europe/Warsaw` (per `lessons.md`) or boundary expenses land in the wrong month.
- **Assumption:** recurring categories are always shown in the monthly view (stable limit bar even at zero spend); irregular/"other" appear only when they have spend that month. Stated in the plan; revisit if it feels noisy.
- **Assumption:** the switcher excludes future months (Jan → current Warsaw month), matching the yearly report's future-exclusion cutoff.

## Success Criteria (Summary)

- From the dashboard, Report → Monthly → pick any month → see that month's expenses grouped by category with recurring limits compared; Report → Yearly is unchanged.
- A month-boundary expense appears in the correct (Warsaw) month.
- `npm run build` and `npm run lint` pass.

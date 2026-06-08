# Per-Category Report (Monthly / Yearly) — Plan Brief

> Full plan: `context/changes/per-category-report/plan.md`

## What & Why

S-04, the roadmap's north-star slice. A read-only `/report` page that shows the
live delta between the annual plan and actual spend — the thing that proves the
product replaces the Excel workflow. Categories are split by type into a
**Monthly** section (recurring) and a **Yearly** section (irregular + "other"),
each with a burn-rate signal so the user sees where the plan is wrong.

## Starting Point

Schema, RLS, categories (S-02), and expense logging (S-03) are all shipped.
`expense_at` is stored at Warsaw noon, `/report` is already protected in
middleware and already linked from the dashboard hub — but no `report.astro`
exists yet. Money is integer cents everywhere; `formatCentsToPln`,
`getCurrentBudgetYear`, and the cosmic page shell are all reusable.

## Desired End State

Signed in, the user opens `/report` and sees, for the current budget year, a
Monthly section (recurring: avg monthly spend vs monthly limit + over/under delta
+ burn %) and a Yearly section (irregular: year spend vs annual limit + remaining
+ burn %, with system "other" last as spend-only). Overspend reads at a glance
via color + sign. Empty states guide the user to act.

## Key Decisions Made

| Decision                     | Choice                                                        | Why (1 sentence)                                                            | Source |
| ---------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- | ------ |
| Aggregation                  | In TypeScript on the page                                    | No migration; Warsaw-noon storage makes a UTC year-range filter exact.     | Plan   |
| Report layout                | Two sections: Monthly (recurring) / Yearly (irregular)       | Maps directly to the category-type distinction the product is built on.    | Plan   |
| Recurring metric             | Avg monthly = total ÷ elapsed months, vs monthly limit       | Comparable to the per-month limit the user set.                            | Plan   |
| Recurring row                | avg / limit + delta (negative allowed) + burn %; no year-rem | User wants to see how much they overspend *per month*.                      | Plan   |
| Irregular row                | spent / limit + remaining (negative) + burn %                | Annual pots are a single cumulative figure vs the year budget.             | Plan   |
| Burn %                       | recurring avg÷limit; irregular spent÷limit                   | Simple, direct "% of budget consumed"; no time proration.                  | Plan   |
| Elapsed basis                | Whole Warsaw months, current month inclusive                 | Integer, stable, matches "average monthly".                                | Plan   |
| "other" row                  | End of Yearly section, spent only                            | It has no budget (limit NULL) — remaining/burn are undefined.              | Plan   |
| Page type                    | Static `.astro`, zero JS                                     | Read-only view; matches CLAUDE.md "React only where interactive".          | Plan   |
| Overspend UX                 | Color + sign, no new components                              | Glanceable, consistent with existing cards, no extra primitives.           | Plan   |
| Month switcher               | Cut                                                          | Considered then withdrawn by the user — average doesn't need navigation.   | Plan   |

## Scope

**In scope:** a static `/report` page; a pure aggregation helper; two sections;
overspend coloring; empty/partial states.

**Out of scope:** any migration/RPC; React island; month/year switcher;
multi-year; grouped-"other" breakdown; sorting/filtering; progress bars.

## Architecture / Approach

Two files. `src/lib/report.ts` is a pure helper: `buildReport(categories,
expenses, elapsedMonths)` → `{ monthly[], yearly[], other }` view model holding
all per-type math. `src/pages/report.astro` does I/O only: fetch the year's
categories + expenses (UTC year-range filter on `expense_at`), compute elapsed
Warsaw months, call the helper, render the two sections in the existing cosmic
shell. No client JS.

## Phases at a Glance

| Phase                      | What it delivers                          | Key risk                                            |
| -------------------------- | ----------------------------------------- | --------------------------------------------------- |
| 1. Aggregation helper      | `report.ts` with the full view-model math | The roll-up math is the slice's core correctness.   |
| 2. Report page             | `report.astro` rendering both sections    | Year-range filter correctness; mobile layout.       |

**Prerequisites:** F-01, S-02, S-03 — all shipped.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- **FR-011 narrowing:** recurring rows show a *monthly* delta, not a
  year-remaining figure — a conscious, user-approved deviation from the FR's
  literal wording (year-remaining is kept in the Yearly section only).
- Irregular burn % is not time-prorated (`spent ÷ year-limit`); reads low
  early-year, by design.
- Recurring average counts the current partial month as whole.
- Year-range filter correctness depends on the Warsaw-noon `expense_at`
  invariant — don't change one without the other.

## Success Criteria (Summary)

- The user opens `/report` and sees correct Monthly and Yearly sections for the
  current year, matching a hand-check of the data.
- Overspend (negative delta/remaining, burn % > 100) is visually obvious.
- Empty and no-expense states are handled gracefully; the page is usable
  one-handed at 320px and paints within the < 2s NFR.

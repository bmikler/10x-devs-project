# Log Expense from Phone — Plan Brief

> Full plan: `context/changes/log-expense-from-phone/plan.md`

## What & Why

Build the mobile-first expense logging page (S-03) — the feature that proves the MVP's core thesis: logging an expense from a phone takes seconds, not a struggle with a spreadsheet grid. This is the PRD's primary use case (US-01) and the 10-second secondary success criterion lives here.

## Starting Point

The `expenses` DB table, RLS policies, and indexes are shipped (F-01). Categories with system "other" are working (S-02). Auth, middleware, dashboard hub link, and protected route are all in place (S-01). No expense-related application code exists yet — the feature is greenfield within a well-established pattern.

## Desired End State

A signed-in user on their phone opens `/expenses`, sees a compact form with a tappable category grid ("other" pre-selected), an amount input with a decimal keyboard, a name field that auto-updates from the selected category, and a native date picker defaulting to today. Tapping Save logs the expense in under 2 seconds and shows a green success banner. The form resets for the next expense.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Post-save behaviour | Stay on form, reset + success banner | Optimises for batch-logging (multiple expenses after a trip). |
| Category selection UX | Tappable button grid | Large tap targets, visible at a glance, matches existing type-toggle pattern. |
| Default category | Pre-select "other" | Fastest path to submit — user can always re-pick. |
| Date input | Native `input[type="date"]` prefilled today | Zero JS overhead, OS-native mobile picker. |
| Name field | Visible text input, prefilled from category | Lets user add detail like "McDonalds" under Food; populates v1.1 grouped report. |
| Amount input | Text with `inputmode="decimal"` | Consistent with `parsePlnToCents` pattern; decimal keyboard on mobile. |
| Success feedback | Green banner, auto-dismiss ~4s | Simple, no extra components; re-uses Banner pattern. |
| Category grid scaling | Show all, scroll if needed | Works for MVP's <15 categories; sort-by-usage is a post-MVP improvement. |

## Scope

**In scope:**
- `POST /api/expenses` API route with server-side validation
- `/expenses` Astro page with React island form
- Category button grid, amount input, name field, date picker
- Client-side validation (amount required, > 0)
- Success banner with auto-dismiss
- Form reset after successful save

**Out of scope:**
- Expense list view (S-05), edit/delete (S-06)
- Per-category report (S-04)
- Category sort by usage frequency
- Custom date picker, offline support, receipt upload

## Architecture / Approach

Same Astro SSR + React island pattern as categories: the `.astro` page fetches the user's categories server-side and passes them as props to `ExpenseForm.tsx` (a `client:load` island). The form POSTs natively to `/api/expenses/index.ts`, which validates, inserts into the DB, and redirects back with `?success=1` or `?error=...`. No client-side fetch, no JSON API — progressive enhancement with the established pattern.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. API Route + Expense Helpers | `POST /api/expenses` — validates, inserts, redirects | Category ownership validation must be explicit (RLS is a backstop, not user-facing) |
| 2. Expense Form Page + Island | `/expenses` page + `ExpenseForm.tsx` with category grid, inputs, success feedback | 10-second mobile target — form must feel fast with no unnecessary fields or loading |

**Prerequisites:** F-01 (data layer), S-01 (auth shell), S-02 (categories) — all shipped.
**Estimated effort:** ~1 evening session across 2 phases.

## Open Risks & Assumptions

- The button grid works well for <15 categories; users with many more may need a different UI (post-MVP).
- The 10-second target assumes the user is already signed in and the Cloudflare Worker cold-start is minimal.
- `expense_at` is stored as noon Warsaw time from the selected date to avoid date-boundary drift — this is a simplification that works for a single-timezone user.

## Success Criteria (Summary)

- User can log an expense from a phone in under 10 seconds (cold start, already signed in)
- Expense row appears in the DB with correct category, amount, name, and date
- Form resets and shows a success banner, ready for the next expense

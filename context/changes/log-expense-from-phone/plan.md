# Log Expense from Phone — Implementation Plan

## Overview

Build the mobile-first expense logging flow (S-03): a single `/expenses` page with a React island form that lets a signed-in user enter an amount, pick a category from a tappable button grid, optionally override the date (defaults to today) and a short name (prefilled from the selected category), and save via `POST /api/expenses`. The form stays on the page after save, resets, and shows a brief success banner — optimised for batch-logging from a phone.

## Current State Analysis

- **DB layer (F-01):** `expenses` table exists with `id, user_id, category_id (NOT NULL FK→categories), name (NOT NULL), amount_cents (BIGINT >0), expense_at (TIMESTAMPTZ), created_at`. RLS policy `expenses_owner_all` enforces per-user isolation. Indexes on `(user_id, expense_at)` and `category_id`.
- **Categories (S-02):** shipped — users can create categories; system "other" is auto-seeded per `(user, year)`. Category query pattern: `supabase.from("categories").select("id,name,type,limit_cents,is_system").eq("year", year).order(...)`.
- **Middleware (S-01):** `/expenses` is already in `PROTECTED_ROUTES` — auth is enforced.
- **Dashboard (S-01):** already links to `/expenses` ("💸 Log expense").
- **Shared utilities:** `parsePlnToCents`, `formatCentsToPln`, `getCurrentBudgetYear`, `createClient`, `FormField`, `ServerError`, `SubmitButton` — all reusable.
- **No expense code exists yet** — greenfield within a well-established pattern.

### Key Discoveries:

- The form → POST → redirect pattern from categories is the template: React island with client validation, `<form method="POST" action="/api/expenses">`, server validates again, redirects with `?error=` or `?success=1`.
- `category_id` is `NOT NULL` in the DB — the "other" fallback must resolve to the actual system category's UUID, not null.
- `name` is `NOT NULL CHECK(length(trim(name)) > 0)` — it cannot be empty. The form prefills it from the selected category's name; the server must also enforce a fallback if somehow blank.
- `expense_at` defaults to `now()` in the DB, but we'll set it explicitly from the user-chosen date to support backdating. The lessons-learned timezone convention (`AT TIME ZONE 'Europe/Warsaw'`) applies to queries, not to inserts — we store a `TIMESTAMPTZ` constructed from the date string.
- `amount_cents` has `CHECK (amount_cents > 0)` — zero/negative values fail at DB level; validate in app code first for a friendly error.

## Desired End State

A signed-in user with at least one category can navigate to `/expenses` on their phone, see a compact form with:
1. A tappable category button grid (system "other" pre-selected) — tapping a category updates the name field
2. An amount input with decimal keyboard (`inputmode="decimal"`)
3. A visible name field (prefilled from category, editable)
4. A native date picker (prefilled to today in Warsaw TZ)
5. A save button

On submit: client validates (amount required, > 0); server validates, inserts into `expenses`, redirects to `/expenses?success=1`. The page renders a green success banner that auto-dismisses after ~4 seconds, and the form resets with "other" re-selected and today's date.

**Verification:** Open `/expenses` on a phone emulator or real device. Log an expense. Confirm the row appears in the `expenses` table via Supabase Studio. Confirm the success banner shows and the form resets. Confirm the 10-second target is achievable (cold start → confirmation).

## What We're NOT Doing

- Expense list view (S-05) or edit/delete (S-06) — separate slices.
- Per-category report (S-04) — separate slice.
- Custom date picker component — using native `input[type="date"]`.
- Category sorting by usage frequency — post-MVP improvement (noted).
- Offline/service-worker support — not in scope.
- Receipt photo upload or OCR.

## Implementation Approach

Follow the established Astro SSR + React island pattern from S-02 (categories):

1. **Phase 1** creates the API route (`POST /api/expenses/index.ts`) — server-side validation, DB insert, redirect. This is independently testable via `curl`/Postman.
2. **Phase 2** creates the page (`expenses.astro`) and form island (`ExpenseForm.tsx`) — category grid, amount/name/date inputs, client validation, success/error rendering.

The form posts to the API route; the API redirects back to the page. No JSON fetch, no client-side routing — the same progressive-enhancement pattern that categories use.

## Phase 1: API Route + Expense Helpers

### Overview

Create the `POST /api/expenses` endpoint that validates the submitted form data, inserts a row into the `expenses` table, and redirects back to `/expenses` with a success or error query param.

### Changes Required:

#### 1. Expense API route

**File**: `src/pages/api/expenses/index.ts`

**Intent**: Handle `POST` requests from the expense form. Validate `amount` (via `parsePlnToCents`), `category_id` (must be a UUID belonging to the current user for the current budget year), `name` (non-empty, fallback to category name if blank), and `date` (valid date string, default to today in Warsaw TZ). Insert a row into `expenses` and redirect to `/expenses?success=1`. On validation failure, redirect to `/expenses?error=<message>`.

**Contract**: Exports `POST: APIRoute`. Reads form fields: `amount` (string), `category_id` (string — UUID), `name` (string, optional), `date` (string, optional — `YYYY-MM-DD`). Redirects on success/error. The `category_id` is verified against the user's categories for the current year before insert — this prevents a user from submitting a category_id they don't own (RLS would also block this, but an explicit check gives a user-friendly error). The `expense_at` field is constructed as a `TIMESTAMPTZ` from the date string at noon Warsaw time to avoid date-boundary issues.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`
- Types check: `npx astro check` (if available) or build implicitly validates

#### Manual Verification:

- `curl -X POST` to `/api/expenses` with valid form data returns a 302 redirect to `/expenses?success=1`
- Verify the inserted row in Supabase Studio has correct `user_id`, `category_id`, `name`, `amount_cents`, `expense_at`
- Submit with missing amount → redirects with `?error=` containing a descriptive message
- Submit with an invalid `category_id` → redirects with an error, no row inserted

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Expense Form Page + Island

### Overview

Create the `/expenses` Astro page and `ExpenseForm.tsx` React island — the user-facing form with a category button grid, amount input, name field, date picker, client-side validation, and success/error feedback.

### Changes Required:

#### 1. Expense form React island

**File**: `src/components/expenses/ExpenseForm.tsx`

**Intent**: A React island that renders the expense logging form. Categories are passed as props (fetched server-side in the `.astro` page). The form displays a tappable button grid of categories (system "other" pre-selected by default), an amount text input with `inputmode="decimal"`, a visible name field that auto-updates when a category is tapped (prefilled with the selected category's name, user-editable), a native date input prefilled with today (Warsaw TZ), and a submit button. Client-side validation: amount is required and must be a valid positive PLN value (reuse `parsePlnToCents`). On submit, the form POSTs to `/api/expenses`.

**Contract**: Props: `categories: Array<{ id: string; name: string; is_system: boolean }>`, `today: string` (YYYY-MM-DD, computed in `.astro` from Warsaw TZ), `serverError?: string | null`, `success?: boolean`. Renders `<form method="POST" action="/api/expenses">`. Hidden inputs for `category_id` and `date`. The success banner auto-dismisses after ~4 seconds using a `useEffect` timer. Form resets (amount cleared, name repopulated to "other", category re-selected to "other") after successful save. The button grid uses the same visual pattern as the type toggle in `CategoryForm.tsx` — `border-purple-400 bg-purple-500/30` for selected, `border-white/20 bg-white/10` for unselected.

#### 2. Expenses page

**File**: `src/pages/expenses.astro`

**Intent**: SSR page that fetches the user's categories for the current budget year and renders the `ExpenseForm` island. Reads `?error` and `?success` query params from the URL and passes them to the island.

**Contract**: Fetches categories via `supabase.from("categories").select("id,name,is_system").eq("year", year).order("is_system", { ascending: true }).order("name", { ascending: true })`. Computes `today` as a `YYYY-MM-DD` string in Warsaw TZ. Passes `categories`, `today`, `serverError`, and `success` to `<ExpenseForm client:load />`. Page layout matches the categories page: `bg-cosmic`, `max-w-md mx-auto`, `Topbar`, heading.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Open `/expenses` on a phone (or Chrome DevTools mobile emulator) — form is usable one-handed, tap targets are large enough
- "other" is pre-selected on load; tapping a category highlights it and updates the name field
- Amount field shows a decimal keyboard on mobile (`inputmode="decimal"`)
- Date field defaults to today; can be changed to a past date
- Submit with valid data → green success banner appears, form resets, name field shows "other" again
- Success banner auto-dismisses after ~4 seconds
- Submit with empty amount → inline error on the amount field, form doesn't submit
- Submit with amount "0" or "-5" → inline error
- End-to-end: from app icon to saved confirmation < 10 seconds (assuming already signed in)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- No test runner configured (per CLAUDE.md). Validation logic reuses `parsePlnToCents` which is already battle-tested from categories.

### Manual Testing Steps:

1. Sign in on a phone browser, navigate to `/expenses`
2. Verify "other" is pre-selected, name says "other", date is today
3. Tap a user category — name field updates to that category's name
4. Enter an amount (e.g. "42.50"), tap Save
5. Verify green banner appears, form resets to "other" + today + empty amount
6. Check Supabase Studio: row exists with correct `category_id`, `name`, `amount_cents=4250`, `expense_at` in the right date
7. Submit without amount — client error shown, no network request
8. Time the flow: app icon → saved confirmation — target < 10 seconds

## Performance Considerations

- The form uses native `<form method="POST">` — no client-side fetch overhead.
- Categories are fetched server-side (one DB query per page load); the React island receives them as props. No client-side data fetching.
- The button grid renders all categories — acceptable for MVP's expected <15 categories. Post-MVP: sort by usage frequency.
- `inputmode="decimal"` ensures the numeric keyboard on mobile, reducing tap count.

## References

- Categories pattern: `src/pages/categories.astro`, `src/components/categories/CategoryForm.tsx`, `src/pages/api/categories/index.ts`
- Money utilities: `src/lib/money.ts`
- Budget year: `src/lib/budget-year.ts`
- DB schema: `supabase/migrations/20260528132105_create_budget_schema.sql`
- Lessons learned: `context/foundation/lessons.md` (timezone convention, seeding convention, layer-split principle)
- Roadmap: `context/foundation/roadmap.md` (S-03)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: API Route + Expense Helpers

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Build succeeds: `npm run build`

#### Manual

- [ ] 1.3 POST with valid data returns 302 to `/expenses?success=1` and row appears in Supabase
- [ ] 1.4 POST with missing/invalid amount returns redirect with error
- [ ] 1.5 POST with invalid category_id returns redirect with error

### Phase 2: Expense Form Page + Island

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Build succeeds: `npm run build`

#### Manual

- [ ] 2.3 Form is usable one-handed on mobile; tap targets are large
- [ ] 2.4 "other" pre-selected; tapping category updates name field
- [ ] 2.5 Amount field shows decimal keyboard on mobile
- [ ] 2.6 Date defaults to today; changeable
- [ ] 2.7 Valid submit → success banner + form reset
- [ ] 2.8 Success banner auto-dismisses after ~4 seconds
- [ ] 2.9 Empty/invalid amount → inline error, no submit
- [ ] 2.10 End-to-end: app icon → saved confirmation < 10 seconds

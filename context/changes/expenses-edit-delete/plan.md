# Expenses — Edit and Delete Implementation Plan

## Overview

Deliver roadmap slice **S-06 (FR-010)**: let a signed-in user edit any field of a previously logged expense (amount, category, name, date) or delete it outright. The edit/delete affordances hook into the **existing monthly-report rows** (the only place expenses are listed today — built for this purpose by S-05). Editing happens on a dedicated `/expenses/[id]/edit` page that reuses the create form. Delete is a **hard delete** guarded by an **explicit confirmation step**. Both mutations are sent as **native POST forms** (consistent with the shipped create flow), with a roadmap follow-up to refactor the expense mutation API to true REST (PUT/DELETE) later.

## Current State Analysis

- **Expenses are surfaced in exactly one place**: the monthly report island `src/components/report/MonthlyReport.tsx:148-162`, as collapsible rows (`date · name · amount`) nested under each category. The rows are **non-interactive** today.
- **Create flow to mirror**: `ExpenseForm.tsx` (a `client:load` island) renders a native `<form method="POST" action="/api/expenses">`; `src/pages/api/expenses/index.ts` (`POST`) validates server-side and `context.redirect`s with `?success=1` / `?error=<msg>`. **No client-side fetch, no JSON** — pure progressive enhancement.
- **No mutation-by-id surface exists**: there is no `src/pages/api/expenses/[id].ts` and no `/expenses/[id]/edit` page. Validation is **inline** (no zod).
- **Ownership** is enforced by RLS (`expenses_owner_all`, `FOR ALL` with `USING` + `WITH CHECK`); the create route additionally does an explicit category-ownership lookup to produce a friendly error.
- **Auth wiring**: middleware (`src/middleware.ts:4,18`) protects by `startsWith` over `["/dashboard","/categories","/expenses","/report"]`. So `/expenses/[id]/edit` is already protected by the `/expenses` prefix, but `/api/expenses/[id]` is **not** (it starts with `/api`) — the API route must self-check `context.locals.user`, exactly like the create route.
- **Helper duplication**: `todayInWarsaw()` is copy-pasted in both `src/pages/expenses.astro:14` and `src/pages/api/expenses/index.ts:10`; `warsawNoon()` and the date validation live only in the create route (not exported).
- **Deploy target is Cloudflare Workers** — no Node-only APIs in request-reachable code.

## Desired End State

From `/report/monthly`, the user expands a category, and every expense row shows an **Edit** link and a **Delete** control. Edit opens `/expenses/[id]/edit` — the same form they know from logging, prefilled with the expense's amount, category, name, and date; saving updates the row and returns them to the monthly report with a success banner. Delete asks for confirmation inline; confirming permanently removes the row and returns them to the monthly report with a success banner. Invalid edits (bad amount/date, missing category) bounce back to the edit page with an error message. A non-existent or non-owned id shows a friendly "not found" on the edit page.

**Verification**: editing an expense's amount/category/date changes the value seen in the monthly report and the yearly report aggregates; deleting an expense removes it from both; a malformed edit shows an error and changes nothing; `npm run build` and `npm run lint` pass.

### Key Discoveries:

- Monthly report row render site: `src/components/report/MonthlyReport.tsx:151-160` (has `expense.id` in scope already).
- Create form is the reuse target: `src/components/expenses/ExpenseForm.tsx:22` (default export, `Props { categories, today, serverError, success }`).
- Create route validation pattern to mirror for update: `src/pages/api/expenses/index.ts:58-110` (amount → `parsePlnToCents`, category ownership lookup, date format + future-date guard, `warsawNoon` for `expense_at`).
- Monthly page query already loads the rows: `src/pages/report/monthly.astro:64-69`.
- Middleware is prefix-based: `src/middleware.ts:18` — new page route inherits protection; new API route must self-check.

## What We're NOT Doing

- **No soft delete** — no `deleted_at` column, no migration, no "trash"/restore UI. Hard delete only.
- **No flat `/expenses/list` page** — edit/delete live on the monthly-report rows; the report *is* the list.
- **No inline or modal editing** — edit is a dedicated page.
- **No true REST (PUT/DELETE) transport now** — native POST forms; REST refactor is a tracked roadmap follow-up.
- **No client-side fetch / optimistic UI** — keep the no-JS-fetch convention.
- **No multi-year handling** — current budget year only, like every other page.
- **No schema/migration changes** — the existing `expenses` table and RLS already permit `UPDATE` and `DELETE` for the owner.
- **No undo banner** — confirmation, not undo, is the safety net.

## Implementation Approach

Three phases, back-to-front. Phase 1 builds the server mutation surface (`POST /api/expenses/[id]`) and extracts the shared date/validation helpers so update reuses one source of truth rather than a third copy. Phase 2 generalizes `ExpenseForm` to be mode-aware (backward-compatible defaults keep the create page untouched) and adds the prefilled edit page. Phase 3 wires the Edit link and Delete-with-confirm into the monthly-report rows, surfaces a success/error banner on `/report/monthly`, and records the REST refactor in the roadmap. Phase 3 depends on 1 and 2; Phases 1 and 2 can be built independently.

## Critical Implementation Details

- **Single route, two intents.** `POST /api/expenses/[id]` handles both update and delete, discriminated by a hidden `intent` form field (`delete` → delete; anything else → update). This keeps ownership/validation in one place and mirrors the single-file create route. The `intent` field is the seam the future REST refactor removes (update → `PUT`, delete → `DELETE`).
- **API route self-auths.** `/api/expenses/[id]` is outside the middleware's protected prefixes, so it must check `context.locals.user` and bail to `/auth/signin` like `index.ts:47-50`. RLS is the backstop, not the gate.
- **Redirect targets differ by origin.** Update success/failure → return to the edit page on error (`/expenses/[id]/edit?error=…`) and to `/report/monthly?success=updated` on success. Delete → `/report/monthly?success=deleted` (success) or `/report/monthly?error=…` (failure), since the delete form originates on the report page and there is no edit page to return to.
- **Date semantics reuse.** Editing the date must go through the same `warsawNoon()` conversion and future-date guard as create, or an edited expense's `expense_at` will drift from the create convention (noon Warsaw). This is the reason the helpers are extracted in Phase 1 rather than re-implemented.

## Phase 1: Shared Write Helpers + Mutation API

### Overview

Extract the expense date/validation helpers into one shared module, then add the by-id mutation endpoint that updates or deletes an expense.

### Changes Required:

#### 1. Shared expense-write helpers

**File**: `src/lib/expense-write.ts` (new)

**Intent**: Provide one home for the Warsaw-date helpers and amount/date validation currently duplicated/locked inside the create route, so both create and update use the same logic. Keep functions pure and Workers-safe (no Node APIs).

**Contract**: Export `todayInWarsaw(): string`, `warsawNoon(dateStr: string): string`, and a `validateExpenseInput(form)`-style helper (or discrete validators) returning either parsed `{ amountCents, name, expenseAt }` or `{ error: string }`. Move the existing bodies verbatim from `src/pages/api/expenses/index.ts:10-39,58-99`. No behavior change.

#### 2. Create route reuses the shared helpers

**File**: `src/pages/api/expenses/index.ts`

**Intent**: Replace the now-extracted inline helpers with imports from `@/lib/expense-write` so there is a single source of truth. Pure refactor — the create flow's behavior and redirects are unchanged.

**Contract**: Import `todayInWarsaw`/`warsawNoon`/validation from the new module; delete the local copies. Existing `POST` response contract (`/expenses?success=1` / `?error=`) stays identical.

#### 3. By-id mutation endpoint

**File**: `src/pages/api/expenses/[id].ts` (new)

**Intent**: Add `POST` handling both update and delete for a single expense, scoped to the signed-in user. Branch on a hidden `intent` field: `delete` removes the row; otherwise validate-and-update.

**Contract**:
- `export const POST: APIRoute`. Read `context.params.id`; self-check `context.locals.user` (redirect `/auth/signin` if absent); guard missing Supabase.
- **Delete branch** (`intent === "delete"`): `supabase.from("expenses").delete().eq("id", id)` (RLS scopes to owner). On error → redirect `/report/monthly?error=<msg>`; on success → `/report/monthly?success=deleted`.
- **Update branch**: same validation as create — `parsePlnToCents(amount)`, explicit current-year category-ownership lookup, date format + future-date guard, `warsawNoon(date)` for `expense_at`, name fallback to category name. Then `supabase.from("expenses").update({ category_id, name, amount_cents, expense_at }).eq("id", id)`. On validation/DB error → redirect back to `/expenses/${id}/edit?error=<msg>`; on success → `/report/monthly?success=updated`.
- Ownership: rely on RLS for the write; the explicit category lookup mirrors `index.ts:73-81` for a friendly error. A no-op update (id not owned) is acceptable — RLS yields zero rows; treat as success or surface a generic error consistently.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `POST /api/expenses/[id]` with a valid amount/category/date updates the row and redirects to `/report/monthly?success=updated`.
- `POST /api/expenses/[id]` with `intent=delete` removes the row and redirects to `/report/monthly?success=deleted`.
- An invalid amount/date redirects to `/expenses/[id]/edit?error=…` and leaves the row unchanged.
- Logging a new expense (unchanged create flow) still works end-to-end.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Edit Page + Form Generalization

### Overview

Make the create form reusable for editing, then add the prefilled edit page.

### Changes Required:

#### 1. Mode-aware ExpenseForm

**File**: `src/components/expenses/ExpenseForm.tsx`

**Intent**: Generalize the form so it serves both create and edit without duplicating ~190 lines. Add optional props with defaults that preserve the exact current create behavior, so `src/pages/expenses.astro` needs no change.

**Contract**: Extend `Props` with optional `action?: string` (default `"/api/expenses"`), `initial?: { categoryId; amount; name; date }` (default current "other"/empty seed), and `submitLabel?: string` (default `"Save expense"`). Initialize the `useState` seeds from `initial` when provided. The form's `action` attribute uses the prop. No change to validation, category grid, or success-banner logic.

#### 2. Edit page

**File**: `src/pages/expenses/[id]/edit.astro` (new)

**Intent**: Server-load the target expense and the current-year categories, then render the generalized `ExpenseForm` prefilled for editing. Handle the not-found / not-owned case with a friendly message rather than a crash.

**Contract**:
- Read `Astro.params.id` and `Astro.url.searchParams` (`error`). Create the Supabase client; if no `user`, the middleware already redirected.
- Fetch the expense: `supabase.from("expenses").select("id,category_id,name,amount_cents,expense_at").eq("id", id).single()`. If missing → render a "Expense not found" card with a link back to `/report/monthly` (do not mount the form).
- Fetch current-year categories with the same query as `expenses.astro:35-41`.
- Derive `initial`: `categoryId = expense.category_id`; `amount` = expense amount formatted as a plain decimal string the amount input accepts (e.g. cents→`"42.50"`); `name = expense.name`; `date` = `expense_at` rendered as `YYYY-MM-DD` in Warsaw TZ.
- Mount `<ExpenseForm client:load categories={…} today={today} initial={…} action={`/api/expenses/${id}`} submitLabel="Update expense" serverError={error} />`.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- `/expenses/[valid-id]/edit` shows the form prefilled with the expense's current amount, category, name, and date.
- Changing values and submitting updates the expense and lands on `/report/monthly` with a success banner.
- `/expenses/[bogus-id]/edit` shows the "not found" card, not an error page.
- The create page (`/expenses`) still renders and logs expenses unchanged (no regression from the prop generalization).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Wire Affordances into the Monthly Report + Roadmap Note

### Overview

Add Edit and Delete controls to each expense row, show a result banner on the monthly page, and record the REST follow-up.

### Changes Required:

#### 1. Row-level edit link + delete-with-confirm

**File**: `src/components/report/MonthlyReport.tsx`

**Intent**: Turn each expense row into an actionable item: an Edit link to the edit page, and a Delete control that requires an inline confirmation before POSTing the hard delete. Keep the row's `date · name · amount` layout intact; the controls sit alongside.

**Contract**:
- Per-row Edit: an `<a href={`/expenses/${expense.id}/edit`}>` styled as an icon/text affordance.
- Per-row Delete: local island state tracks which row is "confirming" (e.g. `confirmingId: string | null`). First tap reveals a confirm/cancel pair; confirming submits a native `<form method="POST" action={`/api/expenses/${expense.id}`}>` containing `<input type="hidden" name="intent" value="delete">` and the submit button. No client fetch.
- The row already has `expense.id` in scope (`MonthlyReport.tsx:151-153`); no prop/shape changes to `MonthExpense` needed.

#### 2. Result banner on the monthly page

**File**: `src/pages/report/monthly.astro`

**Intent**: Surface the post-mutation outcome when the user is redirected back with `?success=updated|deleted` or `?error=…`. Render server-side above the island (no island prop change needed for the banner).

**Contract**: Read `Astro.url.searchParams` for `success`/`error`; render a green success banner ("Expense updated"/"Expense deleted") or a red error banner accordingly, reusing the existing banner styling from the create form.

#### 3. Roadmap follow-up note

**File**: `context/foundation/roadmap.md`

**Intent**: Record the deliberate tech-debt decision to ship POST-form mutations now and refactor the expense mutation API to true REST (PUT/DELETE) later, so it isn't lost.

**Contract**: Under the S-06 section (near `roadmap.md:158-168`), add a short follow-up/tech-debt line: expense mutations currently use `POST /api/expenses/[id]` with an `intent` discriminator for progressive enhancement; a future refactor should split this into `PUT /api/expenses/[id]` (update) and `DELETE /api/expenses/[id]` (delete). Do not edit anything inside the `10x-cli`-managed markers.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Each expense row in `/report/monthly` shows Edit and Delete controls.
- Edit navigates to the prefilled edit page; saving returns with an "updated" banner and the new value is visible.
- Delete asks for confirmation; cancelling does nothing; confirming removes the row and returns with a "deleted" banner.
- The deleted/edited expense is reflected in the yearly report aggregates too.
- Roadmap S-06 section carries the REST-refactor follow-up note.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation. This is the final phase.

---

## Testing Strategy

> No test runner is configured in this repo (per CLAUDE.md). Verification is build + lint + manual exercise of the app.

### Manual Testing Steps:

1. Log a fresh expense, open `/report/monthly`, expand its category — confirm Edit/Delete controls appear on the row.
2. Edit the amount → save → confirm the monthly report shows the new amount and the "updated" banner.
3. Edit the **category** of an expense → save → confirm it now appears under the new category group and the old group's total dropped.
4. Edit the **date** to a different (past) month → confirm it moves to that month in the switcher (Warsaw-TZ bucketing).
5. Attempt to save an invalid amount (`abc`, `-5`, `0`) and a future date → confirm an error banner and no change.
6. Delete an expense: tap delete → cancel (nothing happens) → tap delete → confirm → row gone, "deleted" banner, gone from yearly report too.
7. Visit `/expenses/<bogus-id>/edit` → confirm the friendly "not found" card.
8. Sign out, hit `/expenses/<id>/edit` and `POST /api/expenses/<id>` → confirm redirect to `/auth/signin`.

## Performance Considerations

Single-row mutations on a single-user dataset — no performance concern. The monthly page query is unchanged.

## Migration Notes

None. Hard delete and update use the existing `expenses` table and RLS policy; no schema change.

## References

- Roadmap slice: `context/foundation/roadmap.md:158-168` (S-06), PRD `FR-010` (`context/foundation/prd.md:214`)
- Create flow to mirror: `src/pages/api/expenses/index.ts`, `src/components/expenses/ExpenseForm.tsx`, `src/pages/expenses.astro`
- Row render site: `src/components/report/MonthlyReport.tsx:151-160`; monthly page: `src/pages/report/monthly.astro`
- Lessons: `context/foundation/lessons.md` (Warsaw-TZ convention, RLS shape)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared Write Helpers + Mutation API

#### Automated

- [x] 1.1 Build passes: `npm run build` — a9b74cf
- [x] 1.2 Lint passes: `npm run lint` — a9b74cf

#### Manual

- [x] 1.3 Update via `POST /api/expenses/[id]` changes the row and redirects to `/report/monthly?success=updated`
- [x] 1.4 Delete via `intent=delete` removes the row and redirects to `/report/monthly?success=deleted`
- [x] 1.5 Invalid amount/date redirects to `/expenses/[id]/edit?error=…` and leaves the row unchanged
- [x] 1.6 Existing create flow still works end-to-end

### Phase 2: Edit Page + Form Generalization

#### Automated

- [x] 2.1 Build passes: `npm run build` — c40b128
- [x] 2.2 Lint passes: `npm run lint` — c40b128

#### Manual

- [x] 2.3 Edit page shows the form prefilled with the expense's current values
- [x] 2.4 Editing and submitting updates the expense and lands on `/report/monthly` with a success banner
- [x] 2.5 Bogus id shows the friendly "not found" card
- [x] 2.6 Create page still renders and logs expenses unchanged

### Phase 3: Wire Affordances into the Monthly Report + Roadmap Note

#### Automated

- [x] 3.1 Build passes: `npm run build`
- [x] 3.2 Lint passes: `npm run lint`

#### Manual

- [x] 3.3 Each expense row shows Edit and Delete controls
- [x] 3.4 Edit round-trips with an "updated" banner and the new value is visible
- [x] 3.5 Delete requires confirmation; cancel is a no-op; confirm removes the row with a "deleted" banner
- [x] 3.6 Edited/deleted expense is reflected in the yearly report too
- [x] 3.7 Roadmap S-06 section carries the REST-refactor follow-up note

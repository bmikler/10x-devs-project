# Categories Edit & Delete Implementation Plan

## Overview

Let users **edit** and **delete** their own budget categories from the `/categories` page. Editing changes a category's name, type, and limit inline; deleting removes a user category and (via an existing DB trigger) reassigns its expenses to the per-year system `other` category. The system `other` row stays read-only. This is an **API + UI change only** — the database already enforces every invariant this feature needs.

## Current State Analysis

The categories page today is **list + create only**:

- **List** — `src/pages/categories.astro:24-87` fetches the user's categories for the current budget year (RLS-scoped, ordered `is_system ASC, name ASC`) and renders them as a **static `<ul>`** with no actions. The system `other` row renders as an amber, auto-managed card.
- **Create** — `src/components/categories/CategoryForm.tsx` is a `client:load` island that validates name/type/limit client-side and `POST`s a native HTML form to `/api/categories`. `src/pages/api/categories/index.ts` mirrors that validation server-side, inserts the user row, idempotently seeds the system `other` row, and redirects to `/categories` (or `/categories?error=...`).
- **No edit/delete exists** — there is no `/api/categories/[id]` route and no interactive list. There is also **no client-side fetch pattern, no toast library, and no modal/dialog component anywhere in the app** (confirmed across the codebase). The established mutation convention is: native form `POST` → redirect, with errors carried by `?error=` and shown via `src/components/auth/ServerError.tsx`.

The **database already supports edit and delete fully** (`supabase/migrations/20260528132105_create_budget_schema.sql`):

- `categories_owner_all` RLS policy (`:59-62`) scopes all reads/writes to `auth.uid()`.
- `fn_cascade_to_other()` `BEFORE DELETE` trigger (`:73-102`): deleting a **user** category reassigns its expenses to that `(user, year)`'s system `other` row; deleting the system row raises `Cannot delete the system category` (unless the owning auth user is being cascade-deleted).
- `fn_protect_system_category()` `BEFORE UPDATE` trigger (`:108-126`): any field change to a system row raises `Cannot modify the system category`.
- `unique (user_id, year, name)` and `system_limit_check` (user rows require `limit_cents NOT NULL`) constraints still apply to updates.

### Key Discoveries:

- **No migration needed.** Cascade-on-delete and system-row protection already exist as triggers — `src/migrations` is untouched by this plan.
- **HTML forms can only `POST`/`GET`.** Routing a logical "update" and "delete" therefore uses `POST` action paths, not REST verbs — consistent with the existing create flow.
- **`CategoryForm` is the create form** (`CategoryForm.tsx:19-116`); it hardcodes `action="/api/categories"` and empty initial state. It must be parameterized to serve inline edit too.
- **The list is static `.astro`** — making rows interactive requires moving list rendering into a React island.
- **Postgres `23505`** is already mapped to a friendly duplicate-name message in the create route (`api/categories/index.ts:54-56`); the edit route reuses that mapping.
- **`SYSTEM_OTHER_NAME` / `CATEGORY_TYPES`** live in `src/lib/categories.ts`; `parsePlnToCents` / `formatCentsToPln` in `src/lib/money.ts`; `getCurrentBudgetYear` in `src/lib/budget-year.ts`.

## Desired End State

On `/categories`, each **user** category row shows **Edit** and **Delete** actions:

- **Edit** expands the row into an inline form (reusing the create form's fields and validation) pre-filled with the current name, type, and limit. Saving `POST`s to `/api/categories/[id]`, applies the change, and returns to the list. Name collisions and the reserved `other` name produce the same friendly errors as create.
- **Delete** swaps the row into a two-step inline confirm reading "Delete «name»? Its expenses will move to other." Confirming `POST`s to `/api/categories/[id]/delete`; the DB cascades expenses to `other` and the row disappears.
- The system `other` row remains read-only (no actions).

**Verification:** Create a category, log an expense under it, edit its name/type/limit (changes persist), then delete it (the expense now appears under `other`, no data lost). Attempts to edit into a duplicate or reserved name show a friendly error; the system row exposes no actions.

## What We're NOT Doing

- **No database migration.** Triggers and constraints already cover delete-cascade and system-row protection.
- **No editing or deleting of the system `other` category** from the UI (no actions rendered; DB blocks it as a backstop).
- **No client-side `fetch`, no toast library, no generic modal/dialog component.** We stay on native-form `POST` + redirect + `?error=`.
- **No per-category expense counts** in the delete confirm — the consequence message is constant ("expenses will move to other").
- **No bulk edit/delete, no undo, no cross-year operations.** Everything stays scoped to the current budget year, one category at a time.
- **No changes to the expenses or reports features** beyond what the delete cascade does automatically.

## Implementation Approach

Backend first, then UI. Phase 1 adds two `POST` action routes that mirror the create route's structure (auth guard → validate → mutate → redirect), so edit/delete are fully exercisable via plain form posts before any island exists. Phase 2 parameterizes `CategoryForm` for reuse, introduces a single `CategoryList` island that owns per-row UI state (idle / editing / confirming-delete), and swaps the static `.astro` list for that island. The system row is rendered read-only inside the island.

## Critical Implementation Details

- **System-row guarding is defense-in-depth, surfaced as friendly errors.** Both routes must check `is_system` after loading the target row and return a friendly `?error=` redirect *before* hitting the DB, rather than letting the trigger's raw `RAISE EXCEPTION` text reach the user. The triggers remain the backstop for any path that bypasses the app.
- **The edit route must scope the target row by `id` AND the current budget year**, then rely on RLS for user ownership — mirror how create derives `year` from `getCurrentBudgetYear()`. A row from another year or another user must resolve to a "not found" friendly error, not a 500.
- **Only one row may be in edit/confirm mode at a time** in the `CategoryList` island — opening Edit on one row resets any other open row. This keeps the single-screen mobile layout legible.

## Phase 1: Mutation API Routes

### Overview

Add server-side update and delete endpoints under `/api/categories/[id]`, following the create route's auth → validate → mutate → redirect shape. After this phase, edit/delete work end-to-end via raw form posts (verifiable with a temporary `<form>` or `curl`), independent of any UI.

### Changes Required:

#### 1. Update route

**File**: `src/pages/api/categories/[id].ts`

**Intent**: Accept a `POST` form submission that updates a user category's `name`, `type`, and `limit`, applying the same validation and friendly-error handling as the create route, then redirect back to `/categories`.

**Contract**: `export const POST: APIRoute`. Reads `context.params.id`; builds the Supabase client and resolves `context.locals.user` exactly as `api/categories/index.ts:12-20` (redirect to `/auth/signin` if absent). Reuses a local `back(context, msg)` helper redirecting to `/categories?error=<encoded>`. Parses `name`/`type`/`limit` from `formData()` and validates with the **same rules and messages** as `api/categories/index.ts:23-40` (non-empty name; reject `SYSTEM_OTHER_NAME` case-insensitively; `type` ∈ `CATEGORY_TYPES`; `parsePlnToCents(limit)`). Loads the target row by `id` and `year = getCurrentBudgetYear()` (`select("id,is_system")`, RLS enforces ownership); if missing → `back(context, "Category not found")`; if `is_system` → `back(context, "The \"other\" category cannot be edited")`. Performs `update({ name, type, limit_cents })` filtered by `id`; maps Postgres `23505` to `"A category with that name already exists for this year."` (same as `index.ts:54-56`), other errors to `error.message`. On success `context.redirect("/categories")`.

#### 2. Delete route

**File**: `src/pages/api/categories/[id]/delete.ts`

**Intent**: Accept a `POST` that deletes a user category; the DB trigger reassigns its expenses to `other`. Guard the system row with a friendly error before the DB does.

**Contract**: `export const POST: APIRoute`. Same auth/client/`back` setup. Loads the target row by `id` and current `year` (`select("id,is_system")`); missing → `back(context, "Category not found")`; `is_system` → `back(context, "The \"other\" category cannot be deleted")`. Calls `delete()` filtered by `id`; on error → `back(context, error.message)`; on success `context.redirect("/categories")`. No request body fields needed beyond the implicit form post.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- `POST`ing valid fields to `/api/categories/<id>` updates the row and redirects to `/categories`.
- Editing a category to a name already used that year shows the friendly duplicate message; editing to `other` shows the reserved-name error.
- `POST`ing to `/api/categories/<id>/delete` removes the row and the previously-attached expenses now resolve under `other`.
- Targeting the system `other` row's id for either route shows a friendly "cannot be edited/deleted" error (not a raw trigger exception).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation (e.g. via a temporary form or `curl` with auth cookies) before proceeding to Phase 2. Phase blocks use plain bullets; checkbox state lives in `## Progress`.

---

## Phase 2: Interactive Category List

### Overview

Make the category list interactive: each user row gains Edit (inline form) and Delete (two-step inline confirm). Reuse the create form for edit by parameterizing it. The system `other` row stays read-only.

### Changes Required:

#### 1. Parameterize the category form for reuse

**File**: `src/components/categories/CategoryForm.tsx`

**Intent**: Allow the same form to serve both create (on the page) and inline edit (in the list island) by accepting the post target, initial field values, and submit labels — without breaking the existing create usage.

**Contract**: Extend `Props` with optional `action?: string` (default `"/api/categories"`), `initialName?: string`, `initialType?: CategoryType`, `initialLimit?: string`, `submitLabel?: string`, `pendingText?: string`, and an optional `onCancel?: () => void`. Initialize `useState` from the `initial*` props. Use `action` on the `<form>` and the labels on `SubmitButton`. When `onCancel` is provided, render a Cancel button beside submit. All existing create call-sites keep working via the defaults. Limit is pre-filled as a PLN string derived from `limit_cents` (e.g. via `formatCentsToPln` stripped to a plain number, or a small `centsToInput` helper) so the edit form round-trips cleanly.

#### 2. Interactive list island

**File**: `src/components/categories/CategoryList.tsx` (new)

**Intent**: Replace the static list rendering with a React island that owns per-row UI mode and renders the existing visual design for idle rows, an inline `CategoryForm` for the editing row, and a two-step confirm for the deleting row. The system row is read-only.

**Contract**: Default-exported component, props `{ categories: CategoryRow[] }` where `CategoryRow` is `{ id; name; type; limit_cents; is_system }` (matches the `.astro` query at `categories.astro:15-21`). Holds state for the single active row + mode: `idle | editing | confirming`. Idle user rows render the current card markup (`categories.astro:71-82`) plus Edit and Delete buttons (Delete uses the `destructive` styling from `src/components/ui/button.tsx`). Editing row renders `<CategoryForm action={`/api/categories/${id}`} initialName=… initialType=… initialLimit=… submitLabel="Save" pendingText="Saving..." onCancel=…/>`. Confirming row renders the text "Delete «name»? Its expenses will move to other." with a Confirm button inside a `<form method="POST" action={`/api/categories/${id}/delete`}>` and a Cancel button that returns to idle. Opening Edit/Delete on one row resets any other active row (only one open at a time). The system `other` row always renders the read-only amber card (`categories.astro:62-69`) with no actions.

#### 3. Wire the page to the island

**File**: `src/pages/categories.astro`

**Intent**: Swap the static `<ul>` for the `CategoryList` island, passing the already-fetched rows, and keep the create form and `?error=` display intact.

**Contract**: Keep the existing data fetch (`categories.astro:24-33`). Replace the static list block (`:54-87`) with `<CategoryList categories={categories} client:load />`. The empty-state and create-form sections stay. `serverError` from `?error=` continues to feed the create `CategoryForm`; edit/delete errors surface the same way on redirect-back (the create form's `ServerError` shows them). Remove the now-unused inline `typeLabel`/markup if fully migrated into the island.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Each user row shows Edit and Delete; the system `other` row shows neither.
- Edit expands an inline form pre-filled with current name/type/limit; saving persists changes and returns to the list.
- Editing into a duplicate or `other` name shows the friendly error after redirect.
- Delete shows the inline "expenses will move to other" confirm; confirming removes the row and the create flow still works afterward.
- Only one row is ever in edit/confirm mode at once; Cancel restores the idle row.
- No regression to the create form or the empty-state.

**Implementation Note**: After this phase and automated verification, pause for manual UI confirmation before closing the change.

---

## Testing Strategy

No test runner is configured in this project (per CLAUDE.md), so verification is **build + lint + manual exercise of the app**.

### Manual Testing Steps:

1. Sign in, open `/categories`, create a category "Groceries" (recurring, 1500).
2. Log an expense under "Groceries" via `/expenses`.
3. Edit "Groceries" → rename to "Food", switch to Irregular, change limit to 5000; confirm the list reflects all three.
4. Try renaming a second category to "Food" (duplicate) and to "other" (reserved) — confirm friendly errors.
5. Delete "Food"; confirm the inline warning text, then confirm; verify the row disappears and the logged expense now appears under `other` in `/report/monthly`.
6. Confirm the system `other` row never shows Edit/Delete and the create form still works.

## Performance Considerations

Negligible. The list island renders the same handful of rows already fetched server-side; no new queries are added on the list page. Mutations are single-row `update`/`delete` calls.

## Migration Notes

None — no schema or data migration. Existing categories and expenses are unaffected until a user explicitly edits or deletes.

## References

- Create route (pattern to mirror): `src/pages/api/categories/index.ts`
- Create form (to parameterize): `src/components/categories/CategoryForm.tsx`
- List page: `src/pages/categories.astro`
- DB triggers (cascade + protection): `supabase/migrations/20260528132105_create_budget_schema.sql:73-126`
- Shared libs: `src/lib/categories.ts`, `src/lib/money.ts`, `src/lib/budget-year.ts`
- Recurring rules: `context/foundation/lessons.md` (layer-split: data-loss prevention in DB, UX in app)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Mutation API Routes

#### Automated

- [x] 1.1 Type checking passes: `npm run build` — ff4c961
- [x] 1.2 Linting passes: `npm run lint` — ff4c961

#### Manual

- [x] 1.3 POST valid fields to `/api/categories/<id>` updates and redirects
- [x] 1.4 Duplicate and reserved-name edits show friendly errors
- [x] 1.5 Delete removes the row and reassigns its expenses to `other`
- [x] 1.6 System `other` row id yields a friendly cannot-edit/delete error

### Phase 2: Interactive Category List

#### Automated

- [x] 2.1 Type checking passes: `npm run build` — 761fc35
- [x] 2.2 Linting passes: `npm run lint` — 761fc35

#### Manual

- [x] 2.3 User rows show Edit/Delete; system row shows neither — 761fc35
- [x] 2.4 Edit pre-fills and persists name/type/limit — 761fc35
- [x] 2.5 Duplicate/reserved edit shows friendly error after redirect — 761fc35
- [x] 2.6 Delete shows the cascade-warning confirm and removes the row — 761fc35
- [x] 2.7 Only one row open at a time; Cancel restores idle; no create-flow regression — 761fc35

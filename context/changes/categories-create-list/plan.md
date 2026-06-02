# Categories — Create and List (S-02) Implementation Plan

## Overview

Ship the first user-facing CRUD-read slice on top of the F-01 data layer: a protected `/categories` page that lists the current calendar year's categories — the user's own plus the implicit system **"other"** — and an inline create form that adds a category (name + type `recurring|irregular` + spending limit). This is the first slice to exercise RLS on a real read **and** write path, and it owns the app-level seeding of the per-`(user, year)` "other" row that F-01 deliberately deferred (lessons.md §Seeding convention).

## Current State Analysis

- **Schema (F-01, shipped):** `public.categories` has `(id, user_id, year SMALLINT, name, type CHECK in ('recurring','irregular'), limit_cents BIGINT, is_system, created_at)`, a unique `(user_id, year, name)`, and `categories_system_limit_check` — **system rows have `limit_cents IS NULL`; user rows must have a non-null limit**. RLS policy `categories_owner_all` is `FOR ALL TO authenticated USING/WITH CHECK (auth.uid() = user_id)`. A `BEFORE DELETE` trigger reassigns expenses to that year's "other" and **raises `'No "other" category…'` if it is missing** — so seeding correctly here is load-bearing for S-03/S-07.
- **Types:** `src/db/database.types.ts` is committed; `src/lib/supabase.ts:10` wires `createServerClient<Database>(...)`, so `.from('categories')` is fully typed.
- **Auth/session:** `src/middleware.ts:4` already lists `/categories` in `PROTECTED_ROUTES`; `context.locals.user` is populated, and RLS predicates resolve from API routes and SSR pages because the SSR client forwards the session cookie.
- **Established conventions (to mirror, not reinvent):**
  - API routes call `createClient(context.request.headers, context.cookies)` directly — no service layer (`src/pages/api/auth/signin.ts`).
  - Forms are React islands that do a **native `<form method="POST">`** to an API route; the route `redirect`s back with `?error=` on failure; the `.astro` page reads `Astro.url.searchParams` and passes it to the island via `client:load` (`src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`).
  - Client validation is hand-rolled in the island (no `zod` / `react-hook-form` in `package.json`).
  - Lists are SSR'd in `.astro` frontmatter (`src/pages/dashboard.astro`), styled mobile-first with the `bg-cosmic` / glass-card system and a `max-w-md` column.

### Key Discoveries:

- **"other" seeding lives here, in app code** — `lessons.md:9-11` and the F-01 brief both state the create-category route seeds the per-`(user, year)` `is_system=true` "other" row idempotently; the DB trigger is only the fail-fast backstop.
- **Year must be derived in `Europe/Warsaw`** — `lessons.md:13-15`. Cloudflare Workers run in UTC, so `new Date().getFullYear()` is wrong near a year boundary. Both the SSR list filter and the insert must use the Warsaw year.
- **System "other" row carries `limit_cents = NULL`** — the `system_limit_check` constraint forbids a limit on system rows, so the seed insert must omit/null the limit and the list UI must tolerate a null limit only for the system row.
- **Money is `limit_cents BIGINT`** — the form takes PLN and converts to integer cents.

## Desired End State

A signed-in user visits `/categories`, sees their current-year categories listed (with "other" visually accented and uneditable), fills the inline form (name, type, PLN limit), submits, and the page reloads showing the new category — and, after the first successful create of the year, the "other" row. A duplicate or invalid submission returns to `/categories` with an inline error message. Verified by: `npm run build` clean, and a manual browser pass creating the first category (which also surfaces "other"), a second category, and a rejected duplicate.

## What We're NOT Doing

- **Edit or delete** a category — that's S-07 (exercises the protect-system + cascade triggers). List rows carry no edit/delete controls.
- **Multi-year / year switcher** — current Warsaw year only. The `year` column exists but the copy-from-prior-year workflow is post-MVP.
- **Any expense or report UI** — S-03 / S-04. No spend/remaining figures here.
- A **service / data-access layer**, a **JSON-fetch** form contract, or a **Postgres seeding RPC** — all rejected in favour of the established direct-Supabase + native-POST patterns and app-level seeding.

## Implementation Approach

Three phases, backend-first so the UI builds against a working contract:

1. Two tiny pure helpers (`budget-year`, `money`) plus the `POST /api/categories` route that validates, inserts the user category, then idempotently upserts "other", and redirects.
2. The `/categories` SSR page (list + "other" accent) and the `CategoryForm.tsx` island (native POST, client validation, type-dependent limit label).
3. Roadmap/backlog doc updates marking S-02 done.

**Write ordering (Phase 1, load-bearing):** validate → insert the user category → on success, upsert "other". Insert-user-first means a failed/duplicate user insert leaves no stray "other"; the idempotent upsert (`onConflict: user_id,year,name`, `ignoreDuplicates: true`) makes repeat creates a no-op. If the user insert succeeds but the "other" upsert fails (near-impossible), the error is surfaced and the cascade trigger's backstop catches any later delete.

## Critical Implementation Details

- **Reserved-name collision.** The seed "other" row and a user category share the unique `(user_id, year, name)` space. Reject (case-insensitively) any user-supplied name equal to the system row's name (`"other"`) before insert, with a friendly message — otherwise the DB throws a raw unique-violation. Pick one canonical system name string and use it in both the seed insert and the guard.
- **Null limit only for the system row.** `system_limit_check` forbids a limit on `is_system=true` and requires one on user rows. The seed insert sets `is_system: true` and omits `limit_cents` (→ null); the user insert always sends an integer `limit_cents`. The list UI must render the system row without assuming a numeric limit.
- **Warsaw year is the single source of the `year` value** for both the SSR list `.eq('year', …)` filter and the inserts. Derive it once per request from the helper.

## Phase 1: Create-category API route + helpers

### Overview

Add the pure helpers and the write endpoint. No UI yet; verified by build + a manual POST / Supabase Studio check.

### Changes Required:

#### 1. Budget-year helper

**File**: `src/lib/budget-year.ts` (new)

**Intent**: Single source of "the current budget year", derived in `Europe/Warsaw` so it's stable on UTC Workers near a year boundary (lessons.md §Timezone).

**Contract**: Export `getCurrentBudgetYear(): number` returning the 4-digit year for `Europe/Warsaw` at call time. Use `Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric' })` (or equivalent) rather than `getFullYear()`. Returns a `number` matching the `SMALLINT` column.

#### 2. Money helper

**File**: `src/lib/money.ts` (new)

**Intent**: Convert the form's PLN string to integer `limit_cents`, with validation, and (for later reuse) format cents back to PLN.

**Contract**: Export `parsePlnToCents(input: string): { cents: number } | { error: string }` — accepts an optional-decimal PLN string (e.g. `"1500"`, `"1500.50"`), rejects non-numeric / negative / more-than-2-decimal input, returns rounded integer cents; require `cents > 0`. Also export `formatCentsToPln(cents: number): string` for symmetry (used by the list). Keep it Workers-safe (no `Intl` dependency required for parse).

#### 3. Create-category endpoint

**File**: `src/pages/api/categories/index.ts` (new)

**Intent**: Accept the create-form POST, validate, insert the user category under the current Warsaw year, then idempotently seed that year's "other" row, and redirect.

**Contract**: `export const POST: APIRoute`. Read `name`, `type`, `limit` from `formData()`. Build the Supabase client via `createClient(context.request.headers, context.cookies)`; if null, redirect `/categories?error=<configured?>` (mirror `signin.ts`). Resolve `user` from `context.locals.user`; if absent, redirect to `/auth/signin`. Validation (server-side, mirrors client): non-empty trimmed `name`; `name` not equal (case-insensitive) to the system "other" name; `type ∈ {recurring, irregular}`; `limit` parses via `parsePlnToCents` to `cents > 0`. On any failure, `redirect('/categories?error=' + encodeURIComponent(msg))`.

On success: `year = getCurrentBudgetYear()`; insert `{ user_id, year, name: trimmed, type, limit_cents: cents }` into `categories`; if that errors (e.g. unique violation → "A category with that name already exists for this year."), redirect with the friendly message. Then upsert the system row `{ user_id, year, name: <SYSTEM_OTHER_NAME>, type: 'irregular', is_system: true }` with `.upsert(payload, { onConflict: 'user_id,year,name', ignoreDuplicates: true })`. Finally `redirect('/categories')`.

Note: the seed row needs a `type` to satisfy the `NOT NULL` + CHECK on `type`; pick a fixed value (`'irregular'`) — it is never user-facing as a budget and the protect-system trigger freezes it.

### Success Criteria:

#### Automated Verification:

- Type checking + build pass: `npm run build`
- Lint passes: `npm run lint`

#### Manual Verification:

- Signed in, `POST /api/categories` with a valid name/type/limit creates the user row **and** an `is_system=true` "other" row for the current year (check in Supabase Studio); both carry the signed-in `user_id`.
- A second valid create adds only the user row (no duplicate "other").
- A duplicate name, a name equal to "other", an empty name, and a non-positive/garbage limit each redirect to `/categories?error=…` and create nothing.
- The seeded "other" row has `limit_cents = NULL` and was accepted (no `system_limit_check` violation).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: `/categories` page + create-form island

### Overview

Render the SSR list and the inline create form. The form is a React island doing a native POST to the Phase 1 route.

### Changes Required:

#### 1. Categories list page

**File**: `src/pages/categories.astro` (new)

**Intent**: Server-render the current-year category list (user rows + accented "other") and host the create-form island; surface any `?error=`.

**Contract**: Frontmatter: read `Astro.locals.user`; build `createClient(...)`; `year = getCurrentBudgetYear()`; query `categories` `.select('id,name,type,limit_cents,is_system').eq('year', year)` ordered so user rows come first and "other" sorts last (e.g. order by `is_system` asc, then `name`). Read `error = Astro.url.searchParams.get('error')`. Use `Layout` + `Topbar` and the `bg-cosmic` / `max-w-md` shell like `dashboard.astro`. Render each category as a glass card showing name, a type label ("Monthly"/"Annual" or "recurring"/"irregular"), and the limit via `formatCentsToPln` (user rows only). The **"other" row gets a distinct accent color + icon** and **no edit/delete control**; user rows also have no controls in this slice. Empty state (no user categories yet): a short prompt to create the first one. Pass `serverError={error}` to `<CategoryForm client:load />`.

#### 2. Create-form island

**File**: `src/components/categories/CategoryForm.tsx` (new)

**Intent**: Collect name, type, and PLN limit with client-side validation, then native-POST to `/api/categories`.

**Contract**: Default-export `CategoryForm({ serverError }: { serverError?: string | null })`. `<form method="POST" action="/api/categories" onSubmit={…} noValidate>`. Fields: text `name`; a `type` selector (radio or select) over `recurring|irregular`; a decimal `limit` input whose **label switches by selected type** — "Monthly limit (PLN)" for `recurring`, "Annual limit (PLN)" for `irregular`. Client validation mirrors the server: required name, valid type, `limit` parses to `> 0`; block submit and show inline field errors on failure (reuse the `FormField` / `ServerError` auth components where they fit, or local equivalents). Render `serverError` via the shared `ServerError`. A submit button (reuse `SubmitButton`), mobile-first, thumb-sized targets per the NFR.

#### 3. (If needed) shared field primitives

**File**: reuse `src/components/auth/FormField.tsx`, `ServerError.tsx`, `SubmitButton.tsx`

**Intent**: Avoid duplicating input/error/button UI; only add a new primitive if the auth ones don't fit (e.g. a select/radio for `type`).

**Contract**: Import and reuse as-is for name/limit/error/submit. Add a minimal type selector inline in `CategoryForm` (or a small `categories/`-local component) — no change to the auth components themselves.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Lint passes: `npm run lint`
- Format check clean: `npm run format`

#### Manual Verification:

- On a phone-width viewport (~360px), `/categories` shows the list + form with no horizontal scroll and thumb-sized targets.
- Creating the first category reloads the page showing both it and the accented "other" row; "other" has the distinct color/icon and no edit/delete control.
- The limit label reads "Monthly limit (PLN)" for recurring and "Annual limit (PLN)" for irregular.
- Submitting a duplicate name shows the inline server error after redirect; client validation blocks empty name / non-positive limit before submit.
- The dashboard "Categories" card links here and the page is gated for signed-out users (redirects to sign in).

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Roadmap / backlog doc updates

### Overview

Record S-02 as shipped so downstream planning treats it as done.

### Changes Required:

#### 1. Roadmap status

**File**: `context/foundation/roadmap.md`

**Intent**: Flip S-02 to done in both index tables and unblock the items that depend on it.

**Contract**: In the "At a glance" table set S-02 `Status` → `done`. In the "Backlog Handoff" table set S-02 row `Ready for /10x-plan` → `shipped` with a short note (route + page + island filenames). Optionally adjust the S-03/S-07 "Blocked by … S-02" notes to reflect that S-02 is now satisfied. Update the frontmatter `updated:` date. Do not alter slice bodies beyond the S-02 status line.

### Success Criteria:

#### Automated Verification:

- Markdown still formats clean: `npm run format`

#### Manual Verification:

- `roadmap.md` shows S-02 `done` in both tables; no other slice's content changed.

---

## Testing Strategy

No test runner is configured (per CLAUDE.md) — verification is `npm run build` + `npm run lint` + manual browser/Studio checks.

### Manual Testing Steps:

1. Sign in; navigate to `/categories` (also via the dashboard "Categories" card).
2. Create a `recurring` category "Groceries" with limit `1500` → page reloads; "Groceries" and an accented "other" row appear.
3. Create an `irregular` category "Vacation" with limit `2000.50` → appears; only one "other" row exists.
4. Attempt a duplicate "Groceries" → inline error, nothing created.
5. Attempt name "other" → rejected with a friendly message.
6. Attempt empty name / `0` / `-5` / `abc` limit → blocked client-side (and server-side if forced).
7. In Supabase Studio confirm row ownership (`user_id`), the `is_system` "other" row with `limit_cents = NULL`, and that `year` matches the current Warsaw year.
8. Resize to ~360px → no horizontal scroll; controls thumb-usable.
9. Sign out, visit `/categories` → redirected to sign in.

## Performance Considerations

Single indexed query (`idx_categories_user_year`) per page load; well within the < 2s NFR. No N+1, no client data fetching.

## Migration Notes

None — no schema change. The "other" seed is data created at runtime by the API route on first category creation per year.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-02)
- Data layer: `supabase/migrations/20260528132105_create_budget_schema.sql`, `context/changes/data-layer-and-rls/plan-brief.md`
- Patterns: `src/pages/api/auth/signin.ts`, `src/pages/auth/signin.astro`, `src/components/auth/SignInForm.tsx`, `src/pages/dashboard.astro`
- Lessons: `context/foundation/lessons.md` (§Seeding convention, §Timezone, §Layer-split, §RLS shape)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Create-category API route + helpers

#### Automated

- [x] 1.1 Type checking + build pass: `npm run build`
- [x] 1.2 Lint passes: `npm run lint`

#### Manual

- [ ] 1.3 Valid POST creates the user row and an is_system "other" row for the current year, both owned by the signed-in user
- [ ] 1.4 A second valid create adds only the user row (no duplicate "other")
- [ ] 1.5 Duplicate name, name "other", empty name, and non-positive/garbage limit each redirect with ?error and create nothing
- [ ] 1.6 Seeded "other" row has limit_cents = NULL and passes system_limit_check

### Phase 2: `/categories` page + create-form island

#### Automated

- [ ] 2.1 Build passes: `npm run build`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Format check clean: `npm run format`

#### Manual

- [ ] 2.4 Phone-width (~360px) shows list + form with no horizontal scroll and thumb-sized targets
- [ ] 2.5 Creating the first category reloads showing it plus the accented "other" row (distinct color/icon, no edit/delete control)
- [ ] 2.6 Limit label reads "Monthly limit (PLN)" for recurring and "Annual limit (PLN)" for irregular
- [ ] 2.7 Duplicate name shows inline server error; client validation blocks empty name / non-positive limit before submit
- [ ] 2.8 Dashboard "Categories" card links here and the page redirects signed-out users to sign in

### Phase 3: Roadmap / backlog doc updates

#### Automated

- [ ] 3.1 Markdown formats clean: `npm run format`

#### Manual

- [ ] 3.2 roadmap.md shows S-02 done in both tables with no other slice content changed

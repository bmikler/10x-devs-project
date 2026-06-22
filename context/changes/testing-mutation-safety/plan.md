# Mutation Safety: Cascade + Input Validation — Implementation Plan

## Overview

Phase 3 of the test rollout (test-plan §3 row 3). Two risks protected:

- **Risk #4** — category-delete preserves all expenses by reassigning to "other"; a saved
  expense is durably readable.
- **Risk #6** — the expense endpoint rejects hostile form input server-side and writes no
  bad row; the DB constraint (`amount_cents > 0`) backstops even if app code is bypassed.

## Current State Analysis

**Test infrastructure already in place:**

- Unit lane: `vitest.config.ts` → `npm run test` (DB-free, runs in CI today).
- Integration lane: `vitest.integration.config.ts` → `npm run test:integration` (requires
  `supabase start`; separate script keeps the unit gate DB-free).
- Helper: `tests/integration/helpers/supabase.ts` exports `makeUsers()` — two ephemeral
  users, per-user signed-in clients, `cleanup()` on `afterAll`.
- Reference integration test: `tests/integration/data-isolation.test.ts`.
- Reference unit handler test: `src/pages/api/auth-guard.test.ts` — `vi.mock("astro:env/server")`
  + in-process `POST` call + synthesised `APIContext`.

**Cascade lives entirely in the DB trigger, not app code:**

`supabase/migrations/20260528132105_create_budget_schema.sql:73-102`
`fn_cascade_to_other` — BEFORE DELETE on `categories`. It reassigns all expenses from the
deleted category to the "other" row (`is_system = true`) for that `(user_id, year)`. It raises
`RAISE EXCEPTION` if "other" is missing or if the row being deleted is itself a system row.

The delete endpoint (`src/pages/api/categories/[id]/delete.ts:41`) calls
`.delete().eq("id", id)` — the trigger fires automatically. No explicit reassignment in app code.

**"other" is not auto-seeded by auth.admin.createUser:**

It is seeded only through the create-category app route
(`src/pages/api/categories/index.ts:62-71`). Any integration test that exercises the cascade
must seed "other" manually in `beforeAll`.

**Validation lives in a pure function before any DB call:**

`src/lib/expense-write.ts:46-81` — `validateExpenseFields(form)`. The expense handler
(`src/pages/api/expenses/index.ts:24-28`) returns a redirect immediately on validation
failure — no supabase call is made. The DB has an independent backstop:
`expenses.amount_cents BIGINT NOT NULL CHECK (amount_cents > 0)` (migration `:41`).

## Desired End State

- `tests/integration/mutation-safety.test.ts` — 4+ tests covering cascade, durability, system
  protection, and DB constraint backstop; runs under `npm run test:integration`.
- `src/pages/api/expenses/input-validation.test.ts` — 6 tests covering every hostile input
  class; runs under `npm run test` (no DB, in-process).
- `context/foundation/test-plan.md §6.5` filled in with the cascade/mutation cookbook recipe.

### Key Discoveries

- `supabase/migrations/20260528132105_create_budget_schema.sql:73-102` — cascade trigger;
  asserts "other" exists before delete and raises exception if not.
- `tests/integration/helpers/supabase.ts:20-24` — `serviceClient()` is internal (not exported);
  seeding "other" via the user's own client is the right path.
- `src/pages/api/auth-guard.test.ts:4-22` — proven pattern for in-process handler tests with
  `vi.mock("astro:env/server")`; `new Request(url, { body: formData })` works because `Request`
  and `FormData` are Node 18+ globals and the environment is `node`.
- `src/lib/categories.ts:7` — `SYSTEM_OTHER_NAME = "other"` is the canonical constant to use
  instead of a hard-coded string.

## What We're NOT Doing

- Not testing the delete endpoint handler in-process for the cascade — the risk is in the DB
  trigger; testing it via a direct client call proves the real invariant.
- Not changing production code (no new migrations, no endpoint changes).
- Not testing the React form validation — the anti-pattern the test-plan warns against (§2 Risk #6).
- Not testing categories `[id].ts` `update` handler for validation (not in scope for Risk #6;
  the same `validateExpenseFields` function is used there and covered implicitly).

## Implementation Approach

**Phase 1** tests the DB trigger directly via the supabase client — mirrors `data-isolation.test.ts`.
No endpoint mocking. "other" is seeded with a direct client insert from `users.a.client`; the
DB allows this because RLS `WITH CHECK (auth.uid() = user_id)` is satisfied and the
`protect_system_category` trigger only fires on UPDATE, not INSERT.

**Phase 2** tests the expense handler in-process — mirrors `auth-guard.test.ts`. A
`makeContext(form)` helper constructs a fake `APIContext` with `locals.user` set to a non-null
object, so the auth guard passes and validation is what's exercised. No real DB needed:
validation fails before any supabase call; `createClient` receives a mocked URL/key but is
never invoked for a DB operation.

**Phase 3** fills in §6.5 (mutation/cascade cookbook) and closes the Phase 3 rollout row.

## Critical Implementation Details

**"other" seeding**: The DB constraint `categories_system_limit_check` requires `limit_cents IS NULL`
for system rows — omit `limit_cents` entirely (not pass null) when seeding "other" to avoid
column-type issues in the client. Import `SYSTEM_OTHER_NAME` from `@/lib/categories` rather than
hard-coding the string.

**Test ordering in Phase 1**: The cascade test (`it("cascade: …")`) calls `.delete()` on the
named category — this mutates shared state. The durability test must run before the cascade test
(Vitest runs within a `describe` in order). The system-protection and DB-constraint tests are
independent of each other and can run in any position after the cascade.

**Validation test request construction**: `new Request(url, { method: "POST", body: form })` where
`form` is a `new FormData()`. Both are Node 18+ globals verified available by the `auth-guard.test.ts`
usage of `new Request(...)`. The supabase client is constructed (mocked env) but never called
when validation fails — the test asserts the redirect response shape only.

**DB constraint error code**: PostgreSQL `CHECK` constraint violations return code `"23514"`.
The supabase-js client surfaces this in `error.code`. The test can assert `error !== null` (most
robust) or additionally check `error.code === "23514"`.

---

## Phase 1: Cascade + durability integration suite

### Overview

Seed one user with "other", a named category ("food"), and 2 expenses. Then verify:
durability (expense readable after save), cascade (expenses survive and are reassigned when
the category is deleted), system-category protection (deleting "other" is blocked at the DB),
and DB constraint backstop (zero `amount_cents` is rejected).

### Changes Required

#### 1. Integration test file

**File**: `tests/integration/mutation-safety.test.ts`

**Intent**: New integration test suite for Phase 3 risks. Shares the `makeUsers()` fixture;
uses only `users.a`.

**Contract**: `describe("mutation-safety")` wrapping four `it()` cases plus one `describe`
block for the constraint backstop. `beforeAll` seeds the fixture; `afterAll` calls
`users.cleanup()`. Structure mirrors `data-isolation.test.ts`.

**`beforeAll` setup:**

- `users = await makeUsers()` (use only `users.a`; `users.b` is unused but cleaned up).
- Seed "other": `users.a.client.from("categories").insert({ user_id: a.id, year: TEST_YEAR, name: SYSTEM_OTHER_NAME, type: "irregular", is_system: true })` → capture `otherId`.
- Seed "food": insert with `limit_cents: 50000, type: "recurring"` → capture `foodId`.
- Seed 2 expenses under "food" via `.insert([…, …])` → capture `expenseIds[]`.

**Test cases:**

1. `durability: expense is readable after save`
   — Re-read the two seeded expenses by id; assert `data.length === 2`. Proves save
   succeeded and re-read returns the same rows.

2. `cascade: expenses are reassigned to "other" and none are lost`
   — `.delete().eq("id", foodId)` via `users.a.client`; assert `error === null`.
   — Re-read the two expenses; assert `length === 2` (none lost) and every
   `category_id === otherId` (all reassigned).

3. `system-category backstop: deleting "other" returns a DB error`
   — `.delete().eq("id", otherId)` via `users.a.client`; assert `error !== null`.
   — Re-read "other" by id; assert `data.length === 1` (still present).

4. `DB constraint backstop: amount_cents = 0 is rejected`
   — `.insert({ user_id: a.id, category_id: otherId, name: "bad", amount_cents: 0 })`
   via `users.a.client`; assert `error !== null`.
   — Re-read `expenses` filtered by `name: "bad"`; assert `data.length === 0`
   (no bad row written).

**Imports needed:** `SYSTEM_OTHER_NAME` from `@/lib/categories`; `makeUsers` from
`./helpers/supabase`.

`TEST_YEAR` constant at the top of the file: `const TEST_YEAR = 2026` — follows
`data-isolation.test.ts` convention; avoids year-boundary flakiness in a fixed-fixture test.

### Success Criteria

#### Automated Verification

- `npm run test:integration` exits 0 with all four cases green.

#### Manual Verification

- Run `supabase start`, export keys, run `npm run test:integration`; confirm all pass.
- Confirm the suite name `mutation-safety` appears in the output (not merged into another
  describe block by mistake).

**After completing this phase and all automated verification passes, pause here for manual
confirmation before proceeding to Phase 2.**

---

## Phase 2: Input validation handler unit suite

### Overview

In-process handler tests for the expense POST endpoint, exercising every hostile input class.
No real DB needed — validation fires before any supabase call.

### Changes Required

#### 1. Unit test file

**File**: `src/pages/api/expenses/input-validation.test.ts`

**Intent**: Prove the expense create endpoint rejects each class of bad input with a 302
redirect to `/expenses?error=…` (not to the success path), implicitly proving no DB write
occurs (the redirect returns before any supabase call).

**Contract**: Mirrors `src/pages/api/auth-guard.test.ts`. Top-level `vi.mock("astro:env/server")`
with valid-looking URL and key. A `makeContext(form)` factory that sets `locals.user`
to a non-null object (any `{ id: string }`) and attaches the FormData to the Request body.

**`makeContext(form: FormData)` shape:**

```typescript
{
  request: new Request("http://localhost/api/expenses", { method: "POST", body: form }),
  cookies: { get: () => undefined, getAll: () => [], has: () => false, set: vi.fn(), delete: vi.fn() },
  locals: { user: { id: "test-user-id" } },
  params: {},
  redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
}
```

**Helper — `validForm()` base:**

Construct a `FormData` with valid defaults (`amount: "10.00"`, `category_id: "<valid-uuid>"`,
`date: "2026-06-01"`) so each test only overrides the one bad field. For "missing field" cases,
call `form.delete("amount")` (or simply don't set it) rather than setting it to an empty string.

**Test cases (6 total, all under one `describe`):**

1. `missing amount → 302 to /expenses?error=`
   — FormData: no `amount` field; valid category_id + date.
   — Assert `res.status === 302`, `Location` starts with `/expenses?error=`.

2. `zero amount → 302 to /expenses?error=`
   — FormData: `amount = "0"`.

3. `negative amount → 302 to /expenses?error=`
   — FormData: `amount = "-1"`.

4. `non-numeric amount → 302 to /expenses?error=`
   — FormData: `amount = "abc"`.

5. `missing category_id → 302 to /expenses?error=`
   — FormData: no `category_id` field; valid amount + date.

6. `future date → 302 to /expenses?error=`
   — FormData: `date = "2099-01-01"`; valid amount + category_id.

**Shared assertion pattern for all cases:**

```typescript
const res = await POST(makeContext(form))
expect(res.status).toBe(302)
expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/)
```

### Success Criteria

#### Automated Verification

- `npm run test` exits 0 with all six input-validation cases green.
- Existing `src/pages/api/auth-guard.test.ts` tests continue to pass (no regression).

#### Manual Verification

- Review the test output: each case should show its bad-input label, not a timeout or
  an unhandled promise rejection.
- Confirm the `input-validation.test.ts` file appears under `src/pages/api/expenses/`
  and is discovered by `npm run test` (unit lane).

**After completing this phase and all automated verification passes, pause here for manual
confirmation before proceeding to Phase 3.**

---

## Phase 3: Cookbook §6.5 and rollout status update

### Overview

Fill in `context/foundation/test-plan.md §6.5` with the canonical pattern for cascade /
mutation tests established in this phase. Mark Phase 3 `complete` in §3.

### Changes Required

#### 1. Fill in §6.5 in test-plan.md

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the `TBD — see §3 Phase 3` placeholder in §6.5 with the patterns
established here so future contributors can add similar tests without re-reading the plan.

**Contract**: §6.5 should document:
- Location: `tests/integration/mutation-safety.test.ts` as the reference test; note it lives
  in the integration lane (requires `supabase start`).
- "other" seeding rule: must be done manually in `beforeAll` via the user's own client
  (`is_system: true`, no `limit_cents`; import `SYSTEM_OTHER_NAME` from `@/lib/categories`).
- The critical assertion rule: assert DB state post-delete (re-read expenses, check
  `category_id`), not the delete operation's return value — mirrors the §6.2 rule for
  cross-user writes.
- The DB constraint backstop pattern: direct `.insert({ amount_cents: 0 })` → assert `error !== null` + re-read confirms 0 rows.
- For input-validation handler tests: location is `src/pages/api/expenses/input-validation.test.ts`;
  pattern references `auth-guard.test.ts` as the context-factory baseline.

#### 2. Mark Phase 3 complete in §3 rollout table

**File**: `context/foundation/test-plan.md`

**Intent**: Update the Phase 3 row status from `change opened` to `complete` and confirm the
change folder column is set.

**Contract**: In the §3 rollout table, the Phase 3 row changes:
- `status`: `change opened` → `complete`
- `Change folder`: `context/changes/testing-mutation-safety/` (already set by `/10x-new`)

#### 3. Update change.md status

**File**: `context/changes/testing-mutation-safety/change.md`

**Intent**: Advance `status` from `new` to `planned` (set by this plan) and update `updated`.

### Success Criteria

#### Automated Verification

- None (documentation edits).

#### Manual Verification

- §6.5 is readable, references the correct file paths, and covers the "other" seeding gotcha.
- Phase 3 row in §3 shows `complete` after implementation.

---

## Testing Strategy

### Unit Tests

- `src/pages/api/expenses/input-validation.test.ts` — 6 cases for the handler rejection path.
  No DB; each case proves a different validation guard fires before the supabase call.

### Integration Tests

- `tests/integration/mutation-safety.test.ts` — 4 cases: durability re-read, cascade
  reassignment + count, system-category DB protection, amount_cents constraint backstop.
  All require local Supabase running.

### Manual Testing Steps

1. `supabase start` + `export $(supabase status -o env | grep -E 'ANON_KEY|SERVICE_ROLE_KEY')`
2. `npm run test:integration` — confirm 4 mutation-safety tests pass.
3. `npm run test` — confirm 6 input-validation tests pass alongside existing unit tests.
4. Inspect the test output for the mutation-safety describe name and each `it` label.

## References

- Related plan (Phase 2): `context/changes/testing-data-isolation/plan.md`
- Phase 2 research (harness decisions, RLS shape, seeding gotcha):
  `context/changes/testing-data-isolation/research.md`
- Cascade trigger: `supabase/migrations/20260528132105_create_budget_schema.sql:73-102`
- Auth-guard handler test pattern: `src/pages/api/auth-guard.test.ts`
- Integration helper: `tests/integration/helpers/supabase.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.
> Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cascade + durability integration suite

#### Automated

- [x] 1.1 `npm run test:integration` exits 0 with all four mutation-safety cases green — 8c4330d

#### Manual

- [x] 1.2 Integration tests confirmed passing locally with `supabase start` — 8c4330d

### Phase 2: Input validation handler unit suite

#### Automated

- [x] 2.1 `npm run test` exits 0 with all six input-validation cases green — d9b5fd9
- [x] 2.2 Existing `auth-guard.test.ts` tests still pass (no regression) — d9b5fd9

#### Manual

- [x] 2.3 Each bad-input label visible in test output (no timeouts or unhandled rejections) — d9b5fd9

### Phase 3: Cookbook §6.5 and rollout status update

#### Manual

- [x] 3.1 §6.5 in test-plan.md filled in with cascade/mutation patterns
- [x] 3.2 Phase 3 row in §3 rollout table updated to `complete`

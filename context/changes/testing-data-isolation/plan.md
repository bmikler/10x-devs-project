# Data-isolation & Auth-boundary Integration Tests — Implementation Plan

## Overview

Phase 2 of the test-plan rollout (`context/foundation/test-plan.md` §3 row 2).
Add integration-grade coverage for two High-impact risks:

- **Risk #1** — a signed-in user reads or modifies *another user's* categories/expenses.
- **Risk #5** — an *unauthenticated* request reaches a gated API endpoint.

No production code changes. We are adding tests and the harness that runs them. The two
risks split across two layers by cost:

- **Risk #5** is DB-free: run each endpoint handler in-process with `locals.user = null`
  and assert the redirect. Lives in the existing **unit lane** (`npm run test`).
- **Risk #1** requires real RLS: drive local Supabase with two real users and assert the
  database denies cross-user access. Lives in a **new, separate integration lane**
  (`npm run test:integration`) so the fast unit gate stays DB-free.

## Current State Analysis

- **Ownership is enforced by RLS, not app code.** Both `categories` and `expenses` carry a
  single `FOR ALL TO authenticated` policy with **both** `USING (auth.uid() = user_id)` and
  `WITH CHECK (auth.uid() = user_id)` (`supabase/migrations/20260528132105_create_budget_schema.sql:56-67`).
  No endpoint adds a `.eq('user_id', …)` filter — app lookups exist only for friendly errors.
- **Cross-user UPDATE/DELETE are silent 0-row no-ops** under RLS: the endpoint still redirects
  "success." Therefore a test must assert **DB state**, never HTTP status, and must let **real
  RLS run** (mocking the DB away tests nothing — the §2 Risk #1 anti-pattern).
- **The auth boundary is asymmetric.** `src/middleware.ts:4,18` guards only four *page*
  prefixes via `startsWith` and **never matches `/api/*`**. Every API endpoint compensates
  with its own `if (!locals.user)` guard. Both layers emit **HTTP 302 → `/auth/signin`**,
  never 401/403.
- **The five data endpoints are POST-only**, each with an inline `locals.user` guard:
  `api/categories/index.ts:17-20`, `api/categories/[id].ts:17-20`,
  `api/categories/[id]/delete.ts:15-18`, `api/expenses/index.ts:16-19`,
  `api/expenses/[id].ts:13-15`. The thinnest isolation path is the `expenses/[id].ts`
  delete branch (`:21-27`) — `.delete().eq("id", id)`, RLS-only, no existence check.
- **Test infra today:** `vitest.config.ts` is plain (`environment: "node"`, `@`→`./src`
  alias, **no `getViteConfig()`**). `package.json` has `test` = `vitest run` and
  `test:watch`. `@supabase/supabase-js ^2.99.1` + `@supabase/ssr ^0.10.3` are already deps —
  **no new package needed**.
- **Local Supabase is test-ready:** `supabase/config.toml` has auth enabled with
  `enable_confirmations = false` (created users sign in immediately). `[db.seed]` points at a
  `seed.sql` that **does not exist** — tests must create their own data. No service-role
  client exists anywhere in app code.

### Key Discoveries:

- **`vi.mock("astro:env/server")` + `await import(endpoint)` already works** under the current
  plain config — proven by a throwaway probe (research Open-Q #1). The endpoint's only runtime
  virtual is `astro:env/server` (pulled via `@/lib/supabase`); the `astro` import is type-only
  and erased. **Do NOT adopt `getViteConfig()`** — it breaks on Astro 6 + `@astrojs/cloudflare`
  (withastro/astro#15310 closed, #15878 open).
- **Two-user minting recipe** (research §C): a service-role client (`persistSession:false,
  autoRefreshToken:false` to dodge the service-client-adopts-session bug) calls
  `auth.admin.createUser({ email_confirm:true })` for A and B; each user then gets its **own**
  `createClient(URL, ANON_KEY, { auth:{ persistSession:false } })` + `signInWithPassword`, so
  `auth.uid()` resolves correctly per client.
- **`auth.admin.createUser` seeds zero categories** — the per-(user,year) "other" row is seeded
  only by the create-category *route* (`api/categories/index.ts:59-71`), never on signup. So a
  Risk #1 test creates categories directly via each user's own client; an expense-insert needs a
  category to exist first.
- **Non-composite FK gap:** `expenses.category_id REFERENCES public.categories(id)` is not a
  composite `(category_id, user_id)` FK (`migration:39`), so the DB alone does not stop an
  expense pointing at another user's category — protection there is RLS + the app's category
  lookup, worth an explicit test.

## Desired End State

- `npm run test` (unit lane, DB-free) covers Risk #5: every gated POST endpoint returns
  `302 → /auth/signin` when `locals.user` is null. Runs in CI today with no Supabase service.
- `npm run test:integration` (new lane) covers Risk #1 against a running local Supabase: a
  user B cannot read, update, delete, or forge-insert into user A's rows, and cannot attach an
  expense to A's category. Assertions inspect DB state, not HTTP status.
- The two lanes are physically separated: integration tests live in `tests/integration/`; the
  unit config never discovers them.
- `context/foundation/test-plan.md` §6.2, §6.4, and §6.6 document how to add integration tests
  and how to run the lane (including service-role key sourcing).

**Verification:** `npm run test` green with the new Risk #5 cases; with local Supabase running
and `SUPABASE_SERVICE_ROLE_KEY` exported, `npm run test:integration` green; `npm run lint`
clean.

## What We're NOT Doing

- **No production code changes.** RLS stays the structural boundary (decided by user
  2026-06-18); we test it, we do not replace it with app-level `.eq("user_id", …)` filters.
- **No CI YAML changes.** Wiring `supabase start` + the integration lane into
  `.github/workflows/ci.yml` is the test-plan rollout's **Phase 4** (a separate change) and is
  a lesson boundary here. This plan only makes the lane *ready* and documents it.
- **No Risk #4 / Risk #6 coverage** (cascade-to-"other", input validation) — that is the
  rollout's Phase 3.
- **No page-level redirect / e2e fidelity.** Full HTTP page-redirect testing is Playwright/e2e
  territory, deliberately deferred (test-plan §3).
- **No `getViteConfig()` / Astro-aware Vitest**, no Astro module-graph booting for the Risk #1
  suite (it never imports app code).
- **No reliance on a seed file** — `supabase/seed.sql` does not exist; tests self-provision.

## Implementation Approach

Two test surfaces, ordered cheapest-signal-first:

1. **Risk #5 (Phase 1)** — pure in-process handler tests in the unit lane. Zero new infra; it
   ships value on the very first phase and runs in today's CI.
2. **Integration harness (Phase 2)** — a second Vitest config + script and a reusable helper
   that mints two users and resets state. This is the scaffold Phase 3 builds on.
3. **Risk #1 (Phase 3)** — the data-isolation suite (full denial matrix + FK probe) using the
   helper, asserting DB state.
4. **Docs (Phase 4)** — fill the test-plan cookbook so the next contributor can add an
   integration test without re-deriving any of this.

## Critical Implementation Details

- **Assert side-effects, not status (Risk #1).** Cross-user UPDATE/DELETE return no error and
  affect 0 rows; the only true signal is re-reading A's row (as A, or via the service client)
  and confirming it is unchanged / still present. A test that asserts the HTTP/RPC status
  passes against a broken policy.
- **Per-user client isolation.** Each user needs a *separate* `createClient` instance with
  `persistSession:false`; sharing one client (or relying on jsdom localStorage) makes
  `auth.uid()` ambiguous. Stay on `environment:"node"`.
- **Service client must be `persistSession:false, autoRefreshToken:false`** — otherwise it
  adopts the last-signed-in user's session and silently stops bypassing RLS.
- **Category-before-expense ordering.** Any expense insert in the Risk #1 suite must first
  create a category via the *owning* user's client (the expense endpoint and the FK both
  require an existing category row). "other" is not auto-seeded for admin-created users.
- **Unique emails per run + cascade cleanup.** Mint users with run-unique emails; in `afterAll`
  call `auth.admin.deleteUser(id)` for both — `ON DELETE CASCADE` wipes their categories and
  expenses. Avoid `supabase db reset` (slow).

## Phase 1: Risk #5 — Auth-guard tests (unit lane, DB-free)

### Overview

Prove every gated POST endpoint rejects an unauthenticated request with `302 → /auth/signin`.
Runs in the existing unit lane; no Supabase, no new packages.

### Changes Required:

#### 1. Auth-guard test for all five data endpoints

**File**: `src/pages/api/auth-guard.test.ts` (colocated under `src/`, discovered by the unit lane)

**Intent**: For each of the five POST endpoints, mock `astro:env/server`, import the handler,
invoke it with a synthesized `APIContext` whose `locals.user` is `null`, and assert the response
is a 302 redirect to `/auth/signin`. This is the in-process pattern proven feasible in research
Open-Q #1.

**Contract**:
- Mock the runtime virtual at the top of the file: `vi.mock("astro:env/server", () => ({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_KEY: "test-anon-key" }))` (hoisted factory — values only need to let `createClient` construct; no DB call is reached because the guard returns first).
- Endpoints under test (all `export const POST`): `@/pages/api/categories/index`, `@/pages/api/categories/[id]`, `@/pages/api/categories/[id]/delete`, `@/pages/api/expenses/index`, `@/pages/api/expenses/[id]`.
- Synthesize a minimal `APIContext`: `request` (a `Request` with empty cookies so `createClient` builds but `auth.getUser()` is never reached), `cookies` (Astro cookie shim — `getAll`/`get` returning empty), `locals: { user: null }`, `params: { id: "00000000-0000-0000-0000-000000000000" }`, and a `redirect(path)` that returns `new Response(null, { status: 302, headers: { Location: path } })` mirroring Astro's behavior.
- Assertion per endpoint: `res.status === 302` and `res.headers.get("Location") === "/auth/signin"`.

**Note on the redirect shim**: Astro's real `context.redirect` is what the handler calls; the
synthesized context must provide a `redirect` that produces a 302 with a `Location` header so the
assertion is meaningful. A table-driven `it.each` over the five `{ name, importPath }` entries keeps
the file compact.

### Success Criteria:

#### Automated Verification:

- Unit suite passes: `npm run test`
- New cases are discovered (5 endpoints asserted): `npm run test -- auth-guard`
- Linting passes: `npm run lint`

#### Manual Verification:

- Temporarily flipping one endpoint's guard (commenting its `if (!user)` block) makes that
  endpoint's case fail — confirming the test actually exercises the guard, not a happy path.

**Implementation Note**: After Phase 1 automated verification passes, pause for manual
confirmation before Phase 2.

---

## Phase 2: Integration lane scaffold (config, script, helper)

### Overview

Stand up a second Vitest lane that runs the live-Supabase suite, kept fully separate from the
unit lane, plus a reusable helper that mints two users and resets state.

### Changes Required:

#### 1. Integration Vitest config

**File**: `vitest.integration.config.ts`

**Intent**: A dedicated config whose `include` targets only `tests/integration/**/*.test.ts`,
re-declaring the `@`→`./src` alias (not inherited) and `environment:"node"`. Mirrors the existing
`vitest.config.ts` shape.

**Contract**: `test.include = ["tests/integration/**/*.test.ts"]`; `resolve.alias["@"]` = `./src`
(same URL idiom as the unit config); `test.environment = "node"`. No `getViteConfig()`.

#### 2. Exclude integration tests from the unit lane

**File**: `vitest.config.ts`

**Intent**: Ensure `npm run test` never discovers the integration suite, so the fast floor stays
DB-free even though both configs share the repo.

**Contract**: Add `test.exclude` extending Vitest defaults with `"tests/integration/**"` (and keep
`test.include` implicitly `src/**` via default — or set it explicitly to `src/**/*.test.ts`).

#### 3. `test:integration` script

**File**: `package.json`

**Intent**: A script that runs the integration config one-shot. The unit `test` script is
unchanged.

**Contract**: `"test:integration": "vitest run --config vitest.integration.config.ts"`. (Optionally
a `test:integration:watch` mirroring `test:watch`.)

#### 4. Two-user / service-role test helper

**File**: `tests/integration/helpers/supabase.ts`

**Intent**: Centralize the minting recipe so the Risk #1 suite reads cleanly: build a service-role
client, create two users, return per-user signed-in clients, and provide a cleanup that deletes both
users.

**Contract**:
- Reads `SUPABASE_URL` + `SUPABASE_KEY` (anon) from env (Node `process.env`; developer/CI sources them from `.dev.vars` / secrets) and `SUPABASE_SERVICE_ROLE_KEY` from env. **Fail fast**: if `SUPABASE_SERVICE_ROLE_KEY` is missing, throw an explicit error naming `supabase status -o env` as the fix (so the suite errors loudly rather than silently skipping isolation).
- `serviceClient()` → `createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })`.
- `mintUser(email, password)` → `serviceClient.auth.admin.createUser({ email, password, email_confirm: true })`, then a fresh per-user `createClient(URL, ANON_KEY, { auth: { persistSession: false } })` + `signInWithPassword`; returns `{ id, client }`.
- `makeUsers()` → mints two users with run-unique emails (e.g. derived from an incrementing counter + a fixed prefix; **do not** use `Math.random`/`Date.now` — they are banned in workflow scripts but fine here, however prefer a counter for determinism) and returns `{ a, b, cleanup }` where `cleanup()` calls `auth.admin.deleteUser` for both.

**Note**: Email uniqueness can use `crypto.randomUUID()` (Web Crypto, available in Node 22) — this
is a *test* file, not request-reachable code, so the Cloudflare Node-API restriction does not apply.

### Success Criteria:

#### Automated Verification:

- Unit lane still green and still DB-free: `npm run test` (passes with no Supabase running)
- Integration config resolves and finds zero-or-more tests without error: `npm run test:integration` (with local Supabase up + keys exported; green on an empty/placeholder suite)
- Unit lane does **not** pick up `tests/integration/**`: `npm run test` run with Supabase **down** still passes (no DB test executed)
- Linting passes: `npm run lint`

#### Manual Verification:

- With `SUPABASE_SERVICE_ROLE_KEY` unset, `npm run test:integration` fails fast with the
  documented "run `supabase status -o env`" message — not a confusing auth error.
- `supabase start` is running locally; `supabase status` shows the API on `54321`.

**Implementation Note**: After Phase 2 automated verification passes, pause for manual
confirmation before Phase 3.

---

## Phase 3: Risk #1 — Data-isolation integration suite

### Overview

Using the Phase 2 helper, prove user B cannot reach user A's data across every surface research
named: read, update, delete, forged insert, and the cross-user category FK. Assert DB state.

### Changes Required:

#### 1. Cross-user denial matrix

**File**: `tests/integration/data-isolation.test.ts`

**Intent**: With two minted users A and B, seed A's data via A's own client, then attempt each
cross-user access as B and verify the database denies it. Re-read A's rows (as A or via the service
client) to confirm side-effects, never trusting a status code.

**Contract** — cases (all assert DB state):
- **Read denial (`USING`)**: A inserts a category; B's `.from("categories").select()` returns **0 rows** of A's data.
- **Update no-op**: B's `.from("categories").update(...).eq("id", aCategoryId)` returns 0 affected / no error; re-reading A's category (as A) shows it **unchanged**.
- **Delete no-op**: B's `.from("expenses").delete().eq("id", aExpenseId)` is a 0-row no-op; A's expense **still present** on re-read.
- **Forged insert (`WITH CHECK`)**: B's `.from("categories").insert({ ..., user_id: A.id })` is **rejected** (RLS `WITH CHECK` violation) — assert error / no row created under A.
- **Cross-user category FK**: B creates its own category, then B inserts an expense whose `category_id` is **A's** category id → the app path yields "Invalid or inaccessible category" (and a direct client insert is blocked by RLS, since B cannot see A's category) — assert no expense row references A's category.

**Setup/teardown**: `beforeAll` → `makeUsers()`; seed A's category + expense via A's client (a
category must exist before any expense insert). `afterAll` → `cleanup()` (cascade deletes both
users' rows). Each `it` is independent; avoid ordering coupling between cases.

### Success Criteria:

#### Automated Verification:

- Integration suite passes with local Supabase up + keys exported: `npm run test:integration`
- Full matrix present (read, update, delete, forged insert, FK): `npm run test:integration -- data-isolation`
- Unit lane unaffected and DB-free: `npm run test`
- Linting passes: `npm run lint`

#### Manual Verification:

- Temporarily dropping the `WITH CHECK` clause from one policy in a local DB (then
  `supabase db reset`) makes the **forged-insert** case fail — confirming the test exercises the
  real policy, not a mock.
- Cross-user UPDATE/DELETE cases still pass *even though the RPC returns no error* — confirming
  the assertions read DB state, not status.

**Implementation Note**: After Phase 3 automated verification passes, pause for manual
confirmation before Phase 4.

---

## Phase 4: Cookbook + run documentation

### Overview

Fill the test-plan cookbook so the next contributor can add an integration test and run the lane
without re-deriving the harness. No CI YAML (that is the rollout's Phase 4 change).

### Changes Required:

#### 1. Cookbook §6.2 — Adding an integration test

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.2 "TBD" with the real recipe: location (`tests/integration/`), the
two-user helper, the assert-DB-state rule, and the run command + prerequisites.

**Contract**: §6.2 names `tests/integration/**/*.test.ts`, the `tests/integration/helpers/supabase.ts`
helper, `npm run test:integration`, the `supabase start` prerequisite, and the
`SUPABASE_SERVICE_ROLE_KEY` env requirement (sourced from `supabase status -o env`). Reference test:
`tests/integration/data-isolation.test.ts`.

#### 2. Cookbook §6.4 — Adding a test for a new API endpoint

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.4 "TBD" (for the auth-guard portion) with the in-process handler pattern
from Phase 1: `vi.mock("astro:env/server")` + import handler + `locals.user=null` → assert
`302 → /auth/signin`. Note that ownership-scoped read/write goes through the integration lane
(§6.2), and input-validation rejection patterns remain Phase 3 of the rollout.

**Contract**: §6.4 references `src/pages/api/auth-guard.test.ts` as the canonical auth-guard
reference and points to §6.2 for the RLS/ownership side.

#### 3. Cookbook §6.6 — Per-rollout-phase note

**File**: `context/foundation/test-plan.md`

**Intent**: Add a "Phase 2 (testing-data-isolation, <date>)" note capturing the load-bearing
insights: assert DB state because cross-user writes are silent no-ops; the auth boundary is 302 not
401 and middleware misses `/api/*`; the lane is split to keep the unit floor DB-free; `getViteConfig()`
is deliberately avoided.

**Contract**: One paragraph under §6.6, same style as the existing Phase 1 note.

#### 4. Stack / gates status touch-ups (optional, same file)

**File**: `context/foundation/test-plan.md`

**Intent**: Update §4 Stack rows that say "none yet — see §3 Phase 2" to name the chosen harness
(Vitest integration lane + local Supabase) now that it is selected.

**Contract**: §4 "API / Worker integration" and "Supabase / RLS in tests" rows reference the
`vitest.integration.config.ts` lane; keep `checked:` honest. (The §5 integration gate stays
"required after §3 Phase 2" — wiring is the rollout's Phase 4.)

#### 5. Local run note for the service-role key

**File**: `.env.example` (or a short note appended near the existing Supabase var docs)

**Intent**: Document that integration tests need `SUPABASE_SERVICE_ROLE_KEY`, obtained locally via
`supabase status -o env`, and is **not** committed.

**Contract**: One commented line documenting the var and its source. Do not commit a real key.

### Success Criteria:

#### Automated Verification:

- Markdown lints/formats clean (husky/prettier on commit): `npm run lint` and prettier on the
  edited `.md`
- No "TBD — see §3 Phase 2" strings remain in §6.2 / §6.4: grep returns nothing for that phrase
  in those sections

#### Manual Verification:

- A reader unfamiliar with this change can, from §6.2 alone, run the integration lane (start
  Supabase, export the key, `npm run test:integration`).
- §6.6 Phase 2 note reads consistently with the existing Phase 1 note.

**Implementation Note**: After Phase 4, the change is ready to archive; CI wiring is handed to the
test-plan rollout's Phase 4 change.

---

## Testing Strategy

### Unit Tests (Risk #5):

- Five endpoints × unauthenticated POST → `302 → /auth/signin`.
- Edge: the `expenses/[id].ts` thin delete path is included even though it has no existence
  check — its guard is the only thing standing between an anonymous request and a delete attempt.

### Integration Tests (Risk #1):

- Read denial, update no-op, delete no-op, forged insert (`WITH CHECK`), cross-user category FK.
- All assert **DB state**; none assert HTTP/RPC status.

### Manual Testing Steps:

1. `supabase start`; `export $(supabase status -o env | grep SERVICE_ROLE)` (or set
   `SUPABASE_SERVICE_ROLE_KEY` directly).
2. `npm run test` — unit lane green, runs without Supabase.
3. `npm run test:integration` — Risk #1 suite green.
4. Flip a guard / drop a `WITH CHECK` locally to confirm the relevant test fails (mutation check).

## Performance Considerations

- Integration tests mint and delete two real users per file via the service client; keep the
  suite to one file with shared `beforeAll`/`afterAll` to avoid repeated user churn.
- The unit lane stays milliseconds-fast and DB-free; the integration lane is opt-in locally and
  gated behind `supabase start`.

## Migration Notes

None — additive. No schema, no data migration, no production code change.

## References

- Research: `context/changes/testing-data-isolation/research.md` (esp. §C and "Decisions for the plan")
- Test plan: `context/foundation/test-plan.md` §2 Risk Response (#1, #5), §3 row 2, §6
- RLS policy: `supabase/migrations/20260528132105_create_budget_schema.sql:56-67`
- Middleware gap: `src/middleware.ts:4,18,20`
- Thin isolation path: `src/pages/api/expenses/[id].ts:21-27`
- Sibling Phase 1: `context/changes/testing-report-math/` (established the Vitest runner + `@/*` alias)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Risk #5 — Auth-guard tests (unit lane, DB-free)

#### Automated

- [x] 1.1 Unit suite passes: `npm run test`
- [x] 1.2 New cases discovered (5 endpoints asserted): `npm run test -- auth-guard`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [x] 1.4 Commenting one endpoint's `if (!user)` guard makes that case fail (guard actually exercised)

### Phase 2: Integration lane scaffold (config, script, helper)

#### Automated

- [ ] 2.1 Unit lane still green and DB-free: `npm run test` (Supabase down)
- [ ] 2.2 Integration config resolves with no error: `npm run test:integration` (Supabase up, keys set)
- [ ] 2.3 Unit lane does not pick up `tests/integration/**` (Supabase down still passes)
- [ ] 2.4 Linting passes: `npm run lint`

#### Manual

- [ ] 2.5 Unset `SUPABASE_SERVICE_ROLE_KEY` → `npm run test:integration` fails fast with the documented message
- [ ] 2.6 `supabase status` shows API on `54321` locally

### Phase 3: Risk #1 — Data-isolation integration suite

#### Automated

- [ ] 3.1 Integration suite passes: `npm run test:integration` (Supabase up, keys set)
- [ ] 3.2 Full matrix present (read/update/delete/forged-insert/FK): `npm run test:integration -- data-isolation`
- [ ] 3.3 Unit lane unaffected and DB-free: `npm run test`
- [ ] 3.4 Linting passes: `npm run lint`

#### Manual

- [ ] 3.5 Dropping a `WITH CHECK` clause locally makes the forged-insert case fail (real policy exercised)
- [ ] 3.6 Update/delete cases pass despite no-error RPC (assertions read DB state, not status)

### Phase 4: Cookbook + run documentation

#### Automated

- [ ] 4.1 Markdown lints/formats clean: `npm run lint` + prettier on edited `.md`
- [ ] 4.2 No "TBD — see §3 Phase 2" remains in §6.2 / §6.4 (grep)

#### Manual

- [ ] 4.3 A fresh reader can run the integration lane from §6.2 alone
- [ ] 4.4 §6.6 Phase 2 note reads consistently with the Phase 1 note

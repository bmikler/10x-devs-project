# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-15

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the user
   is worried about X, and the failure would surface somewhere in `<area>`"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/`
(excluding docs, fixtures, `dist`, `node_modules`, generated types).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|--------------------------|--------|------------|--------------------------------|
| 1 | A signed-in user reads or modifies **another user's** categories/expenses — ownership not enforced on a read/write path | High | High | PRD §Access Control / §Data isolation guardrail; interview Q1 (top fear); hot-spot dir `src/pages/api/` (13 commits/30d); tech-stack.md (Supabase RLS, unfamiliar ground) *(abuse: authorization/IDOR)* |
| 2 | The report shows **wrong remaining/spent/avg/burn** for a category — aggregation arithmetic is incorrect | High | High | PRD §Business Logic (plan-relative roll-up); interview Q3 (lowest-confidence area); hot-spot dirs `src/pages/report/` (11/30d) + `src/lib/report.ts` (4/30d) |
| 3 | An expense near a **year boundary** is attributed to the wrong calendar year — pollutes or vanishes from the current-year report | High | Medium | PRD §Calendar-year boundary; `lessons.md` (Warsaw-timezone year-extraction pitfall); interview Q3 |
| 4 | A logged expense is **lost** — a "saved" expense does not persist, or **category-delete drops/orphans** its expenses instead of reassigning to "other" | High | Medium | PRD NFR §Data durability; FR-006 (cascade-to-"other"); roadmap S-07 risk note; hot-spot dir `src/pages/api/` |
| 5 | An **unauthenticated** request reaches a gated page or API endpoint — middleware/guard gap | High | Medium | PRD FR-001/FR-002, §Data isolation; hot-spot dirs `src/pages/auth/` + `src/components/auth/` (~15/30d combined) *(abuse: auth boundary)* |
| 6 | The server accepts **malformed/hostile input** (negative/zero/non-numeric/oversized amount, missing fields, wrong type), corrupting reports | Medium | Medium | PRD FR-003/FR-007; hot-spot dir `src/pages/api/` (13/30d) *(abuse: untrusted input / server-side validation parity)* |

**Impact × Likelihood rubric.** Score both axes on a coarse High / Medium /
Low scale so two readers agree on the same row.

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

Order: #1 and #2 are High × High — protect first. #3–#5 are High-impact,
Medium-likelihood. #6 is Medium × Medium. A "primary loop slower than the
< 2s NFR" scenario was considered and left out: it only bites at data
volume a single user will not reach, and belongs to observability, not a
test.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A request authenticated as user A **cannot** read or write user B's rows — denial holds even when the client supplies B's id | "Logged in" ≠ "owns this resource"; an RLS `USING` clause without `WITH CHECK` only filters reads, it does not block a malicious write | where ownership is actually enforced (RLS policy vs endpoint code), the Supabase client/session shape, how a second user's identity is simulated | integration | over-mocking the DB so the RLS policy never actually runs in the test |
| #2 | For a known fixture of expenses, avg-monthly / cumulative-yearly / remaining / burn% match values **derived independently from the PRD formula** | "The function returns a number, so it is right" | the elapsed-Warsaw-months divisor, the recurring-vs-irregular branch, the "other" spent-only row, what "burn %" is defined as | unit (pure function) | **oracle problem** — lifting expected values out of the implementation instead of computing them from the PRD |
| #3 | An expense at 23:30 on Dec 31 (Warsaw) lands in the correct calendar year and the next year's query excludes it | "UTC year == Warsaw year"; that the Warsaw-noon storage invariant always holds for every write path | the storage timezone convention and the report query's year-range bounds | unit / integration | only testing mid-year dates that never exercise the boundary |
| #4 | After deleting a category that has N expenses, all N still exist and are reassigned to "other"; an expense whose save returned success is durably readable on reload | "Final HTTP 200 means it persisted"; that the cascade is atomic | whether cascade lives in a DB trigger or app code, the transactional boundary, the seeding rule for "other" | integration | asserting only the HTTP status and never re-reading the affected rows |
| #5 | A request with no/invalid session to a gated page or `/api/*` is rejected (redirect or 401), never served the protected resource | "Middleware covers every route"; that a passing happy-path login implies the guard works | which route patterns middleware actually matches, and any per-endpoint auth checks | integration | testing only the authenticated path |
| #6 | The endpoint rejects a negative/zero/NaN/oversized amount and missing required fields with a clean error, and writes no bad row | "The React form validates, so the server can trust the client" | server-side validation location and its effect on persisted state | integration | mirroring the client-side validation rules as the test's oracle |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|----------------|
| 1 | Bootstrap runner + report-math coverage | Stand up the test runner; prove report arithmetic and year-boundary attribution against PRD-derived oracles | #2, #3 | unit | complete | context/changes/testing-report-math/ |
| 2 | Data-isolation & auth-boundary integration | Prove cross-user access is denied and unauthenticated requests are rejected at the API/route boundary | #1, #5 | integration | complete | context/changes/testing-data-isolation/ |
| 3 | Mutation safety: cascade + input validation | Prove category-delete preserves expenses via "other", and the server rejects hostile input | #4, #6 | integration | complete | context/changes/testing-mutation-safety/ |
| 4 | Quality-gates wiring | Lock unit + integration into the existing GitHub Actions CI floor | cross-cutting | gates (CI) | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` →
`change opened` → `researched` → `planned` → `implementing` → `complete`.

No AI-native phase and no dedicated e2e phase are included: this is a
single-user app with deterministic domain logic. Integration tests catch
the API-boundary risks more cheaply than e2e, and a vision/LLM layer adds
no signal over the unit oracles in Phase 1. Revisit under `--refresh` if
multi-user or a richer UI surface lands.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit | Vitest | ^3.2.x | Node environment; `vitest.config.ts` re-declares `@/*` alias (not inherited from Astro's Vite config); `*.test.ts` colocated next to source. Integration lane is separate — see §6.2. |
| API / Worker integration | Vitest integration lane | ^3.2.x | `vitest.integration.config.ts` targets `tests/integration/**/*.test.ts`; `npm run test:integration` (one-shot) / `npm run test:integration:watch`; requires `supabase start` + exported keys (see §6.2). checked: 2026-06-18 |
| Supabase / RLS in tests | Local Supabase + service-role client | CLI ^2.98.x | `tests/integration/helpers/supabase.ts` mints two users via `auth.admin.createUser`; each gets its own `createClient` + `signInWithPassword` so `auth.uid()` resolves correctly per client. Use JWT-format `ANON_KEY` from `supabase status -o env` (not the opaque `sb_publishable_…` key). checked: 2026-06-18 |
| e2e | not adopted | — | Deliberately deferred — integration covers the API risks more cheaply (see §3) |
| accessibility | not adopted | — | PRD §Non-Goals: reasonable contrast/keyboard only, no formal WCAG-AA audit |

**Stack grounding tools (current session):**
- Docs: Context7 / framework docs MCP — **not available in current session**; Astro/Supabase/Vitest setup not version-checked against live docs here; checked: 2026-06-15
- Search: web search — available; can validate current test-runner guidance for the Astro/Cloudflare stack during Phase 1 research; checked: 2026-06-15
- Runtime/browser: Playwright MCP — **not available in current session**; Playwright would be a new dependency if e2e is ever adopted (it is not, see §3)
- Provider/platform: Cloudflare Observability MCP is referenced in `roadmap.md` baseline but **not exposed in current session**; Supabase CLI is present locally (`npm run db:types`). Either could support a future pre-prod smoke gate; not used here. checked: 2026-06-15

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase `<N>`" means the gate is enforced once that
rollout phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required (already wired: `.github/workflows/ci.yml`, husky pre-commit) | syntactic / type drift |
| unit | local + CI | required (wired: `ci.yml` Phase 1) | report-arithmetic and year-boundary regressions |
| integration | local + CI | required after §3 Phase 2 | data-isolation, auth-boundary, cascade, validation regressions |
| post-edit hook | local (agent loop) | recommended local | regressions at edit time; not a CI substitute |
| pre-prod smoke | between merge + prod | optional | environment-specific failures (Worker + Supabase wiring) |

CI exists today (`.github/workflows/ci.yml` runs lint + build on push/PR to
`master`). Phase 4 wires the unit + integration gates into it. e2e and
visual-diff gates are intentionally absent (see §3 and §7).

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase `<N>`."

### 6.1 Adding a unit test

**Location:** colocated with source — `src/lib/<module>.test.ts` next to
`src/lib/<module>.ts`. See `src/lib/report.test.ts` as the canonical reference.

**Naming:** `<module>.test.ts`. Vitest discovers all `*.test.ts` files under `src/`
automatically — no registration needed.

**Run commands:**
- `npm run test` — one-shot, exits 0 on green (CI mode)
- `npm run test:watch` — re-runs on file change (local dev)

**Oracle rule (critical):** derive expected values from the PRD or an agreed
definition — **never lift them from the function's own output**. Lifting from
the implementation is the oracle anti-pattern: a wrong function passes its own
wrong numbers. For arithmetic, write out the formula in a comment step-by-step,
compute the answer, then encode that as the assertion value.

**Fake timers:** when the code under test calls `new Date()` or `todayInWarsaw()`,
use `vi.useFakeTimers()` + `vi.setSystemTime(new Date("..."))` in a `beforeEach`
inside a nested `describe`, and restore with `vi.useRealTimers()` in `afterEach`.
See `src/lib/expense-write.test.ts` for the pattern.

**Reference tests:**
- `src/lib/report.test.ts` — report arithmetic, sorting, oracle-derived cases
- `src/lib/expense-write.test.ts` — `warsawNoon` DST + fake-timers for `validateExpenseFields`
- `src/lib/budget-year.test.ts` — `getExpenseCutoff` boundary cases

### 6.2 Adding an integration test

**Location:** `tests/integration/**/*.test.ts` — discovered by the integration lane, never by the unit lane.

**Helper:** `tests/integration/helpers/supabase.ts` exports `makeUsers()`, which mints two run-unique users via the service-role client, signs each into their own `createClient` instance, and returns `{ a, b, cleanup }`. Call `cleanup()` in `afterAll`; `ON DELETE CASCADE` wipes all their rows automatically.

**Rule (critical): assert DB state, not status.** Cross-user `UPDATE`/`DELETE` on RLS-protected tables return no error and affect 0 rows — re-read the target row (as the owning user or via the service client) to confirm it is unchanged. A test that only checks the RPC response passes against a broken policy.

**Prerequisites:**
1. `supabase start` — local Supabase running, API on port 54321.
2. `export $(supabase status -o env | grep -E 'ANON_KEY|SERVICE_ROLE_KEY')` — exports the JWT anon key and service-role key. Use the JWT-format `ANON_KEY`; the opaque `sb_publishable_…` key does not work with local PostgREST.

**Run commands:**
- `npm run test:integration` — one-shot, exits 0 on green.
- `npm run test:integration:watch` — watch mode for local dev.

**Reference test:** `tests/integration/data-isolation.test.ts`

### 6.3 Adding an e2e test

- Not adopted — see §3. Integration covers the API risks; revisit under `--refresh` if a multi-user or richer UI surface lands.

### 6.4 Adding a test for a new API endpoint

**Auth-guard (unauthenticated rejection) — unit lane, DB-free:**

1. Mock the runtime virtual at the top of the test file:
   `vi.mock("astro:env/server", () => ({ SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_KEY: "test-anon-key" }))`
2. Import the handler: `const { POST } = await import("@/pages/api/<endpoint>")`.
3. Synthesize a minimal `APIContext` with `locals.user = null`, empty cookies, and a `redirect()` shim that returns `new Response(null, { status: 302, headers: { Location: path } })`.
4. Assert `res.status === 302` and `res.headers.get("Location") === "/auth/signin"`.

Note: `middleware.ts` only matches page prefixes — every `/api/*` endpoint carries its own `if (!locals.user)` guard. Both emit 302, not 401/403.

**Reference test:** `src/pages/api/auth-guard.test.ts`

**Ownership-scoped read/write (RLS enforcement):** Use the integration lane — see §6.2.

**Input-validation rejection:** Unit lane, DB-free — see §6.5 for the full pattern.

### 6.5 Adding a test for the cascade / mutation rules

#### Integration — cascade and DB constraint backstop

**Reference test:** `tests/integration/mutation-safety.test.ts` — integration lane, requires `supabase start` (see §6.2 prerequisites).

**"other" seeding rule (critical):** The `is_system = true` "other" category is **not** auto-seeded by `auth.admin.createUser` — seed it manually in `beforeAll` via the user's own client:

```typescript
import { SYSTEM_OTHER_NAME } from "@/lib/categories";

const { data } = await users.a.client.from("categories").insert({
  user_id: users.a.id,
  year: TEST_YEAR,
  name: SYSTEM_OTHER_NAME,
  type: "irregular",
  is_system: true,
  // do NOT pass limit_cents — the DB constraint requires it to be NULL for system rows
}).select("id").single();
```

**Assertion rule (critical):** Assert DB state post-delete — re-read the affected expenses and check `category_id`, not just the delete operation's return value. This mirrors the §6.2 rule for cross-user writes: the DB operation may return no error while silently doing nothing.

```typescript
// After deleting the named category:
const { data: moved } = await users.a.client.from("expenses")
  .select("id,category_id")
  .in("id", expenseIds);
expect(moved).toHaveLength(2);
expect(moved!.every(e => e.category_id === otherId)).toBe(true);
```

**DB constraint backstop pattern:** Insert with `amount_cents: 0` directly via the client; assert `error !== null` then re-read to confirm 0 rows were written.

```typescript
const { error } = await users.a.client.from("expenses")
  .insert({ user_id: users.a.id, category_id: otherId, name: "bad", amount_cents: 0 });
expect(error).not.toBeNull();
const { data: bad } = await users.a.client.from("expenses").select("id").eq("name", "bad");
expect(bad).toHaveLength(0);
```

**Test ordering:** Run the durability re-read test **before** the cascade test — the cascade deletes the named category and mutates shared state. The system-protection and constraint tests are independent.

#### Unit — input-validation handler tests

**Reference test:** `src/pages/api/expenses/input-validation.test.ts` — unit lane, DB-free.

**Pattern:** mirrors `src/pages/api/auth-guard.test.ts`. Top-level `vi.mock("astro:env/server")` so `createClient` receives a valid-looking URL/key and does not return `null`. A `makeContext(form)` factory sets `locals.user` to a non-null object so the auth guard passes; validation fires before any supabase call.

```typescript
vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_KEY: "test-anon-key",
}));

function makeContext(form: FormData): Parameters<APIRoute>[0] {
  return {
    request: new Request("http://localhost/api/expenses", { method: "POST", body: form }),
    cookies: { get: () => undefined, getAll: () => [], has: () => false, set: vi.fn(), delete: vi.fn() },
    locals: { user: { id: "test-user-id" } },
    params: {},
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as Parameters<APIRoute>[0];
}
```

Use a `validForm()` helper that sets all valid defaults (`amount: "10.00"`, `category_id: "<uuid>"`, `date: "2026-06-01"`); each test overrides exactly one bad field. For missing-field cases, call `form.delete("fieldName")`.

**Shared assertion:** `expect(res.status).toBe(302)` + `expect(res.headers.get("Location")).toMatch(/^\/expenses\?error=/)`. A 302 to the error path proves validation fired and no DB write occurred.

### 6.6 Per-rollout-phase notes

**Phase 2 (testing-data-isolation, 2026-06-18):** The load-bearing insight: cross-user `UPDATE`/`DELETE` on RLS-protected tables return no error and affect 0 rows — tests must assert DB state (re-read the row as the owning user), never the RPC status. The auth boundary emits `302 → /auth/signin`, not 401/403, and `src/middleware.ts` only matches page-route prefixes — every `/api/*` endpoint compensates with its own `if (!locals.user)` guard. The unit and integration lanes are physically split (`vitest.config.ts` excludes `tests/integration/**`; `vitest.integration.config.ts` targets only that directory) so `npm run test` stays DB-free and CI-safe without Supabase. `getViteConfig()` is deliberately avoided — it breaks on Astro 6 + `@astrojs/cloudflare`. For local Supabase, use the JWT-format `ANON_KEY` from `supabase status -o env` as the API key; the newer opaque `sb_publishable_…` key is not recognised by local PostgREST. Running `supabase db reset` is the reliable way to apply migrations to the local DB if PostgREST reports a schema-cache miss despite the migration file being tracked.

**Phase 1 (testing-report-math, 2026-06-15):** The noon-pin invariant
(`warsawNoon`) is the load-bearing piece for year-boundary safety — the SQL
half-open range is correct *because* every stored instant is pinned to Warsaw
noon (~10–11h from midnight, outside the UTC-vs-Warsaw ambiguity window). Unit-
testing the write-side pin is cheaper and more direct than a DB round-trip for
this risk. The rounding-order oracle for `buildReport` (`burnPct` must derive
from the *rounded* avg, not the raw quotient) required a hand-crafted fixture:
`totalSpent=599, elapsedMonths=4, limit=400` — the smallest integer case where
the two approaches diverge at the `burnPct` level.

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **UI snapshot / pixel tests** — they break on every Tailwind tweak and catch nothing; the S-08 visual refresh churns the UI heavily. Re-evaluate only if a rendering regression escapes to prod. (Source: Phase 2 interview Q5.)
- **Generated `database.types.ts`** — produced by the Supabase CLI; the generator is the test. Re-evaluate if hand-edits ever appear. (Source: Phase 2 interview Q5.)
- **Supabase auth/session internals** — trust the library; test only our middleware and ownership glue (covered by Risks #1, #5). Re-evaluate if we replace the auth provider. (Source: Phase 2 interview Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-15
- Stack versions last verified: 2026-06-15
- AI-native tool references last verified: 2026-06-15

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.

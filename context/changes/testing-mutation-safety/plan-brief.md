# Mutation Safety: Cascade + Input Validation — Plan Brief

> Full plan: `context/changes/testing-mutation-safety/plan.md`

## What & Why

Phase 3 of the test rollout (test-plan §3 row 3). Protects two risks: **Risk #4** — that
a category delete could silently lose expenses instead of reassigning them to "other", and
**Risk #6** — that the expense endpoint trusts the client and writes malformed data (negative
amounts, missing fields) to the DB. Both risks are currently untested; this plan adds the
integration and unit tests that prove they're protected.

## Starting Point

The test infrastructure is in place from Phases 1 and 2: Vitest unit lane (`npm run test`),
integration lane (`npm run test:integration`), `makeUsers()` helper, and the in-process
handler test pattern (`auth-guard.test.ts`). The cascade lives entirely in a DB trigger
(`fn_cascade_to_other`) — no app code handles the reassignment. Input validation lives in
`validateExpenseFields` (pure function), called before any DB operation in the handler.

## Desired End State

Two new test files:

- `tests/integration/mutation-safety.test.ts` — proves cascade reassignment, expense
  durability, "other" is DB-protected, and `amount_cents > 0` is enforced at the DB.
- `src/pages/api/expenses/input-validation.test.ts` — proves the handler rejects every
  hostile input class (missing/zero/negative/non-numeric amount, missing category, future date)
  with a redirect before any DB call.

`§6.5` of the cookbook is filled in; Phase 3 row in the rollout table is `complete`.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| "other" seeding in tests | User's own client direct insert (`is_system: true`) | No need to export the internal `serviceClient()`; RLS permits the insert and no INSERT trigger blocks it | Plan |
| Validation test lane | Unit lane (in-process handler) + integration lane (DB constraint) | Cheapest layer per test-plan: app logic is DB-free; DB backstop needs a real Supabase | Plan |
| Durability test | Explicit `it()` case in the integration suite | Makes the intentional coverage visible; not left as an implicit side-effect of cascade setup | Plan |
| Integration file layout | One file (`mutation-safety.test.ts`) | Shares one user fixture; mirrors `data-isolation.test.ts` co-location convention | Plan |
| Cascade seed count | 2 expenses | Distinguishes "all N reassigned" from a coincidence without over-engineering | Plan |
| No-write proof | Implicit in unit lane (redirect = before DB call); explicit DB re-read in integration | Each lane does exactly what it's good at; no fragile spy mocks | Plan |

## Scope

**In scope:**
- Integration tests for cascade (Risk #4): durability, reassignment, system-category protection, DB constraint backstop
- Unit handler tests for input validation (Risk #6): all 6 hostile input classes
- §6.5 cookbook entry + rollout status update

**Out of scope:**
- No production code changes (no migrations, no endpoint edits)
- No testing of React form validation (the anti-pattern)
- No test of the `[id].ts` update path for validation (same function; covered implicitly)

## Architecture / Approach

```
Phase 1 (integration lane)          Phase 2 (unit lane)
────────────────────────────        ───────────────────────────────────
tests/integration/                  src/pages/api/expenses/
  mutation-safety.test.ts             input-validation.test.ts
    makeUsers() (one active)            vi.mock("astro:env/server")
    seed "other" via user client        makeContext(form: FormData)
    seed "food" + 2 expenses            locals.user = { id: "..." }
    ↓                                   ↓
  direct .delete() → trigger fires    POST(ctx) → validateExpenseFields()
  re-read DB state (not HTTP status)  assert 302 + /expenses?error=
```

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Cascade + durability integration | 4 integration tests proving DB trigger + durability | "other" must be manually seeded in `beforeAll`; missing it causes trigger to raise exception |
| 2. Input validation handler | 6 unit tests proving server-side rejection + implicit no-write proof | `new Request(url, { body: formData })` must work in Node 18+ Vitest env (already proven by auth-guard pattern) |
| 3. Cookbook + status | §6.5 filled in; Phase 3 row marked complete | None |

**Prerequisites:** `supabase start` + `export $(supabase status -o env | grep -E 'ANON_KEY|SERVICE_ROLE_KEY')` for Phase 1.
**Estimated effort:** ~1 session across 3 phases.

## Open Risks & Assumptions

- `new FormData()` + `new Request(url, { body: form })` works for `request.formData()` in
  Node 18+ Vitest — assumed from the existing `new Request()` usage in `auth-guard.test.ts`;
  if it doesn't, fall back to `URLSearchParams` + `application/x-www-form-urlencoded` encoding.
- The DB constraint test uses `error.code === "23514"` (PostgreSQL CHECK violation); if the
  supabase-js client surfaces it differently, assert `error !== null` only.

## Success Criteria (Summary)

- `npm run test` exits 0 with 6 new input-validation tests passing.
- `npm run test:integration` exits 0 with 4 new mutation-safety tests passing.
- §6.5 in `test-plan.md` is a usable recipe, not a placeholder.

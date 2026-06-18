# Data-isolation & Auth-boundary Integration Tests — Plan Brief

> Full plan: `context/changes/testing-data-isolation/plan.md`
> Research: `context/changes/testing-data-isolation/research.md`

## What & Why

Phase 2 of the test-plan rollout. Add integration-grade tests for two High-impact risks:
**Risk #1** — a signed-in user reads or modifies *another user's* categories/expenses; and
**Risk #5** — an *unauthenticated* request reaches a gated API endpoint. These are the
isolation/auth guarantees the PRD calls "structural"; nothing currently proves they hold.

## Starting Point

Ownership is enforced entirely by **Supabase RLS** (`FOR ALL TO authenticated` with both
`USING` and `WITH CHECK`), not by app code — no endpoint filters by `user_id`. The auth
boundary is asymmetric: middleware guards only four *page* prefixes and never matches `/api/*`;
each API endpoint re-checks `locals.user` itself, redirecting `302 → /auth/signin`. A plain
Vitest unit lane exists from Phase 1; there is no integration harness and no service-role client.

## Desired End State

`npm run test` (DB-free unit lane) proves every gated POST endpoint rejects an anonymous request
with `302 → /auth/signin`. A new `npm run test:integration` lane, run against local Supabase with
two real users, proves user B cannot read, update, delete, or forge-insert into user A's data —
asserting **database state**, because cross-user writes are silent 0-row no-ops under RLS.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Isolation boundary | Keep RLS; test it for real | Mocking the DB would test that code *called* a filter, not that isolation *holds* (the §2 #1 anti-pattern). | Research |
| Risk #5 harness | In-process handlers, `vi.mock("astro:env/server")` | Empirically works under the current plain config; `getViteConfig()` breaks on Astro 6 + Cloudflare. | Research |
| Risk #1 harness | Live local Supabase, two minted users | Only a real RLS run proves the policy; assert DB state, not HTTP status. | Research |
| Lane split | Separate `vitest.integration.config.ts` + `test:integration` script | Keeps the fast unit gate DB-free and CI-green today; explicit beats `projects` magic. | Plan |
| Test file layout | Dedicated `tests/integration/` dir | Physical separation makes the DB-free boundary self-documenting. | Plan |
| Risk #5 lane | Unit lane (DB-free) | The guard test needs no Supabase — keep it fast and on every run. | Plan |
| Service-role key | Env var, fail-fast if absent | No subprocess; CI-friendly; loud failure beats silent skip. | Plan |
| Risk #1 scope | Full denial matrix + FK probe | Covers `USING`, `WITH CHECK`, no-op writes, and the non-composite category FK. | Plan |

## Scope

**In scope:** Risk #5 auth-guard unit tests (5 endpoints); a separate integration lane (config,
script, two-user helper); the Risk #1 data-isolation suite; test-plan §6 cookbook updates.

**Out of scope:** Any production code change; CI YAML wiring (rollout Phase 4); Risk #4/#6
(rollout Phase 3); e2e/page-redirect fidelity; `getViteConfig()`; a seed file.

## Architecture / Approach

Two test surfaces, cheapest-signal-first. **Unit lane** (`npm run test`): import each POST
handler with mocked env and `locals.user = null`, assert the 302 — no DB. **Integration lane**
(`npm run test:integration`): a helper mints two users via a service-role client
(`auth.admin.createUser`, `email_confirm:true`), hands each a own signed-in per-user client, the
suite seeds A's data and verifies B is denied every way, then `afterAll` deletes both users
(`ON DELETE CASCADE` cleans up). The two lanes never see each other's files.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Risk #5 auth-guard tests | 5 endpoints assert `302 → /auth/signin`, DB-free | Synthesizing a faithful `APIContext`/redirect shim |
| 2. Integration lane scaffold | `vitest.integration.config.ts`, `test:integration`, two-user helper | Keeping the unit lane provably DB-free; key fail-fast |
| 3. Risk #1 isolation suite | Read/update/delete/forged-insert/FK denial, asserting DB state | Asserting side-effects, not no-error RPC status |
| 4. Cookbook + run docs | test-plan §6.2/§6.4/§6.6 filled; key-sourcing note | Keeping CI out (that's rollout Phase 4) |

**Prerequisites:** local Supabase (`supabase start`); `SUPABASE_SERVICE_ROLE_KEY` from
`supabase status -o env`; no new npm packages.
**Estimated effort:** ~2 sessions across 4 phases (Phase 1 + 4 are light; 2 + 3 carry the work).

## Open Risks & Assumptions

- Assumes the in-process handler import stays feasible under the current `vitest.config.ts`
  (proven by the research probe; re-verify if Astro/Vite versions bump).
- The integration lane requires a running local Supabase — it is opt-in locally and not yet in
  CI (deliberate; rollout Phase 4 wires it).
- Cross-user no-op assertions must read DB state; a reviewer should confirm no case asserts only
  status.

## Success Criteria (Summary)

- `npm run test` green with the new Risk #5 cases, still runs with no Supabase.
- `npm run test:integration` green against local Supabase: B denied read/update/delete/forge/FK.
- test-plan §6 cookbook lets the next contributor add an integration test without re-deriving the harness.

# Bootstrap runner + report-math coverage — Plan Brief

> Full plan: `context/changes/testing-report-math/plan.md`
> Research: `context/changes/testing-report-math/research.md`

## What & Why

Stand up the project's first test runner (Vitest) and write PRD-grounded unit
tests for the two top risks `test-plan.md` §3 Phase 1 owns: **Risk #2** (report
arithmetic shows wrong remaining/spent/avg/burn) and **Risk #3** (an expense near
a Warsaw year boundary is attributed to the wrong year). These are High×High /
High-Medium risks with zero coverage today.

## Starting Point

No runner exists (no `vitest`, no `test` script, zero test files). The target code
is already pure — `buildReport`/`buildMonthBreakdown` (`src/lib/report.ts`) and
`warsawNoon`/`validateExpenseFields` (`src/lib/expense-write.ts`) import nothing
runtime-coupled. CI runs lint + build only.

## Desired End State

`npm run test` runs a green Vitest suite covering report arithmetic, the
Warsaw-noon write invariant, validation, and the year cutoff. Every expected value
is computed from a written-down definition, never lifted from the code. The suite
runs in CI on every push/PR, and `test-plan.md` §6.1 documents how to add the next
unit test.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| "Average monthly spend" divisor | ÷ elapsed Warsaw months (current month inclusive) | Matches the deliberate per-category-report decision; encoded as a stated definition, not lifted from code | Plan |
| `burnPct` scope | Test with a pinned, code-defined formula | Burn is in Risk #2's wording and UI-visible; pin the formula as a plan contract (not PRD-derived), revisit at v1.1 | Plan |
| Risk #3 test target | Assert `warsawNoon` + validation directly | The noon invariant is what makes the read-side year range safe — highest signal at unit cost | Plan |
| Runner / CI scope | Add local runner **and** wire the CI unit gate now | User chose to enforce immediately, pulling a slice of §3 Phase 4 forward | Plan |
| Suite breadth | Core + `buildMonthBreakdown` + extracted `expenseCutoff` | Both pure and on the risk surface; cutoff is the read-boundary's only unit-testable piece | Plan |

## Scope

**In scope:** Vitest setup (`vitest.config.ts` with `@/*` alias, `test`/`test:watch`
scripts); unit tests for `buildReport`, `buildMonthBreakdown`, `warsawNoon`,
`validateExpenseFields`, extracted `getExpenseCutoff`; CI unit step; `test-plan.md`
§6.1 cookbook + §3/§4/§5 state updates.

**Out of scope:** integration/DB/RLS tests (Phases 2–3); the read-side SQL range
semantics (Phase 2); e2e, visual, AI-native layers; money-parsing tests; any change
to report behavior.

## Architecture / Approach

Bottom-up: runner first, then two risk-coverage suites with oracles from explicit
definitions, then CI gate + docs. The only production change is a behavior-preserving
extract of the inline `expenseCutoff` calc into a pure `getExpenseCutoff` helper so
it is unit-testable. Tests are colocated `*.test.ts`, Node environment (no
jsdom/browser), `@/*` alias re-declared for Vitest (it doesn't inherit Astro's Vite
config).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Bootstrap runner | Vitest + config + scripts + sanity test | `@/*` alias not resolving under ESM/`verbatimModuleSyntax` |
| 2. Report-math (Risk #2) | `buildReport` + `buildMonthBreakdown` tests | Oracle copied from code instead of derived (rounding-order trap) |
| 3. Year-boundary (Risk #3) | `warsawNoon`, validation, `getExpenseCutoff` tests | Non-deterministic date tests; extract regressing `/report` |
| 4. CI gate + docs | CI unit step, §6.1 cookbook, §3/§4/§5 updates | CI step misconfigured / needs env it shouldn't |

**Prerequisites:** none — research is complete and the target code is already pure.
**Estimated effort:** ~1–2 sessions across 4 phases (mostly authoring test cases).

## Open Risks & Assumptions

- **Wiring the CI gate now diverges from `test-plan.md` §3/§5 phasing** (which put
  the unit gate at Phase 4). Done by explicit user choice; Phase 4 then only needs
  the integration gate later. The §5 row is updated to match.
- The `burnPct` formula has **no PRD oracle**; it's pinned as a plan-level contract
  and must be revisited when v1.1 defines burn-rate.
- The read-side SQL year-range comparison stays **unverified until Phase 2
  integration** — Phase 1 covers the noon invariant that protects it.

## Success Criteria (Summary)

- `npm run test` passes locally and in CI with report-math + year-boundary coverage.
- Every numeric expectation traces to the agreed definition, not the implementation.
- `test-plan.md` §6.1 lets a new contributor add a unit test without re-deriving conventions.

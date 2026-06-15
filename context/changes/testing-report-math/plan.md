# Bootstrap runner + report-math coverage — Implementation Plan

## Overview

Stand up the project's first test runner (Vitest) and write **PRD-grounded unit
tests** for the two High×High / High-Medium risks that `test-plan.md` §3 Phase 1
owns:

- **Risk #2** — report arithmetic (`buildReport`, `buildMonthBreakdown` in
  `src/lib/report.ts`) shows wrong remaining / spent / avg / burn.
- **Risk #3** — an expense near a Warsaw year boundary is attributed to the
  wrong calendar year.

All target code is already pure TypeScript, so no production refactor is needed
beyond a one-function extract of an inline cutoff calculation. The phase ends by
enforcing the new suite as a CI gate and documenting the unit-test cookbook.

## Current State Analysis

- **No test runner exists.** No `vitest`/`jest`, no `test` script, zero
  `*.test.*` files, no test config (`package.json:5-17,40-60`). TypeScript
  `^5.9.3` is present; ESLint already globs `**/*.{js,jsx,ts,tsx}` and
  lint-staged runs on `*.{ts,tsx}`, so a new `*.test.ts` is linted/formatted
  with no override (`package.json:64-71`).
- **Report math is pure and import-free.** `buildReport`
  (`src/lib/report.ts:176-226`) and `buildMonthBreakdown`
  (`src/lib/report.ts:105-174`) use only `Intl`/`Map`/`Array`/`Math`/`String`.
  Aggregation lives in TS by deliberate decision
  (`context/changes/per-category-report/plan.md`); SQL is read-only fetch.
- **Year-boundary safety is a two-layer emergent property.** Writes pin
  `expense_at` to Warsaw noon (`warsawNoon`, `src/lib/expense-write.ts:17-32`,
  DST-aware, pure). The read query bounds the year with a bare-date half-open
  range `.gte('${year}-01-01').lt(expenseCutoff)` (`src/pages/report.astro:78-83`)
  — *not* the `EXTRACT(YEAR … AT TIME ZONE 'Europe/Warsaw')` convention in
  `lessons.md:13-15`. The range is correct **only because** the noon pin keeps
  every stored instant ~10–11h from midnight, out of the UTC-vs-Warsaw ambiguity
  band. The noon invariant is therefore the load-bearing thing to pin.
- **`expenseCutoff` is computed inline** (`src/pages/report.astro:75-76`) from
  `year` + `currentMonth`; it is pure but not yet importable.
- **CI runs lint + build only** (`.github/workflows/ci.yml:18-24`) on push/PR to
  `master`, Node 22.
- **`tsconfig.json` defines `@/*` → `./src/*`** with `module: ESNext`,
  `moduleResolution: Bundler`, `verbatimModuleSyntax: true`. Vitest does **not**
  inherit Astro's Vite config (`astro.config.mjs` registers only
  `tailwindcss()`), so the alias must be re-declared in `vitest.config.ts`.

## Desired End State

`npm run test` runs a green Vitest suite covering `buildReport`,
`buildMonthBreakdown`, `warsawNoon`, `validateExpenseFields`, and the extracted
`expenseCutoff` helper. Every numeric expectation is derived from a written-down
definition (below), never lifted from the implementation's output. The suite runs
in CI on every push/PR, and `test-plan.md` §6.1 documents how to add the next
unit test.

Verify: `npm run test` exits 0 with all suites passing; `npm run build` and
`npm run lint` still pass; CI shows a passing unit step; `test-plan.md` §3 Phase 1
row reads `complete`.

### Key Discoveries:

- `buildReport` recurring branch rounds `avg` **before** deriving `delta` and
  `burn` from it (`src/lib/report.ts:200,206,207`). Oracle fidelity depends on
  replicating that order.
- `is_system` short-circuits before the type branch (`src/lib/report.ts:193-196`)
  — "other" is a third shape (spend-only, no limit/burn), not a recurring/irregular
  special case.
- `warsawNoon` yields `…T11:00:00Z` for a winter (UTC+1) date and `…T10:00:00Z`
  for a summer (UTC+2) date (`src/lib/expense-write.ts:17-32`) — the DST branch is
  directly assertable.
- The `@/*` alias must be re-declared for Vitest; `expense-write.ts` imports
  `@/lib/money`, so the alias is load-bearing for that suite.

## What We're NOT Doing

- **No integration / DB / RLS tests.** Risks #1, #4, #5, #6 are §3 Phases 2–3.
- **No test of the read-side SQL range semantics** (does Postgres place a given
  row inside `[Y-01-01, cutoff)`). That is the one non-pure piece; it is deferred
  to Phase 2 integration. Phase 1 pins the write-side noon invariant that *makes*
  the range safe.
- **No e2e, no visual/snapshot, no AI-native layer** (`test-plan.md` §3, §7).
- **No money/parsing or `warsawMonthKey` standalone tests** — not Phase-1 risks
  (`warsawMonthKey` is exercised indirectly via `buildMonthBreakdown`).
- **No new "average monthly spend" behavior** — we encode the *existing* divisor
  as the agreed definition; we do not change the code.

## Implementation Approach

Bottom-up: get a runner that can import the pure modules (Phase 1), then add the
two risk-coverage suites with oracles computed from explicit definitions
(Phases 2–3), then lock the gate and document the pattern (Phase 4). The only
production code change is extracting `expenseCutoff` into a pure helper so it can
be unit-tested; `report.astro` then imports it (behavior-preserving).

### Agreed oracle definitions (the test contracts)

These are decided here so tests encode a *definition*, not the implementation's
output (the §2 oracle anti-pattern):

1. **Average monthly spend** = `round(totalSpentCents / elapsedMonths)`, where
   `elapsedMonths` is the current Warsaw month (1–12, current month **inclusive**).
   Confirmed agreed definition, matches `per-category-report/plan.md`.
2. **Rounding order** (recurring): `avg` is rounded first; then
   `delta = limit − avg` and `burn = round(avg / limit × 100)` derive from the
   **rounded** `avg`. Oracles must mirror this order.
3. **burnPct** = `limit > 0 ? round(metric / limit × 100) : null`, where `metric`
   is `avg` (recurring) or cumulative `spent` (irregular). This is a **plan-level
   contract, code-defined — not PRD-derived** (PRD defers burn to v1.1). If v1.1
   defines burn differently, this test must be revisited.
4. **Overspend is not clamped**: `delta` / `remaining` go negative. A negative
   row is a required oracle case, not an error.
5. **"other" / system row** is spend-only: `{ name, spentCents }`, no
   limit/remaining/burn.

## Phase 1: Bootstrap the runner

### Overview

Add Vitest and the minimum config so the pure modules import cleanly, plus the
npm scripts. Prove the runner works with one trivial sanity test.

### Changes Required:

#### 1. Test dependency + scripts

**File**: `package.json`

**Intent**: Add `vitest` as a devDependency and wire `test` (CI, non-watch) and
`test:watch` (local) scripts so both humans and CI have a single entry point.

**Contract**: New devDependency `vitest` (latest 3.x). Scripts:
`"test": "vitest run"`, `"test:watch": "vitest"`. Do not alter existing scripts.

#### 2. Vitest config with path alias

**File**: `vitest.config.ts` (new)

**Intent**: Give Vitest the `@/*` → `./src/*` alias it does not inherit from
Astro, and a Node test environment (pure math needs no jsdom/browser).

**Contract**: `defineConfig` from `vitest/config`; `test.environment: "node"`;
`resolve.alias` mapping `@` to the absolute `./src` dir. Keep it minimal — no
Tailwind/Cloudflare/browser setup. The alias is the one non-obvious requirement:

```ts
// resolve the alias from the config file's own location, no node:path import at top level needed beyond URL
resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } }
```

#### 3. Sanity test

**File**: `src/lib/report.test.ts` (new, will grow in Phase 2) — or a temporary
`src/sanity.test.ts` removed in Phase 2.

**Intent**: One trivial assertion plus one import of `buildReport` to prove the
runner resolves the `@/*` alias and ESM/`verbatimModuleSyntax` settings.

**Contract**: A `describe`/`it` importing `buildReport` from `@/lib/report` and
asserting it is a function. Establishes the colocated `*.test.ts` location used by
the cookbook.

### Success Criteria:

#### Automated Verification:

- Vitest installs and runs: `npm run test` exits 0
- The sanity test resolves the `@/*` alias (import does not error)
- Lint still passes on the new files: `npm run lint`
- Build is unaffected: `npm run build`

#### Manual Verification:

- `npm run test:watch` starts watch mode and re-runs on file change
- No Tailwind/Cloudflare/browser dependency was pulled into the test env

**Implementation Note**: After automated verification passes, pause for manual
confirmation before Phase 2.

---

## Phase 2: Report-math coverage (Risk #2)

### Overview

Table-driven unit tests for `buildReport` and `buildMonthBreakdown`, with every
expected value computed from the §"Agreed oracle definitions" above.

### Changes Required:

#### 1. `buildReport` tests

**File**: `src/lib/report.test.ts`

**Intent**: Assert each branch of the report roll-up against PRD-derived oracles,
exercising the three research-flagged hazards (elapsed-months divisor, rounding
order, burnPct contract).

**Contract**: Cases, each with a hand-computed oracle (not lifted from code):
- **Recurring, under budget**: known `totalSpent`, `elapsedMonths`, `limit` →
  assert `avgCents = round(total/elapsed)`, `deltaCents = limit − avg`,
  `burnPct = round(avg/limit×100)`.
- **Recurring, overspend**: `avg > limit` → assert `deltaCents` is negative and
  `burnPct > 100` (not clamped).
- **Recurring, rounding-order**: choose `total`/`elapsed`/`limit` where deriving
  `burn` from the *rounded* `avg` differs from the raw quotient; assert the code's
  rounded-first result.
- **Recurring, `limit = 0` / null**: `burnPct = null`.
- **Irregular**: assert `spentCents` (cumulative), `remainingCents = limit − spent`,
  `burnPct = round(spent/limit×100)`; include an overspend (negative remaining).
- **System "other"**: assert `other = { name, spentCents }`, and that it appears
  in neither `monthly` nor `yearly`.
- **Sorting**: `monthly`/`yearly` sorted by name.
- **Empty / zero-spend category**: category with no expenses → `totalSpent = 0`,
  derived metrics from 0.

#### 2. `buildMonthBreakdown` tests

**File**: `src/lib/report.test.ts`

**Intent**: Cover the monthly drill-down grouping, ordering, and zero-spend
stability without re-testing `warsawMonthKey` directly.

**Contract**: Fixture spanning two Warsaw months; assert only the target month's
expenses are grouped; every category emitted even at zero spend; group order is
recurring → irregular → "other" then alphabetical; per-group expenses sort
newest-first; recurring `burnPct` follows the same `limit>0` contract; irregular
and system groups carry `limitCents: null`, `burnPct: null`.

### Success Criteria:

#### Automated Verification:

- All `buildReport` cases pass: `npm run test`
- All `buildMonthBreakdown` cases pass: `npm run test`
- Coverage includes at least one overspend (negative-delta) and one
  rounding-order case (grep the test file for the documented cases)
- Lint passes: `npm run lint`

#### Manual Verification:

- Spot-check one oracle by hand against the PRD/agreed definition to confirm it
  was not copied from the function's return value
- Confirm the rounding-order case would fail if oracle derived `burn` from the
  raw (unrounded) quotient

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Year-boundary coverage (Risk #3)

### Overview

Pin the Warsaw-noon write invariant and the validation rules that protect it, and
extract + test the read-side cutoff calculation.

### Changes Required:

#### 1. Extract `expenseCutoff` into a pure helper

**File**: `src/lib/budget-year.ts` (add export); `src/pages/report.astro` (import it)

**Intent**: Move the inline cutoff calc (`report.astro:75-76`) into a pure,
importable function next to `getCurrentBudgetYear`, so it can be unit-tested;
update the page to call it. Behavior-preserving.

**Contract**: `getExpenseCutoff(year: number, currentMonth: number): string`
returning the first day of the month after `currentMonth`, wrapping to
`${year+1}-01-01` in December. `report.astro` replaces the inline ternary with a
call. No change to the SQL or to `getCurrentBudgetYear`.

#### 2. `warsawNoon` tests

**File**: `src/lib/expense-write.test.ts` (new)

**Intent**: Assert the noon pin and its DST awareness — the invariant that makes
the read-side year range safe.

**Contract**: Winter date (e.g. `2026-01-15`) → ISO ending `T11:00:00.000Z`
(UTC+1); summer date (e.g. `2026-07-15`) → `T10:00:00.000Z` (UTC+2); year-boundary
dates `2026-12-31` and `2026-01-01` → noon-Warsaw instants that stay on their own
Warsaw calendar day (assert the `YYYY-MM-DD` portion via Warsaw formatting).

#### 3. `validateExpenseFields` tests

**File**: `src/lib/expense-write.test.ts`

**Intent**: Cover the validation gates that feed `warsawNoon`, using injected
`FormData` and a fixed reference to "today".

**Contract**: Build `FormData` fixtures; assert: missing amount → error; bad
amount → parser error surfaced; missing category → error; blank date defaults to
`todayInWarsaw()`; non-`YYYY-MM-DD` date → "Invalid date"; future date →
"Date cannot be in the future"; a valid past date → `expenseAt === warsawNoon(date)`.
(Use a deterministic clock via `vi.useFakeTimers()`/`setSystemTime` for the
default-today and future-reject cases so the test is date-stable.)

#### 4. `getExpenseCutoff` tests

**File**: `src/lib/budget-year.test.ts` (new)

**Intent**: Assert the read-side year cutoff, including the December wrap — the
pure half of Risk #3's read boundary.

**Contract**: `getExpenseCutoff(2026, 6)` → `"2026-07-01"`;
`getExpenseCutoff(2026, 11)` → `"2026-12-01"`; `getExpenseCutoff(2026, 12)` →
`"2027-01-01"`; `getExpenseCutoff(2026, 1)` → `"2026-02-01"`.

### Success Criteria:

#### Automated Verification:

- All `warsawNoon`, `validateExpenseFields`, `getExpenseCutoff` cases pass:
  `npm run test`
- DST summer/winter and Dec-31/Jan-1 cases are present (grep the test file)
- Build passes after the extract: `npm run build`
- Lint passes: `npm run lint`
- Type check passes: `npm run astro -- check` (or `astro check`)

#### Manual Verification:

- Load `/report` in the app and confirm the report still renders correctly after
  the `expenseCutoff` extract (no behavior change near month/year boundaries)
- Confirm the fake-timers cases are deterministic (run the suite twice, same result)

**Implementation Note**: Pause for manual confirmation before Phase 4.

---

## Phase 4: CI gate + docs

### Overview

Enforce the suite in CI and document the unit-test cookbook + update the
test-plan's rollout/stack/gate state.

### Changes Required:

#### 1. CI unit step

**File**: `.github/workflows/ci.yml`

**Intent**: Run the unit suite in CI on every push/PR so report-math and
year-boundary regressions are caught before merge.

**Contract**: Add `- run: npm run test` to the `ci` job after `npm run lint`
(before or after `npm run build`). No Supabase env needed for the pure suite.
This pulls the §3 Phase 4 "unit gate" forward into Phase 1 by explicit decision.

#### 2. Cookbook §6.1

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the §6.1 placeholder with the concrete how-to for adding a
unit test in this project.

**Contract**: §6.1 documents: location (colocated `src/**/<module>.test.ts`),
naming (`*.test.ts`), reference test (`src/lib/report.test.ts`), run command
(`npm run test` / `npm run test:watch`), and the oracle rule (derive expected
values from the PRD/agreed definition, never from the function's output).

#### 3. Test-plan state updates

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that Phase 1 shipped and Vitest is adopted, including the
early unit-gate wiring.

**Contract**: §3 Phase 1 row Status → `complete`; §4 unit row → `Vitest <version>`
(remove "none yet"); §5 unit gate note → wired now (not "after Phase 4"); add a
2–3 line §6.6 note on anything surprising (e.g. the noon-invariant-vs-range
divergence). Update the top-of-file "Last updated" date.

#### 4. Change identity

**File**: `context/changes/testing-report-math/change.md`

**Intent**: Mark the change complete.

**Contract**: `status: planned` is set by this plan write; `/10x-implement` will
advance it. (No code contract.)

### Success Criteria:

#### Automated Verification:

- CI config is valid YAML and includes the test step (`npm run test` appears in
  `.github/workflows/ci.yml`)
- Full local gate passes: `npm run lint && npm run test && npm run build`

#### Manual Verification:

- Push a branch / open the MR and confirm the CI unit step runs and passes
- `test-plan.md` §3/§4/§5/§6.1 read as described; a new reader could add a unit
  test from §6.1 alone

**Implementation Note**: Final phase — confirm the full gate is green in CI.

---

## Testing Strategy

### Unit Tests:

- `buildReport`: recurring (under/over/zero-limit/rounding-order), irregular
  (under/over), system "other", sorting, empty category.
- `buildMonthBreakdown`: month filtering, all-categories-emitted, group ordering,
  newest-first expense sort, limit/burn nullity for irregular/system.
- `warsawNoon`: DST winter/summer, Dec-31/Jan-1.
- `validateExpenseFields`: required-field, bad-amount, default-today,
  bad-format, future-reject, valid-pin (fake timers for date-stability).
- `getExpenseCutoff`: mid-year, November, December wrap, January.

### Integration Tests:

- None this phase. The read-side SQL year-range comparison is deferred to §3
  Phase 2 (noted there as the non-pure complement to this phase's noon-invariant
  coverage).

### Manual Testing Steps:

1. `npm run test:watch`, edit a test, confirm re-run.
2. Load `/report`, confirm rendering unchanged after the `expenseCutoff` extract.
3. Confirm a deliberately-wrong oracle (raw-quotient burn) would fail.

## Performance Considerations

None — pure-function unit tests run in milliseconds. The Node test environment
avoids pulling jsdom/browser deps.

## Migration Notes

The `expenseCutoff` extract is behavior-preserving; no data or schema change.

## References

- Research: `context/changes/testing-report-math/research.md`
- Quality contract: `context/foundation/test-plan.md` §3 Phase 1, §2 Risk #2/#3
- Prior decision (report math): `context/changes/per-category-report/plan.md`
- Noon-pin origin: `context/changes/log-expense-from-phone/plan.md`
- Timezone convention: `context/foundation/lessons.md:13-15`
- Target code: `src/lib/report.ts:105-226`, `src/lib/expense-write.ts:17-81`,
  `src/lib/budget-year.ts:9-15`, `src/pages/report.astro:75-83`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bootstrap the runner

#### Automated

- [x] 1.1 Vitest installs and runs: `npm run test` exits 0 — fc144aa
- [x] 1.2 The sanity test resolves the `@/*` alias (import does not error) — fc144aa
- [x] 1.3 Lint passes on new files: `npm run lint` — fc144aa
- [x] 1.4 Build is unaffected: `npm run build` — fc144aa

#### Manual

- [x] 1.5 `npm run test:watch` starts watch mode and re-runs on change — fc144aa
- [x] 1.6 No Tailwind/Cloudflare/browser dependency pulled into the test env — fc144aa

### Phase 2: Report-math coverage (Risk #2)

#### Automated

- [x] 2.1 All `buildReport` cases pass: `npm run test` — 7bc96ab
- [x] 2.2 All `buildMonthBreakdown` cases pass: `npm run test` — 7bc96ab
- [x] 2.3 Coverage includes an overspend (negative-delta) and a rounding-order case — 7bc96ab
- [x] 2.4 Lint passes: `npm run lint` — 7bc96ab

#### Manual

- [x] 2.5 Spot-check one oracle by hand against the agreed definition — 7bc96ab
- [x] 2.6 Confirm the rounding-order case fails if burn derives from the raw quotient — 7bc96ab

### Phase 3: Year-boundary coverage (Risk #3)

#### Automated

- [x] 3.1 `warsawNoon`, `validateExpenseFields`, `getExpenseCutoff` cases pass: `npm run test` — e590949
- [x] 3.2 DST summer/winter and Dec-31/Jan-1 cases present — e590949
- [x] 3.3 Build passes after the extract: `npm run build` — e590949
- [x] 3.4 Lint passes: `npm run lint` — e590949
- [x] 3.5 Type check passes: `astro check` — e590949

#### Manual

- [x] 3.6 `/report` renders correctly after the `expenseCutoff` extract — e590949
- [x] 3.7 Fake-timers cases are deterministic across two runs — e590949

### Phase 4: CI gate + docs

#### Automated

- [x] 4.1 `npm run test` appears in `.github/workflows/ci.yml` (valid YAML) — 110436d
- [x] 4.2 Full local gate passes: `npm run lint && npm run test && npm run build` — 110436d

#### Manual

- [x] 4.3 CI unit step runs and passes on the MR — 110436d
- [x] 4.4 `test-plan.md` §3/§4/§5/§6.1 updated; a reader can add a unit test from §6.1 alone — 110436d

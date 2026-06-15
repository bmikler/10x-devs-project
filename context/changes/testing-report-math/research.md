---
date: 2026-06-15T11:25:12+0200
researcher: bartlomiej.mikler
git_commit: 52c773802ff64de7b9581b9ff2b38876cb4dac61
branch: master
repository: 10x-devs
topic: "Report-math arithmetic (#2) and year-boundary attribution (#3) — Phase 1 unit-test grounding"
tags: [research, codebase, report-math, timezone, year-boundary, vitest, test-plan-phase-1]
status: complete
last_updated: 2026-06-15
last_updated_by: bartlomiej.mikler
---

# Research: Report-math & year-boundary attribution (test-plan Phase 1)

**Date**: 2026-06-15T11:25:12+0200
**Researcher**: bartlomiej.mikler
**Git Commit**: 52c773802ff64de7b9581b9ff2b38876cb4dac61
**Branch**: master
**Repository**: 10x-devs

## Research Question

Ground the two risks that `test-plan.md` §3 Phase 1 ("Bootstrap runner + report-math
coverage") must cover, so a plan can write **PRD-derived unit tests** against them:

- **Risk #2** — the report shows wrong remaining / spent / avg / burn for a category
  (aggregation arithmetic incorrect). Grounding needed: the elapsed-Warsaw-months
  divisor, the recurring-vs-irregular branch, the "other" spent-only row, what "burn %"
  is defined as.
- **Risk #3** — an expense near a year boundary is attributed to the wrong calendar
  year (Warsaw timezone). Grounding needed: the storage timezone convention and the
  report query's year-range bounds.

Plus the Phase 1 goal of standing up a test runner: what it takes to unit-test the
report math in isolation.

## Summary

**All report arithmetic is pure TypeScript in `src/lib/report.ts` (`buildReport`,
`buildMonthBreakdown`) with zero imports — immediately unit-testable, no refactor and
no DB/integration harness required.** SQL is read-only fetch; Postgres does no
aggregation. This is the ideal shape for Risk #2: a pure function with a PRD-derivable
oracle.

The **year-boundary safety (Risk #3) is split across two layers and they do not use the
same mechanism the convention in `lessons.md` describes.** Writes pin every
`expense_at` to **Warsaw noon** (`warsawNoon`, DST-aware, pure TS). The report then
bounds the year with a **bare-date half-open timestamptz range** (`.gte('${year}-01-01')
.lt(cutoff)`) — *not* `EXTRACT(YEAR … AT TIME ZONE 'Europe/Warsaw')`. The range is
correct **only because** the noon invariant keeps every stored instant ~10–11 h away
from midnight, so no value lands in the UTC-vs-Warsaw ambiguity band. The convention and
the implementation diverge; the noon invariant is the load-bearing reason they agree.
**That makes the noon invariant the thing the year-boundary test must pin** — at the
write layer (pure, unit-testable) — because the read-side range comparison is the only
piece that is *not* a pure function.

**Three oracle hazards the plan must resolve before writing a single assertion** (these
are exactly the §2 "oracle problem" anti-pattern for Risk #2):

1. **The avg divisor is `elapsedMonths` (current Warsaw month, 1–12), not 12.** The PRD
   says "average monthly spend" without defining the divisor. The implementation chose
   ÷ elapsed-months (`per-category-report/plan.md`). The oracle must come from the
   *agreed definition*, not the code — and the definition itself is an open question
   (see Open Questions).
2. **`avg` is rounded *before* `delta` and `burn` are derived from it.** `avg =
   round(total/elapsed)`; `delta = limit − avg`; `burn = round(avg/limit·100)`. A test
   that computes burn from the *raw* quotient will disagree with the code by a cent/point
   even when the code is "right." The oracle must mirror the rounding *order* or
   deliberately pin it.
3. **`burnPct` is not a PRD MVP concept.** PRD FR-011 defers burn-rate/pacing to v1.1
   (Open Question #3), yet the code computes `burnPct`. Its only definition is the code:
   `limit > 0 ? round(metric/limit·100) : null`. There is no independent PRD oracle for
   it — the plan must decide whether to test it against its code-defined meaning or scope
   it out of Phase 1.

The runner is greenfield: **no test runner, zero test files, no config.** `report.ts`
imports nothing, so Vitest can call it today; the only setup friction is mirroring the
`@/*` → `./src/*` tsconfig path alias into a `vitest.config.ts` (Vitest does not inherit
Astro's Vite config).

## Detailed Findings

### Risk #2 — Report arithmetic (`src/lib/report.ts`)

The whole computation is the pure function `buildReport(categories, expenses,
elapsedMonths)` at `src/lib/report.ts:176-226`. It groups expenses by `category_id`
(`src/lib/report.ts:181-184`) then branches:

**Recurring branch** (`src/lib/report.ts:198-208`):
```ts
const limit = cat.limit_cents ?? 0;
const avg = Math.round(totalSpent / elapsedMonths);   // :200
monthly.push({
  avgCents: avg,
  limitCents: limit,
  deltaCents: limit - avg,                              // :206  remaining (may be negative)
  burnPct: limit > 0 ? Math.round((avg / limit) * 100) : null,  // :207
});
```

**Irregular branch** (`src/lib/report.ts:210-219`):
```ts
const limit = cat.limit_cents ?? 0;
yearly.push({
  spentCents: totalSpent,                              // cumulative
  limitCents: limit,
  remainingCents: limit - totalSpent,                  // :216 (may be negative)
  burnPct: limit > 0 ? Math.round((totalSpent / limit) * 100) : null,  // :217
});
```

**"other" / system branch** (`src/lib/report.ts:193-196`): spend-only —
`other = { name, spentCents: totalSpent }`. The `OtherRow` interface
(`src/lib/report.ts:32-35`) has *no* limit/remaining/burn fields; the schema enforces
`is_system = true ⇒ limit_cents IS NULL`
(`supabase/migrations/20260528132105_create_budget_schema.sql:23-26`).

Grounded answers to the §2 Risk Response "context research must ground":
- **elapsed-Warsaw-months divisor**: `elapsedMonths` is passed in from
  `src/pages/report.astro:88` and equals `currentMonth` (1–12), derived via
  `Intl.DateTimeFormat({ timeZone: "Europe/Warsaw", month: "numeric" })` at
  `src/pages/report.astro:28-32`. **It is the current Warsaw month, not a fixed 12.**
- **recurring-vs-irregular branch**: `if (cat.type === "recurring") … else …` at
  `src/lib/report.ts:198`. `else` covers `irregular` (and is the path irregular rows
  take); `is_system` is intercepted earlier (`:193`) so it never reaches either branch.
- **"other" spent-only row**: `src/lib/report.ts:193-196` — confirmed spend-only.
- **what "burn %" is**: `round(metric/limit·100)`, `null` when `limit ≤ 0`
  (`src/lib/report.ts:207,217`). Not a PRD concept (see Open Questions).

Overspend is **not clamped** — `delta`/`remaining` go negative
(`per-category-report/plan.md` confirms this is intentional). A good oracle row.

**Sibling pure function**: `buildMonthBreakdown(categories, expenses, monthKey)` at
`src/lib/report.ts:105-174` powers the monthly drill-down; also pure, annotated
"Pure — safe to import into a client island" (`src/lib/report.ts:104`). In scope for
Phase 1 only if the plan wants month-grouping coverage; the core Risk #2 oracle is
`buildReport`.

### Risk #3 — Year-boundary attribution (write pin + read range)

**Write side — the Warsaw-noon invariant (pure TS, the test target):**
`warsawNoon(dateStr)` at `src/lib/expense-write.ts:17-32` takes a `YYYY-MM-DD` string,
probes Warsaw's UTC offset for that date (DST-aware), and returns an ISO timestamp pinned
to **12:00 Warsaw**. Result: a January date stores as `…T11:00:00Z` (UTC+1), a July date
as `…T10:00:00Z` (UTC+2). `validateExpenseFields` (`src/lib/expense-write.ts:46-81`)
defaults the date to `todayInWarsaw()` (`:3-10`), rejects non-`YYYY-MM-DD` input (`:64`),
rejects future dates (`:71`), and writes `expenseAt: warsawNoon(resolvedDate)` (`:79`).
Both write routes funnel through it — create `src/pages/api/expenses/index.ts:24,47-53`,
update `src/pages/api/expenses/[id].ts:32,53-55`. **The invariant holds on every write
path.**

**Read side — the year range (NOT the lessons.md convention):**
`src/pages/report.astro:78-83`:
```ts
.gte("expense_at", `${year}-01-01`)
.lt("expense_at", expenseCutoff)
```
with `expenseCutoff` (`src/pages/report.astro:75-76`) = first day of the month after the
current Warsaw month, wrapping to next-Jan-1 in December. `year` comes from
`getCurrentBudgetYear()` (`src/lib/budget-year.ts:9-15`, Warsaw-formatted server clock;
**not** a client parameter). This is a bare-date half-open `[Y-01-01, cutoff)` range, not
`EXTRACT(YEAR … AT TIME ZONE 'Europe/Warsaw')`.

**Why it is still correct, and the subtle risk:** Postgres coerces the bare string
`'2026-01-01'` against TIMESTAMPTZ using the **DB session timezone** (UTC on Supabase),
i.e. the boundary is effectively `2026-01-01T00:00:00Z`. Correctness comes entirely from
the write-side noon pin: stored instants are ~10–11 h from midnight, so none can fall in
the band where a UTC boundary and a Warsaw boundary disagree. Traced edge cases (raw
clock-time hypotheticals, which the write path **cannot actually produce**):
`23:30 Warsaw Dec 31` (= `22:30Z Dec 31`) → 2026 (correct); `00:30 Warsaw Jan 1`
(= `23:30Z Dec 31`) → would land in 2026, i.e. **mis-attributed** — the exact bug the
noon invariant prevents and any future code that bypasses `warsawNoon` would reintroduce.

**Testability of Risk #3:** the unit-testable surface is the **write normalization**
(`warsawNoon`, `todayInWarsaw`, `validateExpenseFields` — string-in/out, deterministic
given a fixed clock; DST branch and Dec-31/Jan-1 dates assert directly) plus the pure
**`expenseCutoff` string computation**. The *range comparison semantics* (does Postgres
put a given row inside `[Y-01-01, cutoff)`) are the only non-pure piece and would need
SQL/integration — but pinning the **noon invariant** at the write layer is the cheaper,
higher-signal test, because that invariant is *what makes the range safe*.

### Phase 1 goal — test-runner readiness

- **Nothing exists**: no `vitest`/`jest`/`mocha`, no `@cloudflare/vitest-pool-workers`,
  no `test` script (`package.json:5-16,40-60`), zero `*.test.*`/`*.spec.*` files, no
  `vitest.config.*`. TypeScript `^5.9.3` is present.
- **`report.ts` is importable as-is**: zero `import` statements; uses only `Intl`,
  `Map`, `Array`, `Math`, `String`. No Node/Cloudflare/Supabase coupling. **No refactor
  required.** `expense-write.ts` is likewise pure string/`Intl` logic.
- **One config gotcha**: `tsconfig.json` defines path alias `@/*` → `./src/*`, with
  `module: ESNext`, `moduleResolution: Bundler`, `verbatimModuleSyntax: true` (inherited
  from `astro/tsconfigs/strict`). Vitest does **not** inherit Astro's Vite config
  (`astro.config.mjs` only registers `tailwindcss()`), so a `vitest.config.ts` must
  re-declare the `@/*` alias. Tailwind/Cloudflare/browser env are unnecessary for pure
  math.
- **Lint/format already cover tests**: `eslint.config.js` globs `**/*.{js,jsx,ts,tsx}`
  and `lint-staged` runs `eslint --fix` on `*.{ts,tsx,astro}` — a new `*.test.ts` is
  linted/formatted with no override (`package.json:64-70`). Vitest is the natural fit per
  `test-plan.md` §4; this research confirms it with no blockers.

## Code References

- `src/lib/report.ts:176-226` — `buildReport`, the Risk #2 oracle target (pure)
- `src/lib/report.ts:198-208` — recurring branch (avg / delta / burn)
- `src/lib/report.ts:210-219` — irregular branch (spent / remaining / burn)
- `src/lib/report.ts:193-196` / `:32-35` — "other" spent-only row + `OtherRow` shape
- `src/lib/report.ts:200` — `Math.round(totalSpent / elapsedMonths)` (rounding order)
- `src/lib/report.ts:105-174`, `:78-93` — `buildMonthBreakdown`, `warsawMonthKey` (pure)
- `src/pages/report.astro:28-32` — `currentMonth` = Warsaw month → the divisor
- `src/pages/report.astro:75-76` — `expenseCutoff` (pure, testable)
- `src/pages/report.astro:78-83` — the year-range SQL filter (non-pure boundary)
- `src/pages/report.astro:65-70` — categories fetch (read-only; no SQL aggregation)
- `src/lib/expense-write.ts:17-32` — `warsawNoon` (DST-aware noon pin; Risk #3 target)
- `src/lib/expense-write.ts:46-81` — `validateExpenseFields` (defaults/future-reject/pin)
- `src/lib/expense-write.ts:3-10` — `todayInWarsaw`
- `src/lib/budget-year.ts:9-15` — `getCurrentBudgetYear` (Warsaw server clock, no param)
- `src/pages/api/expenses/index.ts:24,47-53` — create write path
- `src/pages/api/expenses/[id].ts:32,53-55` — update write path
- `supabase/migrations/20260528132105_create_budget_schema.sql:9-27` — categories DDL
  (`type` enum, `is_system`, `limit_cents` system/null constraint)
- `supabase/migrations/20260528132105_create_budget_schema.sql:36-47` — expenses DDL
  (`expense_at TIMESTAMPTZ`, year index)
- `supabase/migrations/20260528132105_create_budget_schema.sql:73-102` —
  `fn_cascade_to_other` trigger (out of Phase 1 scope; Phase 3)
- `package.json:5-16,40-60,64-70` — scripts, deps, lint-staged (no runner today)
- `tsconfig.json` — `@/*` alias, ESM/Bundler/verbatimModuleSyntax
- `astro.config.mjs` — Cloudflare adapter, Vite block (tailwindcss only)

## Architecture Insights

- **Aggregation lives in TS, not SQL — by deliberate decision** (`per-category-report/
  plan.md`: "Aggregation happens in TypeScript on the server-rendered page — no
  migration, no RPC/view"). This is precisely what makes Risk #2 a *unit* risk, not an
  integration one, and matches `test-plan.md` §3 (unit layer for Phase 1).
- **The year-range correctness is an emergent property of two cooperating layers**, not a
  single guarded query. The write-side noon pin substitutes for the `AT TIME ZONE`
  extract the read query "should" use per `lessons.md`. Tests that only exercise the read
  query miss the actual safety mechanism; the write-side invariant is where the signal is.
- **Rounding is applied at the metric, then propagated** — `delta`/`burn` consume the
  already-rounded `avg`. Oracle fidelity depends on replicating that order.
- **`is_system` short-circuits before the type branch** — system "other" is never a
  recurring/irregular row; it carries no budget. A table-driven oracle should treat it as
  a third shape, not a special-cased recurring/irregular.

## Historical Context (from prior changes)

- `context/changes/per-category-report/plan.md` — **the prior decision record for the
  report math**: aggregation in TS (no view/RPC); avg = total ÷ elapsed-months; delta/
  remaining may go negative (no clamping); burn% with zero-limit guard; the year-range
  filter "is correct only because every `expense_at` is stored at Warsaw noon." This is
  the closest thing to a spec for the numbers — but it is *the implementation's own
  rationale*, so per `test-plan.md` §1/§2 it must **not** be used as the test oracle for
  values; the PRD formula is the oracle, this is context.
- `context/changes/log-expense-from-phone/plan.md` — introduced `warsawNoon` and the
  "store at noon to avoid date-boundary ambiguity" rationale.
- `context/changes/data-layer-and-rls/plan.md` — schema, RLS, and the
  `AT TIME ZONE 'Europe/Warsaw'` convention origin.
- `context/changes/categories-create-list/plan.md` — app-code seeding of the per-year
  "other" row (relevant to Phase 3, not Phase 1).
- `context/foundation/lessons.md:13-15` — the documented timezone convention that the
  report query does **not** literally follow (it relies on the noon invariant instead).

## Related Research

None prior for this change. This is the first artifact under
`context/changes/testing-report-math/`. (`test-plan.md` §3 Phase 1 is the parent brief.)

## Open Questions

1. **What is the agreed definition of "average monthly spend" — ÷ elapsed Warsaw months
   or ÷ 12?** The PRD (FR-011, §Business Logic) says "average monthly spend" without a
   divisor; the code uses elapsed months. The oracle the plan writes must come from the
   *agreed* definition, not the code. **This needs a one-line decision before tests are
   written** — otherwise the test silently canonizes whatever the implementation does
   (the oracle anti-pattern §2 warns against). Recommend confirming "÷ elapsed Warsaw
   months, current month inclusive" with the user and recording it in the plan.
2. **Is `burnPct` in scope for Phase 1 at all?** It has no PRD MVP definition (deferred to
   v1.1, Open Question #3). Either test it against its code-defined meaning (acknowledging
   there is no independent oracle) or scope it out until v1.1 lands a definition.
3. **Does Phase 1 assert the noon invariant directly (recommended), or only the
   `buildReport`/`buildMonthBreakdown` arithmetic?** The strongest Risk #3 unit test pins
   `warsawNoon` (DST + Dec-31/Jan-1 dates) and `validateExpenseFields` (future-reject,
   default-to-today). The read-side range is the one piece needing integration — the plan
   should decide whether to stub that boundary into Phase 2 or assert the invariant that
   protects it here.
4. **Does standing up the runner also wire the `test` npm script and the §5 unit gate?**
   `test-plan.md` §5 marks the unit gate "required after §3 Phase 1"; §3 Phase 4 wires CI.
   Confirm Phase 1 only adds the local runner + script and leaves CI to Phase 4.

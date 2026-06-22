<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Bootstrap runner + report-math coverage

- **Plan**: context/changes/testing-report-math/plan.md
- **Scope**: All phases (1–4)
- **Date**: 2026-06-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — "bad amount" test couples to money.ts error string

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/expense-write.test.ts:53-57
- **Detail**: The test asserts the exact string "Enter a valid amount in PLN (max 2 decimal places)" — owned by parsePlnToCents in money.ts, not by validateExpenseFields. If money.ts changes its error wording, this test breaks without touching expense-write.ts.
- **Fix**: Replace toEqual({ error: '...' }) with toMatchObject({ error: expect.stringContaining('valid amount') })
- **Decision**: SKIPPED

### F2 — Vitest 3 peer range does not formally include Vite 7

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — no action needed now
- **Dimension**: Safety & Quality
- **Location**: package.json:61,65
- **Detail**: vitest@^3.2.x declares peer "vite": "^5.0.0 || ^6.0.0" but the project overrides to vite@^7.3.2. In practice npm ci produces no peer warnings and all 32 tests pass clean. Theoretical risk only.
- **Fix**: No change needed now. When Vitest ships formal Vite 7 support, bump vitest to that version.
- **Decision**: SKIPPED

### F3 — npx astro sync runs in CI before any env vars are set

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — pre-existing, not introduced by this change
- **Dimension**: Safety & Quality
- **Location**: .github/workflows/ci.yml:19
- **Detail**: astro sync runs before SUPABASE_URL/KEY are injected. Currently safe because createClient uses lazy init. Pre-existing risk.
- **Fix**: No change needed. If astro sync starts failing, move SUPABASE_URL/KEY to job-level env:.
- **Decision**: SKIPPED

### F4 — limitCents is null in buildMonthBreakdown but 0 in report.astro for the "other" row

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — no current bug; tests are correct
- **Dimension**: Architecture
- **Location**: src/lib/report.test.ts:204 / src/pages/report.astro:188
- **Detail**: buildMonthBreakdown returns limitCents=null for the system row. The Astro template passes limitCents={0} hardcoded to BudgetRow for report.other — a different code path. Both correct today; note for next BudgetRow refactor.
- **Fix**: No change needed now. System row limitCents should be null (not 0) if BudgetRow ever sources from buildMonthBreakdown.
- **Decision**: SKIPPED

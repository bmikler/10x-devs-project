<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Log Expense from Phone

- **Plan**: context/changes/log-expense-from-phone/plan.md
- **Scope**: Phase 1–2 of 2
- **Date**: 2026-06-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Date validation is format-only, no semantic check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/expenses/index.ts:88
- **Detail**: The regex `/^\d{4}-\d{2}-\d{2}$/` accepts syntactically invalid dates like "2026-99-99" or future dates like "2030-01-01". JavaScript's `Date.UTC()` silently wraps overflow values to valid dates, so a malicious POST bypassing the native date picker could store an expense with an unexpected date. The client-side `max={today}` attribute mitigates future dates in normal usage, but the server has no semantic guard.
- **Fix**: After the regex, parse with `new Date(resolvedDate)` and reject if `isNaN` or if the date is in the future relative to `todayInWarsaw()`.
- **Decision**: FIXED

### F2 — todayInWarsaw() duplicated across two files

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/expenses/index.ts:10, src/pages/expenses.astro:14
- **Detail**: The `todayInWarsaw()` function is copy-pasted identically in the API route and the Astro page. If the timezone convention changes, two call sites must be updated. `warsawNoon()` in the API route is unique to that file and is fine.
- **Fix**: Extract `todayInWarsaw()` into `src/lib/budget-year.ts` alongside `getCurrentBudgetYear()`.
- **Decision**: SKIPPED

### F3 — date field is a visible input, plan specified hidden

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/expenses/ExpenseForm.tsx:166-177
- **Detail**: The plan contract says "Hidden inputs for `category_id` and `date`" — implying a hidden input driven by state (like category_id at line 109). The implementation uses a visible `<input type="date" name="date">` directly. This is functionally correct and arguably simpler — the visible input both displays and posts the value. No action needed; noting for plan accuracy.
- **Fix**: No fix required. The visible input is a better UX choice. If plan accuracy matters, add a one-line addendum to the plan noting the deviation.
- **Decision**: FIXED — plan addendum added to clarify date uses visible input

## Automated Verification

- ✅ `npm run lint` — passed (no errors)
- ✅ `npm run build` — passed (Complete!)

## File Scope

- ✅ In plan AND in diff: `src/pages/api/expenses/index.ts`, `src/components/expenses/ExpenseForm.tsx`, `src/pages/expenses.astro`
- ✅ No unplanned files changed (context/ docs excluded)
- ✅ No planned files missing

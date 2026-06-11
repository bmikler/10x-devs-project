<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Visual Refresh + UX Improvements

- **Plan**: context/changes/ui-visual-refresh/plan.md
- **Scope**: Full plan (Phases 1–6 of 6)
- **Date**: 2026-06-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unplanned category-edit route contradicts "inline edit stays"

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: src/pages/categories/[id]/edit.astro (+ CategoryList.tsx:103-108)
- **Detail**: Phase 5's contract says "Inline edit/delete stays in the list." Actual: a focused category-EDIT route was added and CategoryList's Edit affordance is now an `<a href="/categories/{id}/edit">` (delete stays inline). Reuses the existing /api/categories/[id] endpoint (no new contract) and mirrors Phase 5's create-route pattern — consistent extension, but diverges from literal wording and was never logged.
- **Fix A ⭐ Recommended**: Accept and log as a plan addendum.
  - Strength: Create + edit become symmetric focused routes; reuses existing API; updates source of truth before archive.
  - Tradeoff: Plan wording becomes a moving target.
  - Confidence: HIGH — endpoint pre-existed; build/lint pass.
  - Blind spot: Whether inline edit was intended to remain for speed.
- **Fix B**: Revert to inline edit in the list.
  - Strength: Strict adherence to written Phase 5 contract.
  - Tradeoff: Throws away working, arguably-better UX.
  - Confidence: MEDIUM — need to re-check CategoryList's old inline state.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — addendum logged in plan.md (## Addenda).

### F2 — BudgetRow variant union declared inline, not in variants.ts

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/report/BudgetRow.astro (Props interface)
- **Detail**: Card.astro / Alert.astro import their variant unions from ui/variants.ts (per the documented typed-lint rationale). BudgetRow declares `variant?: "default" | "amber"` inline. Lints fine (property type, not a standalone alias) but diverges from the sibling convention.
- **Fix**: Extract a `BudgetRowVariant` type into ui/variants.ts and import it.
- **Decision**: SKIPPED — inline union lints fine and is narrow; not worth the churn.

### F3 — Supabase query errors silently swallowed in report.astro

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: src/pages/report.astro:65-83
- **Detail**: `const { data } = await supabase…` discards `error`; on a DB error the page renders "No categories yet" / empty rather than surfacing it. Inherited verbatim from the deleted monthly.astro/yearly.astro — a pre-existing pattern, not a regression — and degrades gracefully.
- **Fix**: Optionally destructure `error` and route to an `<Alert>`. Reasonable to consciously skip since it predates this change and is repo-wide.
- **Decision**: SKIPPED — pre-existing & repo-wide; degrades gracefully. Defer to a dedicated error-handling pass.

### F4 — Topbar.astro lingers; landing (Welcome.astro) left on old chrome

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline / cleanup
- **Location**: src/components/Topbar.astro, src/components/Welcome.astro
- **Detail**: Phase 2's criterion ("grep Topbar src/pages returns nothing") is met. But Topbar.astro is undeleted and still imported by Welcome.astro (public landing), which keeps old cosmic chrome, the "10x Astro Starter" title, and an "Astro 5" string. The plan never scoped the public landing for migration — a left-open gap, not a violation.
- **Fix**: Either migrate the landing page in a follow-up, or delete Topbar + refresh Welcome branding. Out of this plan's named scope.
- **Decision**: FIXED — Welcome.astro now uses AppHeader + Money Tracker product copy (title/subtitle, feature cards, "Astro 6"); Topbar.astro deleted.

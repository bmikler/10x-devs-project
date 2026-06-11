# UI Visual Refresh + UX Improvements — Plan Brief

> Full plan: `context/changes/ui-visual-refresh/plan.md`
> Research: `context/changes/ui-visual-refresh/research.md`

## What & Why

S-08 is a cross-cutting quality pass over the seven already-shipped authenticated surfaces (dashboard, categories, log-expense, report hub/monthly/yearly, expense-edit). It (1) consolidates the ad-hoc "cosmic" look into reusable design tokens + shared components and closes accessibility gaps, and (2) layers six requested UX flow improvements on top — bottom navigation, branded header, two-step expense logging, focused category creation, a re-ranked dashboard, and a clearer yearly report. The codebase already has a cohesive identity, so this is **consolidation, not redesign** — and the user is a Java engineer new to React/Astro, so every UI concept must be explained plainly during implementation.

## Starting Point

The app works but its styling is fragmented: an unused shadcn token layer coexists with copy-pasted "cosmic" Tailwind classes, scales are inconsistent (widths, headings, padding, radii), and the page wrapper/title/card/banner patterns are duplicated 3–10×. Navigation is a hub round-trip (the only cross-link is Topbar "Dashboard"), the expense form is one long screen, category create is stacked on the list, and the yearly report shows burn% as a bare number. A mobile viewport-meta bug and several named a11y gaps (no landmarks/skip-link, unannounced form errors) are present.

## Desired End State

On a phone, the user sees a branded "Money Tracker" header + logo, a fixed bottom nav giving one-tap movement between Categories / Log / Report (and Dashboard via the logo), consistent token-driven styling, visible focus rings, and semantic landmarks. Logging is a two-step category-first flow that still finishes in under 10 seconds; adding a category is a focused `/categories/new` screen with working browser-back; the yearly report shows at-a-glance progress bars with over-budget emphasis.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope line | Visual + lightweight IA (no new data) | Delivers all six flows while keeping the "no new queries" guardrail; data-rich dashboard deferred to a new roadmap item | Plan |
| Styling reconciliation | Promote cosmic into the `@theme` token layer | One source of truth; makes restyles + a future dark/light toggle cheap | Plan |
| Navigation | Persistent bottom nav bar (server-rendered) | One-tap movement, kills the hub round-trip, stays `.astro`-first | Plan |
| Expense flow | Two-step, single-tap advance | Delivers category-first flow without regressing the 10s logging budget | Plan |
| Category create | Dedicated `/categories/new` route | Clean URL + native browser-back; mostly a markup move | Plan |
| Branding | "Money Tracker" + inline SVG logo | Self-contained, on-theme, no asset pipeline | Plan |
| Dark mode | No toggle — cosmic is the theme | Keeps slice bounded; tokenisation makes a toggle a cheap follow-up | Plan |
| Yearly report | Progress bars + over-budget emphasis | The #1 at-a-glance UX win; all CSS, no JS | Plan |
| Cleanups | Re-skin Banner, remove LibBadge, fix viewport, eyeball contrast | Low-effort, high-value debt cleared alongside the refresh | Plan |

## Scope

**In scope:** cosmic→token promotion; extract `PageTitle`/`Card`/`Alert`/`EmptyState`/`BackLink`/`AppShell`/`AppHeader`/`BottomNav`/`ProgressBar`/`BudgetRow`; layout + form a11y; branded header; bottom nav; two-step expense flow; `/categories/new`; report progress bars + tabs; dashboard re-rank; Banner re-skin; LibBadge removal; viewport fix.

**Out of scope:** data-rich dashboard (new queries — deferred to a roadmap item); dark/light toggle; new UI framework/library; formal WCAG-AA audit; any API contract / query correctness / RLS / Warsaw-noon changes.

## Architecture / Approach

Bottom-up so nothing is refactored twice: **tokens + shared components + layout/form a11y** → **navigation shell (`AppShell` = header + cosmic container + bottom nav)** wrapping every page → **page-body consolidation onto the components** → three interaction-flow changes (expense two-step state machine, category-create route, report progress bars + `?view=` tabs). All new chrome is server-rendered `.astro`; the only new client JS is the `step` state inside the already-hydrated `ExpenseForm` island.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Foundation | Cosmic tokens, shared UI components, layout + form a11y | Tokenisation must be a visual no-op |
| 2. Shell | Branded header + bottom nav, pages migrated to `AppShell` | Bottom-bar occlusion / safe-area on notched phones |
| 3. Body consolidation | Pages on tokens/components; Banner re-skin; dashboard re-rank | Subtle visual regressions across 7 pages |
| 4. Expense two-step | Category-first flow inside existing island | Regressing the 10-second logging budget |
| 5. Category create | `/categories/new` route + Add button | Empty-state copy / list interactions drift |
| 6. Report UX | Progress bars, over-budget emphasis, `?view=` tabs | Report numbers must match `master` exactly |

**Prerequisites:** S-01–S-04 shipped (all are); no new dependencies or access needed.
**Estimated effort:** ~3–4 implementation sessions across 6 phases (Phases 1–3 are the bulk; 4–6 are smaller and independent).

## Open Risks & Assumptions

- **10-second logging budget** is a hard regression guard on the two-step flow — must be timed on a real phone.
- **Scope creep** — "make it beautiful and easier to use" has no natural stopping line; the guardrails + deferred dashboard data keep it bounded.
- A markup/CSS refactor across 7 pages can regress existing `sm:`/`lg:` responsiveness — verify each breakpoint after each phase.
- Assumes the dormant shadcn light tokens stay untouched (no toggle this slice).

## Success Criteria (Summary)

- Every page is one consistent, mobile-first visual system with visible focus, semantic landmarks, and AA-ish contrast.
- One-tap navigation between all sections + dashboard from anywhere; logging stays under 10 seconds.
- Report progress bars make over-budget categories obvious at a glance, with report numbers unchanged vs `master`.

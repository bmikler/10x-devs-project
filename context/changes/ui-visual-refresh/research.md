---
date: 2026-06-11T05:40:01+0000
researcher: bmikler
git_commit: 3f355c061cc2b5a1705e2c968a179d667bb46634
branch: master
repository: 10x-devs (10x-money-tracker)
topic: "S-08: UI visual refresh — modern, consistent, accessible"
tags: [research, codebase, ui, design-system, accessibility, tailwind, astro, mobile-responsiveness, component-reuse, ux, navigation, user-flows]
status: complete
last_updated: 2026-06-11
last_updated_by: bmikler
last_updated_note: "Added follow-up UX analysis of every page + targeted flow redesigns (expense logging, category creation, navigation/bottom-bar, branded header, yearly report, dashboard) with mobile-first focus and external best-practice evidence."
---

# Research: S-08 — UI visual refresh (modern, consistent, accessible)

**Date**: 2026-06-11T05:40:01+0000
**Researcher**: bmikler
**Git Commit**: 3f355c061cc2b5a1705e2c968a179d667bb46634
**Branch**: master
**Repository**: 10x-devs (10x-money-tracker)

## Research Question

S-08 is a cross-cutting visual quality pass over the surfaces shipped by S-01–S-04 (sign-in, landing hub, Categories create/list, Log expense, Report). The roadmap asks for a "cohesive, modern, mobile-first visual system … clear typography hierarchy, consistent spacing and colour, polished cards/forms/tables, and reasonable accessibility" with **zero behaviour/data changes**. This research establishes the current state of the codebase across four dimensions chosen by the user — **design system / tokens, accessibility, component reuse, and mobile responsiveness** — and codifies the *existing* visual direction (the "cosmic" identity) rather than inventing a new one, so `/10x-plan` can define a bounded refresh. (Scope note: the follow-up research at the bottom of this document widens S-08 from "visual-only" into **UX/interaction** changes at the user's request.)

## ⚠️ Researcher context & communication guidance (read first)

**The user is a Java/JVM backend engineer with only a little React knowledge and no working familiarity with frontend UI frameworks, design systems, or CSS tooling.** This shapes how every UI concept in this change must be communicated by `/10x-plan`, `/10x-implement`, and any agent acting on this research:

- **Explain, don't assume.** Whenever a UI framework, library, pattern, or tool comes up — Tailwind utility classes, shadcn/ui, `cva` (class-variance-authority), `clsx`/`tailwind-merge`, OKLCH colour, CSS custom properties / `@theme`, Astro islands & `client:*` directives, React state/hooks, design tokens, "FAB", "bottom nav bar", responsive breakpoints, `safe-area-inset`, etc. — **define the term in one plain sentence** and say *why it's being used here* before relying on it.
- **Bridge from Java when useful.** Relate concepts to JVM equivalents the user already knows (e.g. "a design token is like a centralised constant / `application.properties` value reused across the UI"; "a React component prop is like a constructor argument"; "an Astro island is server-rendered HTML that only ships JS for the interactive bits, similar to progressive enhancement").
- **Surface decisions as explicit, explained questions.** Do not silently pick a UI framework, component-library adoption level, or navigation pattern. When a choice arises (e.g. "extract a shared `Card` component vs keep inline utilities", "bottom nav bar vs keep the hub", "dedicated `/categories/new` route vs client-side view state"), present the options, the trade-offs in plain language, and a recommended default — then let the user confirm.
- **Avoid unexplained jargon and acronyms.** If a term is unavoidable, gloss it inline. Prefer concrete before/after examples over abstract design vocabulary.
- **The `/quizme` skill exists** specifically for this Java→TS/React/Astro learning gap — reinforce understanding of non-trivial changes rather than assuming it.

This is a standing instruction for the whole `ui-visual-refresh` change, not just this document.

## Summary

The codebase is in a **better-than-expected starting position** but suffers from **styling fragmentation**, not a missing foundation:

- **A real design-token layer already exists.** [src/styles/global.css](src/styles/global.css) ships a complete shadcn/ui-style OKLCH token system (`--background`, `--primary`, `--destructive`, `--ring`, radius scale, full `.dark` mode), wired through Tailwind 4's `@theme inline`. **But almost no page uses it.** The actual visual identity is a separate, ad-hoc **"cosmic" theme** (`@utility bg-cosmic` dark-blue gradient + inline `white/N` opacity utilities + `purple`/`blue`/`amber`/`emerald`/`red` literals) applied via copy-pasted Tailwind chains. The shadcn tokens and the cosmic theme are effectively two parallel, unreconciled systems.
- **Consistency is the core problem.** Three page max-widths (`max-w-sm`/`max-w-md`/`max-w-4xl`), three+ heading sizes, four card paddings (`p-4`/`p-5`/`p-6`/`p-8`), inconsistent radii and backdrop-blur usage, and two different status-banner sizes appear across surfaces. See the Consistency Matrix below.
- **Heavy structural duplication.** The page wrapper, page title+subtitle, empty state, back-link, status banner, and card panel patterns are each copy-pasted 3–10× across the seven authenticated pages. Forms are the bright spot — `FormField`/`SubmitButton`/`ServerError` are genuinely reused.
- **Accessibility is "decent foundation, specific gaps."** `lang` is set, headings are sane, buttons are real `<button>`s with `aria-pressed`/`aria-label`, and form inputs are labelled. The gaps are concrete and fixable: no `<main>`/`<nav>` landmarks, no skip link, missing `aria-describedby`/`aria-invalid` on errored inputs, `ServerError` lacks `role="alert"`, several links/toggle buttons lack a visible `focus-visible` ring, and a few low-contrast combos (`white/40` placeholders, the light-on-light `Banner.astro` variants).
- **Mobile is mostly fine, with a few real overflow risks.** All authenticated pages use `max-w-md` and forms are `w-full` with mobile-friendly inputs (`inputMode="decimal"`, native date). The exceptions: fixed `text-3xl` headings (no responsive scaling), the `MonthlyReport` expense row (6 inline elements — overflow risk < 320px), the `Topbar` email row, and the month switcher.

The refresh is therefore primarily a **consolidation + tokenisation + extraction** job, not a redesign: pick one source of truth (extend the cosmic theme into the token layer), extract ~6 shared components, standardise the scales, and close a short list of named a11y gaps — all while preserving the cosmic look and touching no logic.

## Detailed Findings

### 1. Design system & tokens

**Tailwind 4, config-less.** All configuration lives in [src/styles/global.css](src/styles/global.css) via `@import "tailwindcss"` ([line 1](src/styles/global.css#L1)) + `@import "tw-animate-css"` ([line 2](src/styles/global.css#L2)) and an `@theme inline` block ([lines 75–110](src/styles/global.css#L75-L110)). The Vite plugin is wired in [astro.config.mjs](astro.config.mjs#L9). Deps: `tailwindcss@^4.2.4` ([package.json](package.json#L22)), `tailwind-merge@^3.5.0` ([package.json](package.json#L24)), `clsx@^2.1.1` ([package.json](package.json#L23)).

**A full shadcn token layer exists but is largely unused.** [components.json](components.json#L2-L8) declares shadcn "new-york" style, `neutral` base, `cssVariables: true`. The `:root` block ([lines 5–42](src/styles/global.css#L5-L42)) defines OKLCH semantic tokens (`--background`, `--foreground`, `--primary`, `--secondary`, `--accent`, `--destructive`, `--border`, `--ring`, `--chart-1..5`, sidebar tokens) and a radius scale (`--radius: 0.625rem`, [line 7](src/styles/global.css#L7)); a complete `.dark` inversion is at [lines 44–73](src/styles/global.css#L44-L73). These map into Tailwind utilities via `@theme inline` ([lines 80–110](src/styles/global.css#L80-L110)). **The pages do not consume these** — they use literal palette utilities instead.

**The real identity is the ad-hoc "cosmic" theme.** [src/styles/global.css](src/styles/global.css#L113-L115) defines `@utility bg-cosmic` (`linear-gradient(to bottom, #0a0e1a, #0f1529, #0a0e1a)`), applied on every authenticated/auth page ([dashboard.astro:30](src/pages/dashboard.astro#L30), [expenses.astro:46](src/pages/expenses.astro#L46), [categories.astro:39](src/pages/categories.astro#L39), [report.astro:25](src/pages/report.astro#L25), [report/monthly.astro:80](src/pages/report/monthly.astro#L80), [report/yearly.astro:52](src/pages/report/yearly.astro#L52), `expenses/[id]/edit.astro:64`, [auth/signin.astro:9](src/pages/auth/signin.astro#L9), [auth/signup.astro:9](src/pages/auth/signup.astro#L9), [auth/confirm-email.astro:22](src/pages/auth/confirm-email.astro#L22)). On top of it sit gradient headings (`from-blue-200 to-purple-200 bg-clip-text text-transparent`), `text-blue-100/N` body text, `white/N` translucent surfaces, and `purple`/`amber`/`emerald`/`red` accents — all inline.

**Shared primitives are thin.** Only [src/components/ui/button.tsx](src/components/ui/button.tsx) is a CVA-driven primitive (variants default/destructive/outline/secondary/ghost/link; sizes default/sm/lg/icon; good `focus-visible:ring` at [line 6](src/components/ui/button.tsx#L6)) — but it is **barely used**; pages hand-roll buttons. The `cn()` helper ([src/lib/utils.ts](src/lib/utils.ts#L1-L6)) = `twMerge(clsx(...))`. [Layout.astro](src/layouts/Layout.astro#L3) imports the global CSS but sets **no font stack** (defaults to Tailwind system sans) and no theme wrapper.

**Gaps:** no typography scale (all defaults), no form primitives beyond `FormField`, opacity utilities (`white/10`, `white/20`, `blue-100/70`) not tokenised, hard-coded state colours (`purple-400` selected, `amber-300` system, `emerald-300`/`red-400` status) not aliased. Dark mode is *infrastructurally* complete but there is no toggle and the cosmic pages are hard-dark already.

### 2. Per-surface styling & the consistency problem

Every surface was inventoried (full class lists in the Consistency Matrix section). The dominant pattern (most authenticated pages) is:

```
container: bg-cosmic flex min-h-screen flex-col p-4  →  mx-auto w-full max-w-md
heading:   mb-2 bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-center text-3xl font-bold text-transparent
card:      rounded-2xl border border-white/10 bg-white/10 p-4 text-white backdrop-blur-xl
```

Divergences (the work for a "make it consistent" pass):

- **Container width:** `max-w-sm` (auth) vs `max-w-md` (app, most common) vs `max-w-4xl` ([index.astro](src/pages/index.astro)).
- **Heading size:** `text-2xl` (auth) vs `text-3xl` (app) vs `text-5xl sm:text-6xl lg:text-7xl` (landing). App headings have **no responsive scaling**.
- **Card padding:** `p-4` / `p-5` / `p-6` / `p-8` with no rule; **radius** `rounded-lg`/`rounded-xl`/`rounded-2xl`/`rounded-md`; **backdrop-blur-xl** applied to some cards and not others.
- **Status banners:** `ServerError.tsx` uses `rounded-lg … px-3 py-2` while report/expense banners use `rounded-xl … px-4 py-3` — same semantic, two sizes.
- **Buttons:** primary is `bg-purple-600 hover:bg-purple-500` in `SubmitButton.tsx` (px-4 py-2) but `px-6 py-3` on dashboard/landing; secondary is `border-white/20 bg-white/10`; the CVA `button.tsx` is bypassed.
- **Consistent already:** gradient heading colour, secondary-text opacity ladder (`blue-100/50..80`), amber "system/other" treatment, error/success text colours, the editing/deleting card states, `grid grid-cols-2 gap-2` selectors.

Component-specific notes: [Banner.astro](src/components/Banner.astro) is an outlier — it uses **scoped CSS with hex colours** (light info/warning/error variants), not Tailwind, so it doesn't match the cosmic theme at all. [LibBadge.astro](src/components/ui/LibBadge.astro) is a starter artifact.

### 3. Accessibility ("reasonable" target)

Solid foundation: `<html lang="en">` ([Layout.astro:14](src/layouts/Layout.astro#L14)), sane `h1`/`h2` order on every page, all interactive elements are real `<button>`/`<a>` (no `div onClick`), good `aria-pressed` on toggles ([CategoryForm.tsx:80](src/components/categories/CategoryForm.tsx#L80), [ExpenseForm.tsx:108](src/components/expenses/ExpenseForm.tsx#L108)), `aria-label` on icon buttons ([PasswordToggle.tsx:8](src/components/auth/PasswordToggle.tsx#L8), [MonthlyReport.tsx:42](src/components/report/MonthlyReport.tsx#L42)), `aria-expanded` on the report accordion ([MonthlyReport.tsx:85](src/components/report/MonthlyReport.tsx#L85)), labelled inputs throughout, and correct `disabled` handling.

Named gaps to close in the refresh (ranked):

| Priority | Gap | Location | Remedy |
| --- | --- | --- | --- |
| High | No `<main>` landmark; content sits in `<div>` | [Layout.astro](src/layouts/Layout.astro#L25) + pages | Wrap page content in `<main id="main">` |
| High | No skip-to-main link | [Layout.astro](src/layouts/Layout.astro) | Add `sr-only` focusable skip link to `#main` |
| High | `Topbar` is a `<div>`, not a landmark | [Topbar.astro:1](src/components/Topbar.astro#L1) | Use `<nav aria-label="…">` / `<header>` |
| High | Errored inputs lack `aria-describedby` + `aria-invalid` | [FormField.tsx:40-50](src/components/auth/FormField.tsx#L40) | Associate error `<p id>` and set `aria-invalid` |
| High | `ServerError` not announced | [ServerError.tsx:9](src/components/auth/ServerError.tsx#L9) | Add `role="alert"` (or `aria-live`) |
| High | Selector button groups not labelled | [CategoryForm.tsx:75](src/components/categories/CategoryForm.tsx#L75), [ExpenseForm.tsx:100](src/components/expenses/ExpenseForm.tsx#L100) | `<fieldset><legend>` or `aria-labelledby` |
| Medium | No visible focus ring on dashboard/Topbar links & toggle/month buttons | [dashboard.astro:38](src/pages/dashboard.astro#L38), [Topbar.astro:8](src/components/Topbar.astro#L8), [MonthlyReport.tsx:42](src/components/report/MonthlyReport.tsx#L42) | Add `focus-visible:ring-2 focus-visible:ring-purple-400` |
| Medium | Success banner auto-dismisses unannounced | [ExpenseForm.tsx:75-84](src/components/expenses/ExpenseForm.tsx#L75) | Wrap in `role="status" aria-live="polite"` |
| Medium | Low-contrast `white/40` placeholder & toggle icon | [FormField.tsx:38](src/components/auth/FormField.tsx#L38), [PasswordToggle.tsx:8](src/components/auth/PasswordToggle.tsx#L8) | Raise to `/50`–`/60` |
| Low | Verify gradient-text & `Banner.astro` light-on-light contrast | [dashboard.astro:25](src/pages/dashboard.astro#L25), [Banner.astro:23-29](src/components/Banner.astro#L23) | Contrast-check; darken/lighten as needed |

### 4. Mobile responsiveness & component reuse

**Mobile-readiness:** the landing page ([index.astro](src/pages/index.astro)) and [Welcome.astro](src/components/Welcome.astro) are exemplary mobile-first (`flex-col sm:flex-row`, `grid-cols-1 sm:grid-cols-3`, responsive type). Authenticated pages are *adequate* (`max-w-md`, `w-full` forms, `inputMode="decimal"` on amount, native `<input type="date">`, correct `min-w-0 truncate`) but have specific risks:

- **Overflow risk (highest):** the `MonthlyReport` expense row packs 6 inline flex elements (date `w-14` | name `flex-1` | amount | edit | delete | confirm) — wraps unpredictably < 320px ([MonthlyReport.tsx:128-154](src/components/report/MonthlyReport.tsx#L128-L154)).
- **No responsive headings:** every app `h1` is a fixed `text-3xl` (dashboard/categories/expenses/report/monthly/yearly/edit) — should be `text-2xl sm:text-3xl`.
- **Tight rows on small screens:** `Topbar` email+actions ([Topbar.astro:5](src/components/Topbar.astro#L5)), month switcher ([MonthlyReport.tsx:57](src/components/report/MonthlyReport.tsx#L57)), `CategoryList` edit/delete pair ([CategoryList.tsx:105](src/components/categories/CategoryList.tsx#L105)), `PasswordToggle` absolute icon ([PasswordToggle.tsx:10](src/components/auth/PasswordToggle.tsx#L10)).

**Duplication / extraction opportunities** (Tier 1 = highest impact):

| Tier | Extract | Replaces | Count |
| --- | --- | --- | --- |
| 1 | `PageLayout.astro` (cosmic wrapper + container + Topbar) | wrapper `div`s | 7 pages |
| 1 | `PageTitle.astro` (gradient heading + subtitle, responsive) | heading+subtitle blocks | 7 pages |
| 1 | `Alert` (success/error/warning banner) | status banners | 3+ |
| 2 | `EmptyState.astro` | empty-state cards | 5+ |
| 2 | `BackLink.astro` | back links | 3 |
| 2 | `Card` (default/amber/error variants) | card panels | 10+ |
| 3 | Adopt `button.tsx` consistently | inline buttons | many |

**Already reused (keep):** `FormField`/`SubmitButton`/`ServerError` across all four forms. **Islands are correctly scoped** — every `client:load` is on a form or stateful control (`MonthlyReport`, `CategoryList`); no static content ships JS. This respects the CLAUDE.md "`.astro`-first" runtime gotcha and must be preserved by the refresh.

## Code References

- `src/styles/global.css:1-2` — Tailwind 4 + tw-animate-css imports
- `src/styles/global.css:5-73` — shadcn OKLCH token layer (`:root` + `.dark`) — present but unused by pages
- `src/styles/global.css:75-110` — `@theme inline` mapping tokens → Tailwind utilities
- `src/styles/global.css:113-115` — `@utility bg-cosmic` (the real identity)
- `src/components/ui/button.tsx:5-23` — the one CVA primitive (underused); good `focus-visible` ring
- `src/lib/utils.ts:1-6` — `cn()` = twMerge(clsx)
- `src/layouts/Layout.astro:3,14,25` — global CSS import, `lang="en"`, missing `<main>`
- `src/components/auth/FormField.tsx:30-60` — labelled input; missing `aria-describedby`/`aria-invalid`
- `src/components/auth/ServerError.tsx:9` — error box without `role="alert"`
- `src/components/Topbar.astro:1-22` — `<div>` that should be `<nav>`; links lack focus ring
- `src/components/Banner.astro:6-29` — scoped-CSS hex banner, off-theme, light-on-light contrast risk
- `src/components/report/MonthlyReport.tsx:42-54,128-154` — month switcher + 6-element expense row (mobile overflow)
- `src/components/categories/CategoryForm.tsx:75-93` & `src/components/expenses/ExpenseForm.tsx:100-152` — unlabelled selector button groups
- `src/pages/dashboard.astro:30-48`, `categories.astro`, `expenses.astro`, `report.astro`, `report/monthly.astro`, `report/yearly.astro`, `expenses/[id]/edit.astro` — the 7 pages sharing the duplicated wrapper + title pattern

## Consistency Matrix (recurring elements)

| Element | Variants found | Recommended single standard |
| --- | --- | --- |
| Container max-width | `max-w-sm` (auth), `max-w-md` (app), `max-w-4xl` (landing) | `max-w-md` app / `max-w-sm` auth / `max-w-4xl` landing — make it a deliberate 3-tier rule, not accidental |
| Page heading | `text-2xl` / `text-3xl` / `text-5xl+` | `text-2xl sm:text-3xl` (app), keep hero scale on landing |
| Card padding | `p-4` / `p-5` / `p-6` / `p-8` | `p-4` compact, `p-6` regular |
| Card radius | `rounded-lg/md/xl/2xl` | `rounded-2xl` cards, `rounded-lg` inputs/buttons |
| Backdrop blur | inconsistent | systematic rule (surface cards get `backdrop-blur-xl`; empty states don't) |
| Status banner | `rounded-lg px-3 py-2` vs `rounded-xl px-4 py-3` | single `Alert` component, `rounded-lg px-4 py-3` |
| Primary button | `px-4 py-2` vs `px-6 py-3`, inline vs CVA | one `Button` system |
| List gap | `gap-2` / `gap-3` / `gap-4` | `gap-3` default |
| Secondary text | `text-xs` vs `text-sm` | `text-xs` metadata, `text-sm` secondary copy |
| Link hover | some `hover:underline`, some not | `text-purple-300 hover:text-purple-100 hover:underline` |

## Architecture Insights

- **Two competing styling systems.** The shadcn OKLCH tokens (semantic, theme-able, dark-ready) and the cosmic theme (literal Tailwind utilities, copy-pasted) coexist without reconciliation. The single highest-leverage architectural decision for `/10x-plan` is to **promote the cosmic identity into the token layer** (`@theme`/CSS variables for the gradient stops, the `white/N` surface ladder, and the `purple`/`amber`/`emerald`/`red` accent roles), then refactor pages to consume tokens — rather than continuing two systems or ripping out the cosmic look.
- **Consolidation beats redesign.** Because the identity is already cohesive (the cosmic look *reads* as intentional), the work is standardising scales and extracting shared components, not choosing new colours. This aligns with the roadmap's scope guardrails ("Tailwind-utility-driven refresh … shared tokens/components only if duplication demands it").
- **Forms are the model.** The auth-form extraction (`FormField`/`SubmitButton`/`ServerError`) is exactly the pattern to replicate for `PageLayout`/`PageTitle`/`Card`/`Alert`/`EmptyState`/`BackLink`.
- **Runtime guardrail holds.** Islands are already minimal and correctly scoped; the refresh must not convert `.astro` pages to React "to look interactive" (CLAUDE.md §Runtime gotchas).
- **Accessibility is layout-level, not per-page.** Most a11y wins (landmarks, skip link, focus-ring defaults) land in `Layout.astro` + the new shared components, so extraction and a11y fixes are the *same* edit — do them together.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md` (S-08 "ui-visual-refresh") — defines the scope guardrails, the "codify existing cosmic identity" intent, the dark-mode-optional / contrast-AA-ish / no-WCAG-audit boundaries, and the supersession of the parked "Signed-in hub styling polish" item. The "Parked" entry there is the original source of the rough-hub-styling debt this slice absorbs.
- `context/changes/signed-in-shell/plan.md` — S-01 shipped the dashboard hub "functional but visually rough" (roadmap §Done), which is the seed of this slice.
- `context/changes/per-category-report/plan.md` — settled the report as a static `.astro` page plus the `MonthlyReport.tsx` island (later month-switcher work); explains why the report surface mixes static + island and why the expense-row markup is dense.
- `context/foundation/lessons.md` — no UI/styling lessons recorded yet (entries are data-layer/RLS/timezone). The reconciliation decision and any "tokenise the cosmic theme" rule would be the first UI lesson worth capturing via `/10x-lesson`.

## Related Research

- No prior `research.md` exists under `context/changes/**` (this is the first). `context/changes/log-expense-from-phone/reviews/impl-review.md` is the only adjacent review artifact and is implementation-focused, not styling.

## Open Questions

1. **Reconcile or coexist?** Should `/10x-plan` promote the cosmic theme into the `@theme` token layer (recommended) and refactor pages to tokens, or keep the shadcn tokens dormant and just standardise the inline cosmic utilities? — Owner: user / `/10x-plan`. Likely the central plan decision.
2. **Dark mode in v1?** Infra is complete (`.dark` tokens) but unused. Default per roadmap: light-only intent — though cosmic *is* dark. Clarify whether "dark mode toggle" is in scope or the cosmic dark look is simply the only theme. — Owner: user.
3. **How far to extract?** Tier 1 (`PageLayout`/`PageTitle`/`Alert`) is clearly justified by duplication; Tier 3 (full `button.tsx` adoption everywhere) may exceed the "visual-only, bounded" guardrail. — Owner: `/10x-plan`.
4. **`Banner.astro` fate.** It's off-theme (scoped hex CSS, light variants). Re-skin into the cosmic `Alert`, or leave as the top-of-page system banner? — Owner: `/10x-plan`.
5. **Contrast verification method.** "AA-ish" is the target; do we run an actual contrast check on the gradient headings, `white/N` text ladder, and `Banner.astro`, or eyeball it? A quick automated check would de-risk the named contrast items. — Owner: user.
6. **`LibBadge.astro` / starter leftovers.** Is `LibBadge` still shown anywhere user-facing, and should it be removed as part of the polish? — Owner: `/10x-plan` (verify usage first).

---

## Follow-up Research 2026-06-11 — UX analysis & targeted flow redesigns

**Trigger:** the user asked for (a) a UX analysis of how *all* pages feel to use, and (b) six concrete flow/structure changes — expense logging, navigation, branded header, yearly report, category creation, dashboard — all under a hard "used **mostly on mobile**" constraint. This goes beyond the visual-token/consistency scope of the original research: it touches **information architecture and interaction flow**, not just styling. Behaviour changes here are real (new routes/steps), so this section is explicitly the place where S-08's "visual-only" guardrail is being *consciously widened* by user request — `/10x-plan` must decide how much IA change belongs in S-08 vs a follow-up slice.

### External best-practice evidence

- **Material 3 — Navigation bar** (https://m3.material.io/components/navigation-bar/guidelines): a bottom navigation bar is the recommended pattern for **3–5 top-level destinations** on compact (mobile) windows; full-width, fixed position, one always-active destination, **icon + 1–2 word label required** (don't drop labels), min 3:1 icon contrast, re-tapping the active item scrolls to top. Don't use it for <3 destinations (use tabs) or >5 (use a menu). A FAB sits above the bar, never covering it.
- **NN/g — Basic Patterns for Mobile Navigation** (https://www.nngroup.com/articles/mobile-navigation-patterns/): the **"navigation hub"** pattern (homepage that exists only to list links) suits *task-based* apps where a user does one task per session — but it **"incurs an extra step (back to the hub) for each use of the navigation"** and wastes prime real estate on chrome. Tab/nav bars "work well when the number of navigation options is small."
- **NN/g — Mobile-App Onboarding** (https://www.nngroup.com/articles/mobile-app-onboarding/): prefer **defaults over choices**, put users "directly into the interface," and surface guidance **contextually** rather than via dedicated screens. Relevant to the dashboard: don't make the home screen a wall of equal-weight choices when one action (log expense) dominates real usage.

**Architectural read:** the app is *today* a pure navigation hub — [dashboard.astro](src/pages/dashboard.astro#L43) lists Categories / Log expense / Report as three equal cards, and every section links back to the hub via the [Topbar](src/components/Topbar.astro#L12) "Dashboard" link. With exactly **three stable top-level destinations**, this is a textbook fit for a **persistent bottom navigation bar**, which directly answers the user's "easy moving back from each screen + move to dashboard" request *without* a hub round-trip. This is the single highest-leverage IA decision in this follow-up.

### Holistic UX pass — every page

| Surface | Current UX feel | Primary friction (mobile) |
| --- | --- | --- |
| Landing [index.astro](src/pages/index.astro) | Polished marketing hero, mobile-first | Fine; only public page that feels "finished" |
| Auth [signin](src/pages/auth/signin.astro)/[signup](src/pages/auth/signup.astro) | Clean centered card | No focus rings on links; `confirm-email` is a dead-end (no clear next step) |
| Dashboard [dashboard.astro](src/pages/dashboard.astro) | Navigation-hub: 3 equal cards + a stranded "Sign out" | No primary action emphasis; every task = hub round-trip; no at-a-glance budget info |
| Topbar [Topbar.astro](src/components/Topbar.astro) | Raw email + text links in a thin bar | No brand identity/logo; email eats width on small screens; "Dashboard" link is the *only* cross-nav |
| Categories [categories.astro](src/pages/categories.astro) | List **and** create form stacked on one screen ([line 64](src/pages/categories.astro#L64)) | Create form always visible pushes list down; mixing browse + create on one screen is cluttered on mobile |
| Log expense [expenses.astro](src/pages/expenses.astro) + [ExpenseForm.tsx](src/components/expenses/ExpenseForm.tsx) | Category grid + amount + name + date all on one long screen | Category grid ([ExpenseForm.tsx:101](src/components/expenses/ExpenseForm.tsx#L101)) competes with the form fields; lots of vertical scroll; no single focal action |
| Report hub [report.astro](src/pages/report.astro) | Another nav-hub (Monthly/Yearly cards) | Extra hop before any data; two report types could be tabs |
| Monthly report [MonthlyReport.tsx](src/components/report/MonthlyReport.tsx) | Rich accordion w/ month switcher | Dense 6-element expense row overflows <320px (noted in main research) |
| Yearly report [report/yearly.astro](src/pages/report/yearly.astro) | Stacked label/value rows per card ([lines 86-118](src/pages/report/yearly.astro#L86)) | No visual progress signal (burn % is a number, not a bar); hard to scan "who's over budget" at a glance; long scroll |
| Edit expense `expenses/[id]/edit.astro` | Reuses ExpenseForm | Same category-grid-on-form friction |

**Cross-cutting UX issues found:**
- **No persistent navigation.** The only way between sections is the Topbar "Dashboard" link → back out → into another section. Confirmed in [Topbar.astro:12-19](src/components/Topbar.astro#L12).
- **Mobile viewport bug.** [Layout.astro:14](src/layouts/Layout.astro#L14) sets `<meta name="viewport" content="width=device-width">` **without `initial-scale=1`** — this can cause incorrect zoom/scaling on some mobile browsers. Add `initial-scale=1`. Low-effort, high-value for a mobile-first app.
- **No back affordance** on the primary section pages (categories/expenses/report only have the Topbar Dashboard link); only the deep report/edit pages have a `← Reports` back link.

### Requested redesign 1 — Log expense: category-first two-step flow

**Current:** [ExpenseForm.tsx](src/components/expenses/ExpenseForm.tsx) renders the category grid ([lines 100-127](src/components/expenses/ExpenseForm.tsx#L100)) above amount/name/date on one screen; selecting a category also auto-fills the name ([selectCategory, lines 60-63](src/components/expenses/ExpenseForm.tsx#L60)).

**Requested:** Step 1 shows the **category list only**; tapping a category advances to Step 2, a **log panel** (amount + name + date + save) with the **categories hidden**.

**Findings / design notes for `/10x-plan`:**
- The component **already holds `selectedId` in React state** ([line 44](src/components/expenses/ExpenseForm.tsx#L44)) and the categories are passed as props — so the two-step split is a **client-side `step` state machine inside the existing island**, not new routes or server changes. The POST contract (`category_id`, `amount`, `name`, `date` hidden/visible inputs) is unchanged.
- Step 2 needs a **"selected category" chip + a Change affordance** (back to Step 1) so the user isn't trapped — this also satisfies the user's broader "easy back" request at the flow level.
- Preserve the existing mobile niceties: `inputMode="decimal"` on amount ([line 145](src/components/expenses/ExpenseForm.tsx#L145)), native `<input type="date">` with `max={today}` ([line 180](src/components/expenses/ExpenseForm.tsx#L180)), and the "other"/catch-all default.
- **Speed risk:** the PRD's "log an expense in <10s" criterion lives here. A two-step flow adds a tap — keep Step 1 a single tap-to-advance (no confirm button) so total taps don't regress. Consider auto-focusing the amount field on Step 2.
- Edit mode (`expenses/[id]/edit.astro`) reuses this component with `initial` values — the redesign should **open directly on Step 2** when editing (category already known), skipping Step 1.

### Requested redesign 2 — Navigation: persistent back + dashboard access

**Recommendation (evidence-backed):** introduce a **persistent bottom navigation bar** on authenticated pages with the three top-level destinations (Categories, Log expense, Report) — Material 3's 3–5-destination sweet spot — with the active destination indicated. This removes the hub round-trip NN/g warns about and makes "move to dashboard / move between screens" a single tap from anywhere.
- Keep the Dashboard reachable: either make it a 4th nav item (Home/Dashboard) or the brand-header logo (tap logo → dashboard, a common convention).
- **Mobile ergonomics:** fixed bottom bar sits in the thumb zone; reserve bottom padding on page content so the bar doesn't cover the last row, and respect `env(safe-area-inset-bottom)` for notched phones.
- **Astro fit:** the bar is static markup in a shared layout/partial (likely a new `AppShell.astro` wrapping the `PageLayout` from the main research); active state can be derived server-side from `Astro.url.pathname` — **no client JS needed**, honouring the `.astro`-first guardrail.
- This **supersedes the Topbar's lone "Dashboard" link** and the report-hub round-trip; the report "Monthly vs Yearly" choice could become in-page **tabs** (Material 3: tabs for related content within a page) rather than a separate hub page.

### Requested redesign 3 — Branded header (app name + logo)

**Current:** [Topbar.astro](src/components/Topbar.astro) is a utilitarian bar showing the raw `user.email` + text links; no identity.

**Findings:**
- The app has **no logo asset and no defined name in the UI** — `index`/`dashboard` use the literal heading "Budget Tracker"; the project/product name is `10xmoney-tracker` (roadmap) / `10x-money-tracker` (worker). `/10x-plan` must **settle the product name + wordmark** first.
- Recommended split: a **slim branded header** (logo + wordmark, tappable → dashboard) for identity, with **account/sign-out moved into a small menu** (avatar/email behind a tap) so the email stops consuming width on small screens (current overflow risk flagged in main research at [Topbar.astro:5](src/components/Topbar.astro#L5)). Primary navigation moves to the bottom bar (redesign 2), leaving the header purely for brand + account.
- A simple inline **SVG logo** (cosmic-themed, matches the `bg-cosmic` gradient identity) avoids an extra network request and scales crisply on mobile. Favicon is currently `/favicon.png` ([Layout.astro:13](src/layouts/Layout.astro#L13)) — align the logo with it.
- Accessibility: the logo link needs an accessible name (`aria-label`/visually-hidden text); the header should be a `<header>` landmark (ties into the main-research a11y gap).

### Requested redesign 4 — Categories: list → "Add category" → create screen → back to list

**Current:** [categories.astro](src/pages/categories.astro) **always renders both** the `CategoryList` ([line 51](src/pages/categories.astro#L51)) and the `CategoryForm` in an "Add a category" card ([lines 64-67](src/pages/categories.astro#L64)) on the same screen. `CategoryList` *also* contains inline edit/delete state ([CategoryList.tsx:30-41](src/components/categories/CategoryList.tsx#L30)).

**Requested:** list + an **"Add category" button**; tapping it goes to a **create screen with the list hidden**; on success, return to the list.

**Findings / design notes for `/10x-plan`:**
- Two viable shapes: **(a) a dedicated route** `/categories/new` (clean URL, real back-button support, native browser history — best for mobile), or **(b) a client `view` state** in a combined island (no nav, but loses URL/back semantics). Given the user's emphasis on back-navigation, **(a) is preferred** and matches how the bottom bar / browser back would behave.
- The create flow already exists — `CategoryForm` POSTs to `/api/categories` and the API redirects back; a `/categories/new` page is mostly a **markup move**, not new logic.
- **Keep inline edit/delete in the list** ([CategoryList.tsx](src/components/categories/CategoryList.tsx#L72)) — that's a different, working interaction; only the *create* form moves out. (Note: edit reuses `CategoryForm` inline at [lines 65-80](src/components/categories/CategoryList.tsx#L65); decide whether edit also becomes a `/categories/[id]/edit` screen for consistency with the expense edit route, or stays inline.)
- Empty-state copy currently says "create your first one **below**" ([categories.astro:50](src/pages/categories.astro#L50)) — must change to point at the Add button/screen once the form moves.
- This pattern (list + add-button → focused create screen → back) should be the **template reused for the expense flow** so categories and expenses feel consistent.

### Requested redesign 5 — Yearly report UX

**Current:** [report/yearly.astro](src/pages/report/yearly.astro) renders each category as a card of stacked `label … value` rows (Spent / Limit / Delta-or-Remaining / Burn%) — [Monthly section lines 86-118](src/pages/report/yearly.astro#L86), Yearly section below. Burn % is a bare number coloured amber when >100%.

**Findings / improvement directions for `/10x-plan`:**
- **Add a visual progress signal.** Burn % is the key "am I on track" metric but it's text-only. A **horizontal progress/budget bar** (fill = spent/limit, colour-coded green→amber→red, capped/overflow-marked at >100%) makes each row scannable at a glance — the #1 UX win for this screen and fully static/CSS (no JS).
- **Make over-budget rows pop.** Today over/under is just `text-red-400`/`text-emerald-300` on the delta ([yearly.astro:105](src/pages/report/yearly.astro#L105)). Consider a left accent border or a small "Over by X" badge so the eye finds problems without reading every number.
- **Reduce scanning cost.** Four stacked rows per card is a lot of vertical space on mobile; consider a tighter two-column summary (spent/limit on one line, a bar + burn% on the next) so more categories fit on screen.
- **Section clarity.** "Monthly" vs "Yearly" `<h2>`s ([yearly.astro:114-115 region]) are easy to miss; a short one-line explainer or a segmented header helps first-time users understand recurring-vs-irregular.
- **"Other" row treatment** is already distinct (amber); keep it last and visually separated.
- Consistency: monthly accordion ([MonthlyReport.tsx](src/components/report/MonthlyReport.tsx)) and the yearly cards use different layouts — a shared `BudgetRow`/`ProgressBar` component would unify them (ties into the main-research `Card` extraction).

### Requested redesign 6 — Dashboard layout (best practices)

**Current:** three equal-weight nav cards + a detached "Sign out" button ([dashboard.astro:43-67](src/pages/dashboard.astro#L43)); it carries **no data** — it's pure chrome.

**Findings (evidence-backed):**
- Once a **bottom nav bar** exists (redesign 2), the dashboard **should stop being a navigation hub** (NN/g: hubs waste prime real estate and add round-trips) and become a **content home**: an at-a-glance summary of the budget year.
- **Best-practice home for a budget app:** lead with the dominant action and live data, not a menu —
  - A **prominent primary action** ("Log expense") as a FAB or hero button (NN/g onboarding: put users straight into the main task; M3: FAB above the nav bar). Logging is the app's reason to exist and the most frequent mobile task.
  - **Summary widgets:** current-year total spent vs planned, a couple of "most over-budget" categories, recent expenses — turning the home screen into a glanceable overview rather than a launcher.
  - Keep it **scannable and short**; defaults over choices (NN/g onboarding).
- **Scope caution for `/10x-plan`:** a data-rich dashboard means new queries/aggregation (reuse [lib/report.ts](src/lib/report.ts)) — this is **behaviour, not visual-only**, so it likely exceeds S-08's guardrail and may belong in a **separate slice**. Minimum viable for S-08: re-rank the cards to emphasise "Log expense," drop the redundant nav-card duplication once the bottom bar lands, and fix the stranded sign-out.

### Mobile-first checklist (applies to all of the above)

- Fix the **viewport meta** ([Layout.astro:14](src/layouts/Layout.astro#L14)) → add `initial-scale=1`.
- All tap targets ≥ 44–48px (M3/Apple HIG); current edit/delete buttons in [CategoryList.tsx:138-160](src/components/categories/CategoryList.tsx#L138) and the dense expense row are below this — enlarge.
- Bottom nav + FAB must respect `env(safe-area-inset-bottom)`; content needs bottom padding so the fixed bar doesn't occlude it.
- Responsive headings (`text-2xl sm:text-3xl`) per main research.
- Keep all interactive flows **single-thumb reachable**; primary actions toward the bottom of the screen.

### Updated open questions (for `/10x-plan`)

7. **Scope boundary:** how much IA/behaviour change (bottom nav, new `/categories/new` route, two-step expense flow, data-rich dashboard) belongs in S-08 vs a follow-up slice? S-08's charter is "visual-only" — the user's requests deliberately exceed it. — Owner: user / `/10x-plan`.
8. **Product name + logo:** what is the wordmark and is there a logo asset/brief? Blocks the branded header. — Owner: user.
9. **Report IA:** collapse the Monthly/Yearly hub into in-page tabs, or keep two routes? — Owner: `/10x-plan`.
10. **Dashboard data scope:** does S-08 ship a glanceable data home (needs queries) or just re-prioritise the existing cards? — Owner: user.
11. **Category create/edit consistency:** dedicated routes for both, or route-for-create + inline-edit? — Owner: `/10x-plan`.

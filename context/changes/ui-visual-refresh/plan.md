# UI Visual Refresh + UX Improvements Implementation Plan

## Overview

S-08 is a cross-cutting quality pass over the seven authenticated surfaces shipped by S-01–S-04 (dashboard, categories, log-expense, the report hub/monthly/yearly, and the expense-edit page) plus the auth/landing pages. It does two things at once: (1) **consolidate the visual system** — promote the ad-hoc "cosmic" look into reusable design tokens and shared components, standardise the inconsistent scales, and close named accessibility gaps; and (2) **layer six requested UX flow changes** on top — a persistent bottom navigation bar, a branded header, a two-step expense-logging flow, a focused category-create flow, a re-ranked dashboard, and a clearer yearly report. Behaviour, data, queries, RLS, and the Warsaw-noon storage invariant are preserved throughout.

> **Learner context (standing instruction for this whole change).** The user is a Java/JVM backend engineer with little React and no working frontend-framework background. During implementation, every UI concept — Tailwind utility classes, `@theme` CSS variables, Astro islands & `client:*` directives, React state/hooks, "FAB"/"bottom nav"/safe-area-inset, design tokens — must be explained in one plain sentence (bridging from JVM where useful: "a design token is a centralised CSS constant, like a value in `application.properties` reused across the UI"). Decisions that arise mid-implementation should be surfaced, not silently chosen. The `/quizme` skill exists for this learning gap.

## Current State Analysis

- **Two parallel, unreconciled styling systems** live in [src/styles/global.css](src/styles/global.css). A complete shadcn-style OKLCH token layer (`:root` + `.dark` + `@theme inline`, [lines 5–110](src/styles/global.css#L5-L110)) exists but **no page consumes it**. The actual identity is `@utility bg-cosmic` ([lines 113–115](src/styles/global.css#L113-L115)) — a dark-blue gradient — with gradient headings, `text-blue-100/N` body text, `white/N` translucent surfaces, and `purple`/`amber`/`emerald`/`red` accents applied as copy-pasted literal Tailwind classes on every page.
- **Inconsistent scales** across surfaces: container widths (`max-w-sm`/`max-w-md`/`max-w-4xl`), heading sizes (`text-2xl`/`text-3xl`/`text-5xl+`, app headings have **no** responsive scaling), card padding (`p-4`/`p-5`/`p-6`/`p-8`), radii (`rounded-lg`/`md`/`xl`/`2xl`), and two status-banner sizes for the same semantic.
- **Heavy structural duplication.** The cosmic page wrapper, gradient title+subtitle, empty-state card, back-link, status banner, and card panel are each copy-pasted 3–10× across the seven authenticated pages. Forms are the exception — `FormField`/`SubmitButton`/`ServerError` are genuinely reused and are the model to replicate.
- **Layout-level gaps** in [src/layouts/Layout.astro](src/layouts/Layout.astro): viewport meta is `width=device-width` **without `initial-scale=1`** ([line 14](src/layouts/Layout.astro#L14)) — a real mobile zoom bug; no `<main>` landmark, no skip-to-main link, no font stack, no theme wrapper.
- **No cross-navigation.** [src/components/Topbar.astro](src/components/Topbar.astro) is a `<div>` (not a landmark) showing the raw `user.email` + a lone "Dashboard" link — so every section switch is a hub round-trip (NN/g flags this; Material 3 recommends a bottom bar for 3–5 destinations, and the app has exactly three: Categories / Log / Report).
- **Specific a11y gaps** (from research, ranked): no landmarks/skip-link; `FormField` errored inputs lack `aria-invalid`/`aria-describedby` ([FormField.tsx#L40](src/components/auth/FormField.tsx#L40)); `ServerError` lacks `role="alert"` ([ServerError.tsx#L9](src/components/auth/ServerError.tsx#L9)); selector button groups in `CategoryForm`/`ExpenseForm` are unlabelled; several links/toggles lack a visible `focus-visible` ring; a few low-contrast combos (`white/40` placeholders, off-theme `Banner.astro`).
- **Expense form** ([src/components/expenses/ExpenseForm.tsx](src/components/expenses/ExpenseForm.tsx)) already holds `selectedId`, `amount`, `name`, `date` in React state ([lines 44–48](src/components/expenses/ExpenseForm.tsx#L44)) and renders the category grid above the fields on one long screen. It POSTs `category_id`/`amount`/`name`/`date` to `/api/expenses`. Edit mode reuses it via `initial` props.
- **Categories page** ([src/pages/categories.astro](src/pages/categories.astro)) renders `CategoryList` **and** the "Add a category" `CategoryForm` card stacked on one screen ([lines 51–67](src/pages/categories.astro#L51)). `CategoryList` owns inline edit/delete state ([CategoryList.tsx#L30](src/components/categories/CategoryList.tsx#L30)).
- **Report** is a hub ([report.astro](src/pages/report.astro)) linking to `/report/monthly` (the `MonthlyReport` island) and `/report/yearly` (a static page of stacked `label … value` rows; burn% is a bare amber number, [yearly.astro#L86-L118](src/pages/report/yearly.astro#L86)).
- **Dashboard** ([dashboard.astro](src/pages/dashboard.astro)) is three equal-weight nav cards + a stranded "Sign out" button; it carries no data — pure chrome.
- **Build/verify reality:** `npm run lint` (ESLint) and `npm run build` (Astro build, which runs `@astrojs/check` type-checking) are the only automated gates — **there is no test runner** ([package.json#L11-L12](package.json#L11)). A husky pre-commit hook runs `eslint --fix` + `prettier --write`.

## Desired End State

A signed-in user on a phone sees a cohesive, branded app: a slim header with the "Money Tracker" wordmark + logo and an account menu, a fixed bottom navigation bar giving one-tap movement between Categories / Log / Report (and Dashboard via the logo) from anywhere, consistent typography/spacing/colour driven by a single token source, polished cards and forms, visible focus rings, and semantic landmarks. Logging an expense is a two-step category-first flow that still completes in under 10 seconds. Adding a category is a focused screen reached from an "Add category" button with working browser-back. The yearly report shows at-a-glance progress bars with over-budget emphasis. **Verification:** `npm run build` and `npm run lint` pass; every page renders correctly at 320px and `sm`/`lg` breakpoints; keyboard tab order is logical with visible focus; logging an expense end-to-end stays within the 10-second budget.

### Key Discoveries:

- The cosmic identity already reads as intentional — this is **consolidation + tokenisation + extraction**, not a redesign ([global.css#L113-L115](src/styles/global.css#L113-L115)).
- The two-step expense flow needs **no server/route/contract change** — `ExpenseForm` already holds all state ([ExpenseForm.tsx#L44-L48](src/components/expenses/ExpenseForm.tsx#L44)); it's a client-side `step` machine inside the existing island.
- Bottom-nav active state can be derived **server-side** from `Astro.url.pathname` — **no client JS**, honouring the `.astro`-first runtime guardrail.
- The category-create flow is mostly a **markup move**: `CategoryForm` already POSTs to `/api/categories` and the API redirects back ([categories.astro#L66](src/pages/categories.astro#L66)).
- A11y wins are layout-level + shared-component-level, so **extraction and a11y fixes are the same edit** ([Layout.astro](src/layouts/Layout.astro), `FormField`, `ServerError`).
- Islands are already correctly scoped (`client:load` only on forms/stateful controls); the refresh must not convert `.astro` pages to React.

## What We're NOT Doing

- **No data-rich dashboard.** New queries/aggregation for a glanceable budget home are explicitly deferred to a separate roadmap slice (user decision). S-08 only re-ranks the existing nav cards and fixes the stranded sign-out.
- **No dark/light theme toggle.** Cosmic *is* the (dark) theme; tokenisation is done cleanly so a toggle is a cheap follow-up. The dormant shadcn `:root`/`.dark` light tokens are left in place, not wired to a switch.
- **No new UI framework or component library.** Tailwind 4 + the existing `button.tsx` CVA primitive only.
- **No formal WCAG-AA audit.** Target is "reasonable" a11y; contrast is eyeballed against research's specific remedies, not measured with an automated tool.
- **No changes to API contracts, query correctness, RLS, or the Warsaw-noon storage invariant** beyond what a flow change strictly requires.
- **No conversion of static `.astro` content to React islands.**

## Implementation Approach

Bottom-up: first lay the shared foundation (tokens + presentational components + layout/form a11y) so nothing is refactored twice, then build the navigation shell that wraps every page, then refactor each page body onto the foundation, then layer the three interaction-flow changes (expense two-step, category route, report tabs+bars) that depend on the finished components. Each phase is independently buildable and leaves the app in a working state.

## Critical Implementation Details

- **10-second logging budget is a hard regression guard (Phase 4).** The PRD's US-01 "log an expense in <10s" lives in `ExpenseForm`. Step 1 must advance on a **single tap** (no confirm button); Step 2 should auto-focus the amount field. Total taps must not increase versus today. Verify by timing a real log on a phone after the change.
- **Bottom-nav occlusion (Phase 2).** A `position: fixed` bottom bar covers the last rows of content unless page content reserves bottom padding, and it must respect `env(safe-area-inset-bottom)` on notched phones so it isn't hidden behind the home indicator.
- **Edit mode opens on Step 2 (Phase 4).** `expenses/[id]/edit.astro` reuses `ExpenseForm` with `initial` values; when `initial` is present the flow must start on the log panel (category already known), skipping the Step 1 picker.
- **Tokenise without breaking the look (Phase 1).** The cosmic gradient stops, the `white/N` surface ladder, and the accent roles move into CSS variables/`@theme`; the visual output must be pixel-identical — this is a refactor, not a restyle. Verify by eyeballing each page against `master` before/after.

---

## Phase 1: Token Foundation, Shared Primitives & Layout/Form Accessibility

### Overview

Establish the single source of truth (cosmic identity promoted into the token layer), extract the reusable presentational components that every page will consume, and fix the layout- and form-level accessibility gaps. Nothing visual should change yet — this phase produces the building blocks and wires the global `Layout`.

### Changes Required:

#### 1. Cosmic design tokens

**File**: `src/styles/global.css`

**Intent**: Promote the cosmic identity from copy-pasted literal utilities into named CSS variables so pages consume tokens instead of repeating class chains, and a future theme toggle becomes cheap. Preserve the existing `:root`/`.dark`/`@theme inline` shadcn block untouched (it stays dormant).

**Contract**: Add cosmic tokens (gradient stops `#0a0e1a`/`#0f1529`, the `white/N` surface-opacity ladder, and the accent roles — `purple` primary/selected, `amber` system/other, `emerald` positive, `red` negative/destructive, `blue-100/N` secondary-text ladder) as CSS custom properties, exposed to Tailwind via the existing `@theme inline` mechanism where utility access is needed. `@utility bg-cosmic` stays. No change to the gradient's rendered output.

#### 2. Presentational components

**File**: `src/components/ui/PageTitle.astro`, `src/components/ui/Card.astro`, `src/components/ui/Alert.astro`, `src/components/ui/EmptyState.astro`, `src/components/ui/BackLink.astro`

**Intent**: Extract the six repeated structural patterns (gradient title+subtitle, card panel, status banner, empty-state card, back link) into shared `.astro` components so the consistency-matrix standards are defined once. These mirror the proven `FormField`/`SubmitButton`/`ServerError` extraction model.

**Contract**:
- `PageTitle.astro` — props `title`, optional `subtitle`; responsive heading `text-2xl sm:text-3xl`, the gradient `from-blue-200 to-purple-200` clip-text treatment, centred.
- `Card.astro` — `variant?: "default" | "amber" | "error"` (default `rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl`), `<slot />` for content.
- `Alert.astro` — `variant: "success" | "error" | "warning"`; single standard `rounded-lg px-4 py-3`; carries `role="alert"` for error and `role="status" aria-live="polite"` for success.
- `EmptyState.astro` — message slot, no backdrop-blur (per consistency rule).
- `BackLink.astro` — `href`, label slot; `text-purple-300 hover:text-purple-100 hover:underline` + `focus-visible:ring`.

#### 3. Global layout: landmarks, skip link, font, viewport

**File**: `src/layouts/Layout.astro`

**Intent**: Close the layout-level a11y gaps and the mobile viewport bug in one place, since every page renders through this layout.

**Contract**: Set viewport to `width=device-width, initial-scale=1`; add a `sr-only` focusable skip-to-main link as the first body child targeting `#main`; wrap `<slot />` in `<main id="main">`; add a default sans font stack on `body`. The default `title` should change from "10x Astro Starter" to "Money Tracker" (ties into Phase 2 branding).

#### 4. Form-control accessibility

**File**: `src/components/auth/FormField.tsx`, `src/components/auth/ServerError.tsx`

**Intent**: Associate validation errors with their inputs and announce server errors, the two highest-priority form a11y gaps.

**Contract**: `FormField` — when an `error` prop is present, set `aria-invalid="true"` on the input and `aria-describedby` pointing at the error `<p id>`; raise placeholder contrast (`white/40` → `white/50`–`/60`). `ServerError` — add `role="alert"`. No behavioural change to validation logic.

### Success Criteria:

#### Automated Verification:

- Build passes (includes type-check): `npm run build`
- Linting passes: `npm run lint`
- New component files exist under `src/components/ui/`

#### Manual Verification:

- Every existing page still renders pixel-identically (tokenisation is a no-op visually)
- Skip link appears on keyboard focus and jumps to main content
- Tabbing through a form with a validation error announces the error (screen reader / inspect `aria-invalid`/`aria-describedby`)
- Viewport renders at correct scale on a real phone (no unexpected zoom)

**Implementation Note**: After completing this phase and all automated verification passes, pause for the human to confirm manual testing before proceeding.

---

## Phase 2: Branded Header + Persistent Bottom Navigation (`AppShell`)

### Overview

Replace the utilitarian `Topbar` with a branded header (wordmark + logo + account menu) and add a fixed bottom navigation bar, then migrate all authenticated pages to render through a single shell. This delivers the "easy move-back / move-to-dashboard from every screen" requirement.

### Changes Required:

#### 1. Inline SVG logo + branded header

**File**: `src/components/AppHeader.astro` (replaces `src/components/Topbar.astro` usage)

**Intent**: Give the app a visual identity and stop the raw email from eating width on small screens. The wordmark is **"Money Tracker"**; the logo is a simple inline cosmic-themed SVG (no extra network request, matches `bg-cosmic` + `/favicon.png`). Primary navigation moves to the bottom bar, so the header is purely brand + account.

**Contract**: A `<header>` landmark containing: a logo link (inline SVG + "Money Tracker" wordmark) that navigates to `/dashboard` with an accessible name (`aria-label`); and an account control on the right showing the signed-in state with sign-out (the email moves behind a compact menu/avatar rather than inline text). Signed-out state keeps Sign in / Sign up links. Reuse the existing signout `<form method="POST" action="/api/auth/signout">`.

#### 2. Bottom navigation bar

**File**: `src/components/BottomNav.astro`

**Intent**: One-tap movement between the three top-level destinations from anywhere, with the current destination indicated — Material 3's 3–5-destination pattern. Server-rendered, no client JS.

**Contract**: A `<nav aria-label="Primary">` fixed to the bottom, full-width, with three destinations (Categories `/categories`, Log `/expenses`, Report `/report`) each as icon + 1–2 word label (labels required, ≥44–48px tap targets, ≥3:1 icon contrast). Active destination derived by comparing `Astro.url.pathname` against each `href` (prefix-match for nested routes like `/report/*`, `/categories/*`, `/expenses/*`). Container must apply `env(safe-area-inset-bottom)` padding.

#### 3. Shell wrapper

**File**: `src/components/AppShell.astro`

**Intent**: Compose header + cosmic page container + bottom nav into one wrapper so pages stop repeating the `bg-cosmic flex min-h-screen … max-w-md` boilerplate, and so bottom-nav occlusion is handled once.

**Contract**: Renders `bg-cosmic` full-height container → `AppHeader` → `<main id="main" class="… max-w-md …">` with `<slot />` and **bottom padding sized to clear the fixed `BottomNav`** → `BottomNav`. Props: `title` (page `<title>`). The `#main` landmark + skip-link target from Phase 1 live here for authenticated pages.

#### 4. Migrate authenticated pages onto `AppShell`

**File**: `src/pages/dashboard.astro`, `categories.astro`, `expenses.astro`, `report.astro`, `report/monthly.astro`, `report/yearly.astro`, `expenses/[id]/edit.astro`

**Intent**: Replace each page's hand-rolled `Layout` + `Topbar` + cosmic wrapper with `AppShell`, removing the duplicated chrome.

**Contract**: Each page swaps its `Layout`/`Topbar`/wrapper `div` for `<AppShell title="…">`. The lone Topbar "Dashboard" link and the report hub's role as the only cross-nav are superseded by the bottom bar. Page body content is otherwise unchanged in this phase (body consolidation is Phase 3).

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint`
- `Topbar.astro` no longer imported by any authenticated page: `grep -r "Topbar" src/pages` returns nothing

#### Manual Verification:

- Bottom nav appears on all authenticated pages; tapping each destination navigates correctly
- Active destination is highlighted matching the current URL (including nested `/report/*`)
- Logo tap returns to dashboard; logo link has an accessible name
- Bottom bar does not occlude the last row of content; respects safe-area on a notched phone
- Header account menu shows sign-out and works; email no longer overflows on a 320px screen

**Implementation Note**: Pause for human manual-testing confirmation before proceeding.

---

## Phase 3: Page-Body Consolidation onto Tokens & Components

### Overview

Refactor the body of each authenticated page (and the auth/landing pages where relevant) to consume the Phase 1 tokens and components, applying the consistency-matrix standards. Also handle the secondary cleanups: re-skin `Banner.astro`, remove `LibBadge`, re-rank dashboard cards, fix the stranded sign-out.

### Changes Required:

#### 1. Apply shared components + consistency standards

**File**: `src/pages/dashboard.astro`, `categories.astro`, `expenses.astro`, `report.astro`, `report/monthly.astro`, `report/yearly.astro`, `expenses/[id]/edit.astro`, plus auth pages

**Intent**: Replace inline gradient headings, card divs, status banners, empty states, and back links with `PageTitle`/`Card`/`Alert`/`EmptyState`/`BackLink`, and standardise spacing/radius/heading scale per the consistency matrix.

**Contract**: Apply the deliberate 3-tier width rule (`max-w-md` app / `max-w-sm` auth / `max-w-4xl` landing), `text-2xl sm:text-3xl` app headings, `p-4` compact / `p-6` regular card padding, `rounded-2xl` cards / `rounded-lg` inputs+buttons, single `Alert` for all status banners, `gap-3` default list gap. No behavioural change.

#### 2. Re-skin `Banner.astro` into the cosmic Alert

**File**: `src/components/Banner.astro`

**Intent**: The top-of-page config banner uses scoped-CSS hex colours (light-on-light, off-theme). Bring it onto the cosmic `Alert` look.

**Contract**: Re-skin `Banner` to use the `Alert` component / cosmic tokens (dark surface, readable contrast) instead of its scoped hex CSS, preserving the `variant="error"` API used by `Layout.astro`.

#### 3. Remove `LibBadge` starter leftover

**File**: `src/components/ui/LibBadge.astro`

**Intent**: Drop the starter artifact if unused.

**Contract**: Verify usage first (`grep -r "LibBadge" src`). If no user-facing reference remains, delete the file and any import. If it is referenced, leave it and note why.

#### 4. Re-rank dashboard + fix stranded sign-out

**File**: `src/pages/dashboard.astro`

**Intent**: Emphasise "Log expense" as the dominant action (NN/g: lead with the primary task) and resolve the detached sign-out now that the header owns account actions.

**Contract**: Re-order/visually emphasise the "Log expense" card above Categories/Report; remove the standalone sign-out button (sign-out now lives in the `AppHeader` account menu from Phase 2). No new data/queries. (Data-rich dashboard is a deferred roadmap item.)

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint`
- No literal `bg-cosmic` wrapper boilerplate remains duplicated in pages migrated to `AppShell` (spot-check)

#### Manual Verification:

- Every page reads as one consistent visual system (spacing, headings, cards, banners)
- Config-missing `Banner` renders on-theme and legible
- Dashboard leads with "Log expense"; sign-out reachable only via header and works
- Headings scale correctly at 320px → `sm` → `lg`
- Eyeball contrast pass on gradient headings, `white/N` text, and the re-skinned banner against AA-ish target

**Implementation Note**: Pause for human manual-testing confirmation before proceeding.

---

## Phase 4: Two-Step Category-First Expense Flow

### Overview

Convert `ExpenseForm` into a two-step flow: Step 1 shows the category list only; tapping a category advances to Step 2 (amount/name/date with the categories hidden). All within the existing island — no server/route/contract change. Protect the 10-second logging budget.

### Changes Required:

#### 1. `step` state machine in `ExpenseForm`

**File**: `src/components/expenses/ExpenseForm.tsx`

**Intent**: Split the single long form into a category-picker step and a log-panel step, keeping the POST contract and mobile niceties intact.

**Contract**: Add `step` state (`"pick" | "log"`). Step 1 renders the existing category grid; tapping a category calls the existing `selectCategory` **and** advances to `"log"` in one tap (no confirm button). Step 2 renders amount (`inputMode="decimal"`), name, date (native, `max={today}`), submit, plus a **selected-category chip with a "Change" affordance** back to Step 1. Auto-focus the amount field on entering Step 2. When `initial` props are present (edit mode), start directly on `"log"`. The hidden `category_id` input and the `/api/expenses` POST are unchanged.

#### 2. Selector group accessibility

**File**: `src/components/expenses/ExpenseForm.tsx`, `src/components/categories/CategoryForm.tsx`

**Intent**: Close the unlabelled selector-group a11y gap while this code is open.

**Contract**: Wrap the category/type selector button groups in `<fieldset>` with a `<legend>` (or `aria-labelledby`). Preserve existing `aria-pressed` on the buttons.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- New-expense flow: pick a category (1 tap) → log panel with amount auto-focused → save; full flow completes in **under 10 seconds** on a phone (hard regression guard)
- "Change" affordance returns to the category picker without losing entered data inappropriately
- Edit-expense page opens directly on the log panel with values pre-filled
- Selector group is announced as a labelled group by a screen reader
- `inputMode="decimal"` keyboard + native date picker still work on mobile

**Implementation Note**: Pause for human manual-testing confirmation before proceeding.

---

## Phase 5: Focused Category-Create Flow

### Overview

Move category creation off the list screen into a dedicated `/categories/new` route reached via an "Add category" button, with browser-back returning to the list. Inline edit/delete stays in the list.

### Changes Required:

#### 1. New create route

**File**: `src/pages/categories/new.astro`

**Intent**: A focused create screen (list hidden) with real URL + browser-back support, matching the bottom-nav/back model. Mostly a markup move — the create logic already exists.

**Contract**: New page rendered through `AppShell` with a `BackLink` to `/categories`, a `PageTitle`, and the existing `CategoryForm` (`client:load`, `serverError` from `?error`). `CategoryForm` already POSTs to `/api/categories`, which redirects back to `/categories` on success — no API change.

#### 2. Categories list page becomes list + Add button

**File**: `src/pages/categories.astro`

**Intent**: Remove the always-visible create form; surface an "Add category" entry point instead.

**Contract**: Drop the "Add a category" `Card` + inline `CategoryForm` ([categories.astro#L64-L67](src/pages/categories.astro#L64)). Add an "Add category" button/link to `/categories/new`. Update the empty-state copy from "create your first one **below**" to point at the Add button/screen. `CategoryList` and its inline edit/delete are unchanged.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint`
- `/categories/new` route file exists

#### Manual Verification:

- `/categories` shows the list + an "Add category" button; the create form is no longer stacked below
- Tapping "Add category" opens `/categories/new` with the list hidden; browser back returns to the list
- Creating a category redirects back to `/categories` and the new category appears
- Inline edit/delete in the list still works
- Empty-state copy points at the Add button, not "below"

**Implementation Note**: Pause for human manual-testing confirmation before proceeding.

---

## Phase 6: Report UX — Progress Bars, Over-Budget Emphasis & Tabs

### Overview

Add a visual progress signal to the report, emphasise over-budget rows, and collapse the Monthly/Yearly hub into in-page tabs on `/report` (the bottom nav already provides the "Report" entry point, making the hub round-trip redundant).

### Changes Required:

#### 1. Shared progress/budget-row components

**File**: `src/components/report/ProgressBar.tsx` (or `.astro` if static), `src/components/report/BudgetRow.astro`

**Intent**: A reusable horizontal budget bar (fill = spent/limit, colour-coded green→amber→red, marked/capped at >100%) and a compact row layout, unifying the monthly and yearly presentations. All CSS — no JS needed for the bar.

**Contract**: `ProgressBar` — props `spentCents`, `limitCents`; renders a horizontal bar with fill width = `min(100, spent/limit*100)%`, colour green (<80%), amber (80–100%), red (>100%), and an explicit overflow marker when over 100%. `BudgetRow` — compact two-line summary (spent/limit on one line, bar + burn% on the next) plus over-budget emphasis (left accent border or "Over by X" badge). Reuse `formatCentsToPln`.

#### 2. Apply to yearly + monthly

**File**: `src/pages/report/yearly.astro`, `src/components/report/MonthlyReport.tsx`

**Intent**: Replace the stacked `label … value` rows with the scannable bar/row layout; keep "other" treatment distinct (amber, last).

**Contract**: Yearly page renders each category via `BudgetRow`/`ProgressBar`; monthly view adopts the same bar where a limit exists. No change to `buildReport` logic, the Warsaw-timezone year derivation, or the expense-cutoff query.

#### 3. Collapse report hub into tabs

**File**: `src/pages/report.astro`, `src/pages/report/monthly.astro`, `src/pages/report/yearly.astro`

**Intent**: Remove the extra hop: `/report` presents Monthly/Yearly as in-page tabs rather than a launcher of two cards.

**Contract**: `/report` renders a segmented tab control (Monthly | Yearly) using a server-read `?view=monthly|yearly` query param (default `monthly`) so tab state needs **no client JS**; the selected tab renders the corresponding content (Monthly = the existing `MonthlyReport` island, Yearly = the `BudgetRow` list). Keep `/report/monthly` and `/report/yearly` working by redirecting them to `/report?view=…` (preserves any existing links/bookmarks). The dense 6-element `MonthlyReport` expense row ([MonthlyReport.tsx#L128-L154](src/components/report/MonthlyReport.tsx#L128)) is tightened to avoid <320px overflow.

### Success Criteria:

#### Automated Verification:

- Build passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification:

- Each report category shows a colour-coded progress bar; over-budget rows are visually obvious at a glance
- `/report` shows Monthly/Yearly tabs; switching tabs works without a full hub round-trip; `?view=` reflects the active tab
- `/report/monthly` and `/report/yearly` redirect to the tabbed page
- Monthly expense row no longer overflows at 320px
- Report numbers (spent/limit/burn%) match `master` exactly — no aggregation regression
- "Other" category remains distinct (amber, last)

**Implementation Note**: Pause for human manual-testing confirmation; this is the final phase.

---

## Testing Strategy

> No automated test runner is configured ([package.json](package.json#L5-L13)). Verification is `npm run build` (type-check via `@astrojs/check`) + `npm run lint`, plus structured manual testing.

### Automated (per phase):

- `npm run build` — type-checks and compiles all `.astro`/`.tsx`
- `npm run lint` — ESLint across the project

### Manual Testing Steps:

1. **Visual regression (Phase 1):** compare each page against `master` — tokenisation must be a visual no-op.
2. **Navigation (Phase 2):** on a phone, tap every bottom-nav destination from every page; confirm active highlight, logo→dashboard, no occlusion, safe-area.
3. **Consistency (Phase 3):** scan all pages for uniform headings/spacing/cards/banners; eyeball AA-ish contrast.
4. **10-second logging (Phase 4):** time a full new-expense log on a phone — must be <10s; verify edit opens on Step 2.
5. **Category create (Phase 5):** Add → create → back-to-list round trip + browser back; inline edit/delete unaffected.
6. **Report (Phase 6):** progress bars colour-code correctly; tabs switch; old routes redirect; numbers unchanged vs `master`; 320px no overflow.
7. **Cross-cutting:** keyboard-only tab through every page (visible focus, logical order, skip link); render at 320px / `sm` / `lg`; tap targets ≥44–48px.

## Performance Considerations

- Bottom nav, header, progress bars, and report tabs are **server-rendered `.astro`** — no added client JS, preserving the lean-island posture.
- The two-step expense flow adds only client `step` state inside an already-hydrated island — no new hydration cost.
- Inline SVG logo avoids an extra network request.

## Migration Notes

- No data or schema migration. `/report/monthly` and `/report/yearly` redirect to `/report?view=…` so existing links/bookmarks keep working.
- The dormant shadcn `:root`/`.dark` light-theme tokens are intentionally left in place for a cheap future dark/light toggle.

## Follow-up (not in this slice)

- **Data-rich dashboard** (year totals, most-over-budget categories, recent expenses) — needs new queries reusing [src/lib/report.ts](src/lib/report.ts); deferred to a new roadmap item per user decision. Add this to `context/foundation/roadmap.md`.
- Consider a `/10x-lesson` entry capturing the "tokenise the cosmic theme; one source of truth" decision — the first UI lesson for this repo.

## References

- Internal research: `context/changes/ui-visual-refresh/research.md`
- Roadmap entry: `context/foundation/roadmap.md` (S-08)
- Consistency matrix & a11y gap table: `context/changes/ui-visual-refresh/research.md` (§Consistency Matrix, §Accessibility)
- Reuse model: `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `ServerError.tsx`
- Token layer: `src/styles/global.css:5-115`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Token Foundation, Shared Primitives & Layout/Form Accessibility

#### Automated

- [x] 1.1 Build passes (includes type-check): `npm run build` — 3b564b8
- [x] 1.2 Linting passes: `npm run lint` — 3b564b8
- [x] 1.3 New component files exist under `src/components/ui/` — 3b564b8

#### Manual

- [x] 1.4 Every existing page still renders pixel-identically — 3b564b8
- [x] 1.5 Skip link appears on keyboard focus and jumps to main content — 3b564b8
- [x] 1.6 Form validation error announced via `aria-invalid`/`aria-describedby` — 3b564b8
- [x] 1.7 Viewport renders at correct scale on a real phone — 3b564b8

### Phase 2: Branded Header + Persistent Bottom Navigation (AppShell)

#### Automated

- [x] 2.1 Build passes: `npm run build` — 324a24c
- [x] 2.2 Linting passes: `npm run lint` — 324a24c
- [x] 2.3 `Topbar.astro` no longer imported by any authenticated page — 324a24c

#### Manual

- [x] 2.4 Bottom nav appears on all authenticated pages; destinations navigate — 324a24c
- [x] 2.5 Active destination highlighted matching current URL (incl. nested `/report/*`) — 324a24c
- [x] 2.6 Logo tap returns to dashboard; logo link has accessible name — 324a24c
- [x] 2.7 Bottom bar does not occlude content; respects safe-area — 324a24c
- [x] 2.8 Header account menu shows sign-out; email no longer overflows at 320px — 324a24c

### Phase 3: Page-Body Consolidation onto Tokens & Components

#### Automated

- [x] 3.1 Build passes: `npm run build` — 42866ab
- [x] 3.2 Linting passes: `npm run lint` — 42866ab
- [x] 3.3 No duplicated `bg-cosmic` wrapper boilerplate remains in migrated pages — 42866ab

#### Manual

- [x] 3.4 Every page reads as one consistent visual system — 42866ab
- [x] 3.5 Config-missing `Banner` renders on-theme and legible — 42866ab
- [x] 3.6 Dashboard leads with "Log expense"; sign-out only via header — 42866ab
- [x] 3.7 Headings scale correctly at 320px → `sm` → `lg` — 42866ab
- [x] 3.8 Eyeball contrast pass (headings, `white/N` text, banner) — 42866ab

### Phase 4: Two-Step Category-First Expense Flow

#### Automated

- [x] 4.1 Build passes: `npm run build` — 46df4c1
- [x] 4.2 Linting passes: `npm run lint` — 46df4c1

#### Manual

- [x] 4.3 New-expense flow completes in under 10 seconds on a phone — 46df4c1
- [x] 4.4 "Change" affordance returns to category picker correctly — 46df4c1
- [x] 4.5 Edit-expense opens directly on the log panel with values pre-filled — 46df4c1
- [x] 4.6 Selector group announced as a labelled group — 46df4c1
- [x] 4.7 `inputMode="decimal"` + native date picker still work on mobile — 46df4c1

### Phase 5: Focused Category-Create Flow

#### Automated

- [x] 5.1 Build passes: `npm run build` — 539dac8
- [x] 5.2 Linting passes: `npm run lint` — 539dac8
- [x] 5.3 `/categories/new` route file exists — 539dac8

#### Manual

- [x] 5.4 `/categories` shows list + "Add category" button; no stacked form — 539dac8
- [x] 5.5 Add opens `/categories/new` (list hidden); browser back returns to list — 539dac8
- [x] 5.6 Creating a category redirects to `/categories` and appears — 539dac8
- [x] 5.7 Inline edit/delete still works — 539dac8
- [x] 5.8 Empty-state copy points at the Add button — 539dac8

### Phase 6: Report UX — Progress Bars, Over-Budget Emphasis & Tabs

#### Automated

- [x] 6.1 Build passes: `npm run build` — d968876
- [x] 6.2 Linting passes: `npm run lint` — d968876

#### Manual

- [x] 6.3 Each category shows a colour-coded progress bar; over-budget obvious — d968876
- [x] 6.4 `/report` shows Monthly/Yearly tabs; switching works; `?view=` reflects active tab — d968876
- [x] 6.5 `/report/monthly` and `/report/yearly` redirect to the tabbed page — d968876
- [x] 6.6 Monthly expense row no longer overflows at 320px — d968876
- [x] 6.7 Report numbers match `master` exactly — d968876
- [x] 6.8 "Other" category remains distinct (amber, last) — d968876

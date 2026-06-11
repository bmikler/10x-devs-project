---
project: 10xmoney-tracker
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-08
prd_version: 1
main_goal: learn
top_blocker: capacity
---

# Roadmap: 10xmoney-tracker

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

Replace the personal-budget Excel workflow with a mobile-first web app where logging an expense from a phone takes seconds, the year is the planning unit (not twelve duplicated month tabs), and the categories model distinguishes recurring monthly budgets (groceries) from irregular annual pots (vacation). The single-user MVP proves its premise when the user completes the full primary loop — sign in, define categories, log an expense from a phone, view the report — without dropping back to Excel.

## North star

**S-04: User can view, per category, remaining for the current calendar year — alongside an average monthly spend for recurring monthly categories and a single cumulative spent value for irregular annual categories** — once this slice ships, US-01's "log an expense and see the report row update" works end-to-end, which is what the PRD's §Success Criteria literally calls "proof of MVP".

> "North star" here means the smallest end-to-end slice whose successful delivery would prove the product's central premise — that mobile-fast capture replaces Excel. It is sequenced as early as Prerequisites allow, because every later slice only matters if this loop works.

## At a glance

| ID   | Change ID              | Outcome (user can …)                                                                                           | Prerequisites    | PRD refs                            | Status   |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- |----------|
| F-01 | data-layer-and-rls     | (foundation) categories + expenses tables + per-user RLS + generated TS types                                  | —                | NFR §Data isolation, FR-003, FR-007 | done     |
| S-01 | signed-in-shell        | sign in, sign out, and land on a hub linking to Categories / Log expense / Report                              | —                | FR-001, FR-002                      | done     |
| S-02 | categories-create-list | create a category and see all categories listed (including implicit "other")                                   | F-01, S-01       | FR-003, FR-004                      | done     |
| S-03 | log-expense-from-phone | log an expense (amount + category + date) from a phone, with "other" as fallback                               | F-01, S-01, S-02 | FR-007, FR-008                      | done     |
| S-04 | per-category-report    | view a Monthly section (recurring: avg/limit + burn%) and a Yearly section (irregular: spent/limit + remaining + burn%, "other" last) | F-01, S-02, S-03 | FR-011, US-01                       | done     |
| S-05 | expenses-list          | view the list of previously logged expenses                                                                    | S-03             | FR-009                              | done     |
| S-06 | expenses-edit-delete   | edit or delete a previously logged expense                                                                     | S-05             | FR-010                              | done     |
| S-07 | categories-edit-delete | edit a category and delete one with cascade-to-"other" reassignment of expenses                                | S-02             | FR-005, FR-006                      | done     |
| S-08 | ui-visual-refresh      | experience a modern, visually consistent, mobile-first UI **and improved user-experience flows** (navigation, expense logging, category creation, dashboard, reports) with reasonable accessibility across every shipped page | S-01, S-02, S-03, S-04 | NFR §Mobile responsiveness, NFR §Accessibility assumption, US-01 (10s logging) | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                             | Note                                                                                                |
| ------ | ---------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| A      | Auth & shell           | `S-01`                            | Independent of data; can run in parallel with F-01 in a separate evening session.                   |
| B      | Path to the north star | `F-01` → `S-02` → `S-03` → `S-04` | Critical path. `main_goal: learn` puts the most novel tech (RLS, period attribution) on this chain. |
| C      | Expenses lifecycle     | `S-05` → `S-06`                   | Post-north-star hardening; joins Stream B at `S-03` (consumes the expenses table).                  |
| D      | Categories lifecycle   | `S-07`                            | Post-north-star hardening; joins Stream B at `S-02`. Exercises cascade-to-"other" semantics.        |
| E      | Cross-cutting UX       | `S-08`                            | Horizontal UX + visual polish over already-shipped surfaces (S-01–S-04). Not a single vertical slice — a quality pass covering both the visual system **and user-experience/interaction flows** (navigation, two-step expense logging, category create flow, dashboard, reports). Supersedes the parked hub-styling item. Best run once the primary loop is feature-complete so the design language and interaction patterns are applied once, not re-litigated per slice. |

## Baseline

What's already in place in the codebase as of 2026-05-27 (auto-researched + user-confirmed). Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 SSR + React 19 + Tailwind 4 starter wired; `src/layouts/Layout.astro` is mobile-responsive (Tailwind `sm:`/`lg:` utilities); auth pages + a placeholder `/dashboard.astro` exist; zero budget-tracker pages or islands today.
- **Backend / API:** partial — Astro server-route platform present; only `/api/auth/{signin,signup,signout}.ts` wired. No budget-domain endpoints.
- **Data:** absent — `supabase/migrations/` is empty, no `seed.sql`, no generated `database.types.ts`, no RLS policies. The Supabase project + secrets exist (per `deploy-plan.md`) but the schema is unmade.
- **Auth:** partial — Supabase SSR client wired at `src/lib/supabase.ts:9`; email/password sign-in/up/out flows live; route-level middleware gates `/dashboard` at `src/middleware.ts:18-22`. **No OAuth provider configured** — shape-notes specified OAuth but PRD softened to "third-party identity provider" (Supabase email/password satisfies the PRD text; see Open Roadmap Q #6). `SESSION` KV is declared in `wrangler.jsonc:15` but unused in `src/`.
- **Deploy / infra:** present — Worker `10x-money-tracker` live at `https://10x-money-tracker.devbmmail.workers.dev` (per `context/deployment/deploy-plan.md`); `npm run deploy` / `npm run tail` scripts wired; Supabase secrets stored; KV bound; rollback verified end-to-end. No CI deploy (manual only).
- **Observability:** present — `observability.enabled = true` in `wrangler.jsonc`; logs queryable via Cloudflare Observability MCP (`observability.mcp.cloudflare.com/mcp`). No app-level logging conventions yet.

## Foundations

### F-01: Domain data model + per-user RLS

- **Outcome:** (foundation) `categories` and `expenses` tables created via Supabase migration, row-level-security policies enforce per-user isolation on every read and write, generated TypeScript types committed to the repo.
- **Change ID:** data-layer-and-rls
- **PRD refs:** NFR §Data isolation (Access Control), FR-003 (category model: name, type, limit), FR-007 (expense model: amount, date, category), Business Logic §Period attribution
- **Unlocks:** S-02, S-03 (and transitively every downstream slice); reduces the "data isolation correctness" risk that would otherwise cascade through every read/write path.
- **Prerequisites:** —
- **Parallel with:** S-01
- **Blockers:** —
- **Unknowns:**
  - Is the implicit "other" category modeled as a seeded real row per user, or as a virtual category synthesized in queries (`COALESCE(category_id, 'other')`)? — Owner: user. Block: no (decision lands in `/10x-plan`).
  - Should the schema carry a `year` column on categories for v1.1 multi-year support, or stay year-agnostic and bound at query time? — Owner: user. Block: no (calendar-year boundary in queries works for v1).
- **Risk:** Highest-investment layer per `main_goal: learn` — Supabase migrations + RLS are unfamiliar tech for a Java engineer. A wrong RLS policy is a silent data-isolation leak that contradicts the PRD's most explicit guardrail.
- **Status:** ready

## Slices

### S-01: Signed-in shell and budget-tracker landing hub

- **Outcome:** user can sign in (with the Supabase auth that's already wired), sign out, and land on a hub page that links to Categories, Log expense, and Report.
- **Change ID:** signed-in-shell
- **PRD refs:** FR-001, FR-002, NFR §Mobile responsiveness
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Is email/password (current) acceptable as the "third-party identity provider" of FR-001, or should this slice swap to OAuth (Google/GitHub) per shape-notes? — Owner: user. Block: no (existing auth works as-is; an OAuth swap adds work but does not gate planning).
  - Repurpose or replace the placeholder `src/pages/dashboard.astro`? — Owner: user. Block: no.
- **Risk:** Low — mostly cosmetic and navigation work; the auth plumbing already exists in the baseline.
- **Status:** done — shipped to prod 2026-05-29. Functional; hub styling is rough (see Parked: hub styling polish).

### S-02: Categories — create and list

- **Outcome:** user can create a new category (name + type `recurring|irregular` + spending limit) and see all categories listed, including the implicit "other" alongside user-defined ones.
- **Change ID:** categories-create-list
- **PRD refs:** FR-003, FR-004
- **Prerequisites:** F-01, S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - How is "other" visually distinguished in the list (PRD Open Q #2)? — Owner: designer. Block: no (ship a sensible default; refine in v1.1).
- **Risk:** First slice that exercises RLS on a real read+write path — proves the data-isolation guardrail. An RLS mistake here cascades to S-03 and S-04.
- **Status:** proposed

### S-03: Log an expense from a phone

- **Outcome:** user can log an expense (amount + chosen category + date defaulting to today) from a phone in under ten seconds; submitting without picking a category routes the expense to "other".
- **Change ID:** log-expense-from-phone
- **PRD refs:** FR-007, FR-008, NFR §Mobile responsiveness, NFR §User-perceived response < 2s
- **Prerequisites:** F-01, S-01, S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Native `input[type="date"]` or a custom mobile date picker? — Owner: user. Block: no (default to native; refine if NFR is missed).
- **Risk:** The PRD's 10-second secondary success criterion lives here. NFR < 2s response budget is exercised on the save path. If this flow doesn't feel fast on a phone, the MVP's core thesis is unproven.
- **Status:** shipped — POST /api/expenses, expenses.astro, ExpenseForm.tsx; `expense_at` stored at Warsaw noon (`warsawNoon()`).

### S-04: Per-category report — Monthly / Yearly sections (NORTH STAR)

- **Outcome:** user can view a read-only `/report` page for the current calendar year (1 Jan – 31 Dec), split into two sections by category type:
  - **Monthly section** (recurring categories): per row, **average monthly spend** (year total ÷ elapsed Warsaw months, current month inclusive) vs the **monthly limit**, an over/under **delta** (`limit − avg`, negative allowed), and a **burn %** (`avg ÷ monthly limit`).
  - **Yearly section** (irregular categories): per row, **year-to-date spent** vs the **annual limit**, **remaining** (`limit − spent`, negative allowed), and a **burn %** (`spent ÷ annual limit`). The system **"other"** row appears last, **spent-only** — no limit, no remaining, no burn %.
  - Overspend/over-pace reads via colour + sign (no new components); empty/partial states handled (no categories → link to create one; categories-with-no-expenses → zeroed rows).
- **Change ID:** per-category-report
- **PRD refs:** FR-011, US-01, Business Logic §Period attribution, §Plan-relative roll-up, §Calendar-year boundary
- **Prerequisites:** F-01, S-02, S-03 (all shipped)
- **Parallel with:** —
- **Blockers:** —
- **Design decisions (settled in `/10x-plan`, see `context/changes/per-category-report/plan.md`):**
  - Aggregation in TypeScript on the page — no migration/RPC; a UTC year-range filter on `expense_at` is exact thanks to the Warsaw-noon storage invariant.
  - Static `.astro` page, zero client JS (read-only view).
  - Category ordering: user rows alphabetical, "other" last (reuses the existing pages' `is_system`-then-`name` order).
  - Burn % is a plain "% of budget consumed", not time-prorated.
  - A month switcher was considered and cut by the user.
- **FR-011 deviation (recorded):** recurring rows show a *monthly* delta (`limit − avg`) instead of FR-011's literal "remaining for the current year"; the year-remaining figure is kept only in the Yearly (irregular) section. Conscious, user-approved narrowing.
- **Risk:** The PRD's Business Logic central rule lives here. Period attribution + plan-relative roll-up + calendar-year boundary correctness is the single load-bearing thing this slice ships. Get it wrong and the report lies about plan vs actuals — which invalidates the whole product premise.
- **Status:** shipped — `src/lib/report.ts` (pure aggregation helper) + `src/pages/report.astro` (static server-rendered page); expense query capped at start of next month to exclude future-dated expenses; 2 commits: `5e47cf6` (p1 helper), `6a02431` (p2 page). North-star loop complete 2026-06-08.

### S-05: Expenses — list view

- **Outcome:** user can view the list of their previously logged expenses (the substrate that the edit/delete flow in S-06 consumes).
- **Change ID:** expenses-list
- **PRD refs:** FR-009
- **Prerequisites:** S-03
- **Parallel with:** S-04, S-07
- **Blockers:** —
- **Unknowns:**
  - Default sort (newest first?) and pagination strategy (paginated, infinite scroll, all-in-one for small datasets)? — Owner: user. Block: no.
- **Risk:** Low — straightforward read view. The < 2s NFR is the only constraint to watch as the dataset grows.
- **Status:** proposed

### S-06: Expenses — edit and delete

- **Outcome:** user can edit any field (amount, category, date) of a previously logged expense, or delete one outright.
- **Change ID:** expenses-edit-delete
- **PRD refs:** FR-010
- **Prerequisites:** S-05
- **Parallel with:** S-04, S-07
- **Blockers:** —
- **Unknowns:**
  - Soft-delete (set `deleted_at`) vs hard-delete? PRD FR-010 doesn't specify. — Owner: user. Block: no.
- **Risk:** Low — mutation flow on a single row.
- **Status:** proposed
- **Tech-debt follow-up:** Expense mutations currently use `POST /api/expenses/[id]` with an `intent` discriminator (`update`/`delete`) for progressive enhancement. A future refactor should split this into `PUT /api/expenses/[id]` (update) and `DELETE /api/expenses/[id]` (delete).

### S-07: Categories — edit and delete (with cascade-to-"other")

- **Outcome:** user can edit a category's name, type, or limit; deleting a category automatically reassigns its logged expenses to "other" so no expense history is lost.
- **Change ID:** categories-edit-delete
- **PRD refs:** FR-005, FR-006
- **Prerequisites:** S-02
- **Parallel with:** S-03, S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:**
  - On delete, show a confirmation dialog with "N expenses will be reassigned to 'other'", or run cascade silently? — Owner: designer. Block: no.
- **Risk:** Cascade correctness — silent reassignment must work atomically or the user loses expenses. DB-level FK `ON DELETE SET` (to "other") or a transactional `UPDATE`-then-`DELETE`; either way `/10x-plan` decides.
- **Status:** proposed

### S-08: UI visual refresh + UX improvements — modern, consistent, accessible

- **Outcome:** user can move through every shipped surface (sign-in, landing hub, Categories create/list, Log expense, Report) and experience a cohesive, modern, mobile-first visual system — clear typography hierarchy, consistent spacing and colour, polished cards/forms/tables, and reasonable accessibility (visible focus states, keyboard-navigable controls, sufficient contrast, semantic landmarks, labelled inputs) — **plus concrete user-experience improvements to the interaction flows**: persistent navigation (easy move-back and move-to-dashboard from every screen), a category-first two-step expense-logging flow, a focused category-creation flow (list → add → create screen → back to list), a branded application header (name + logo), a more glanceable dashboard, and a clearer yearly report. Same underlying data and rules — better-looking **and easier to use**, optimised for mobile.
- **Change ID:** ui-visual-refresh
- **PRD refs:** NFR §Mobile responsiveness, US-01 (10-second logging — the two-step flow must not regress it), PRD §Non-Goals (the "reasonable contrast + keyboard usability assumed" clause — this slice *delivers* that assumption without crossing into a formal WCAG-AA audit, which stays parked)
- **Type:** Cross-cutting (horizontal) — a **UX + visual** quality pass over surfaces already shipped by S-01–S-04. **No longer visual-only**: at the user's explicit request it now also reshapes interaction flows and information architecture (navigation, expense-logging steps, category-creation flow, dashboard layout). Allowed as a bounded enabler: it raises the visual/UX bar so later slices (S-05–S-07) inherit a finished design language and interaction patterns instead of each re-inventing them. Absorbs and supersedes the parked **"Signed-in hub styling polish"** item. See `context/changes/ui-visual-refresh/research.md` for the full audit + flow redesigns.
- **Prerequisites:** S-01, S-02, S-03, S-04 (the surfaces being refreshed must exist and be shipped — all are)
- **Parallel with:** S-05, S-06, S-07 — but sequencing it **before** them is preferable, so those slices build on the refreshed design tokens/components **and navigation/interaction patterns** rather than the old styling. If run after, expect a small re-style pass on whatever S-05–S-07 added.
- **Blockers:** —
- **Researcher/learner context:** the user is a **Java engineer with little React knowledge and no UI-framework background** — `/10x-plan` and `/10x-implement` must explain every UI concept, library, and pattern in plain terms (bridging from JVM where useful) and surface framework/IA decisions as explicit, explained questions rather than silent choices. (Recorded in `research.md` §Researcher context.)
- **Scope guardrails (to keep this from sprawling):**
  - Tailwind-utility-driven refresh against the existing `src/layouts/Layout.astro`; introduce a small set of shared design tokens / reusable presentational components only if duplication demands it. No new UI framework or component library unless `/10x-plan` justifies it (and explains it to the user).
  - Honour the runtime constraints: stay `.astro`-first; do not convert static pages to React islands "to look interactive" (CLAUDE.md §Runtime gotchas). New client JS only where a specific interaction (e.g. the two-step expense flow) requires it.
  - Accessibility target is **reasonable**, not certified: visible focus rings, logical tab order, labelled form controls, semantic headings/landmarks, AA-ish contrast. A formal WCAG-AA audit remains a PRD §Non-Goal (still parked).
  - **UX/IA changes are now in scope** (navigation pattern, expense two-step flow, category create flow, dashboard, yearly report) but each must preserve existing behaviour where not explicitly being redesigned, and must not touch API routes' contracts, queries' correctness, RLS, or the Warsaw-noon storage invariant beyond what a flow change strictly requires. `/10x-plan` must draw the line on how much IA change lands here vs a follow-up slice (open question below).
- **UX scope (requested by user, detailed in `research.md` follow-up):**
  1. **Navigation** — persistent back + move-to-dashboard from every screen (bottom nav bar candidate; removes the hub round-trip).
  2. **Expense logging** — category-first two-step flow: pick category, then a log panel with categories hidden.
  3. **Branded header** — application name + logo replacing the raw email Topbar.
  4. **Categories** — list + "Add category" button → focused create screen (list hidden) → back to list on success.
  5. **Dashboard** — improved, more glanceable layout (best-practice content home rather than a pure launcher).
  6. **Yearly report** — clearer, more scannable (e.g. progress bars, over-budget emphasis).
- **Unknowns:**
  - **How much IA/behaviour change belongs in S-08 vs a follow-up slice?** (bottom nav, `/categories/new` route, two-step expense flow, data-rich dashboard). — Owner: user / `/10x-plan`. Block: no (plan decides the line).
  - **Product name + logo** — what is the wordmark, and is there a logo asset/brief? — Owner: user. Block: branded header only.
  - Is there an existing brand/identity to anchor on (the roadmap references a "cosmic identity"), or does this slice define the design language from scratch? — Owner: user/designer. Block: no (default to codifying the existing cosmic direction).
  - Dark mode in scope for v1, or light-only? — Owner: user. Block: no (cosmic is already dark; tokenise so a toggle is a cheap follow-up).
  - How far to factor shared components (extract a `Card`/`Field`/`Table`/`PageLayout` vs. keep per-page utilities)? — Owner: `/10x-plan`. Block: no.
- **Risk:** Low on data correctness (no aggregation logic touched), but **higher than a pure visual pass** and **scope-creep-prone** — "make it beautiful and easier to use" has no natural stopping line, and the IA changes (navigation, two-step flow, new routes) carry real interaction risk. Mitigations: the guardrails above; a fixed per-surface checklist (typography, spacing, colour, focus, contrast, mobile breakpoint, tap-target size); the explicit IA-scope decision in `/10x-plan`; and the US-01 **10-second logging** budget as a hard regression guard on the two-step expense flow. Secondary risk: a visual/markup refactor can regress the mobile `sm:`/`lg:` responsiveness already in `Layout.astro` — verify each breakpoint after the pass. Also fix the mobile **viewport meta** bug (`initial-scale=1` missing) noted in research.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                               | Ready for `/10x-plan` | Notes                                                                                                     |
| ---------- | ---------------------- | --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| F-01       | data-layer-and-rls     | Foundation: domain data model + per-user RLS        | shipped               | Migration 20260528132105_create_budget_schema.sql; types in src/db/database.types.ts.                     |
| S-01       | signed-in-shell        | Signed-in shell + budget-tracker landing hub        | shipped               | Shipped to prod 2026-05-29. Hub styling rough — see Parked.                                               |
| S-02       | categories-create-list | Categories: create + list (incl. implicit "other")  | shipped               | Shipped to prod 2026-06-02. POST /api/categories, categories.astro, CategoryForm.tsx; "other" app-seeded. |
| S-03       | log-expense-from-phone | Log an expense from a phone (with "other" fallback) | shipped               | POST /api/expenses, expenses.astro, ExpenseForm.tsx; `expense_at` stored at Warsaw noon.                  |
| S-04       | per-category-report    | Per-category report (north-star slice)              | shipped               | `src/lib/report.ts` + `src/pages/report.astro`; north-star loop complete 2026-06-08.                        |
| S-05       | expenses-list          | Expenses list view                                  | ready                 | Prereq S-03 shipped — ready to plan.                                                                      |
| S-06       | expenses-edit-delete   | Expenses: edit + delete                             | no                    | Blocked by S-05.                                                                                          |
| S-07       | categories-edit-delete | Categories: edit + delete (cascade-to-"other")      | ready                 | Sole prereq S-02 shipped — ready to plan.                                                                 |
| S-08       | ui-visual-refresh      | UI visual refresh + UX improvements (modern, consistent, accessible)  | ready                 | Prereqs S-01–S-04 shipped — ready to plan. Cross-cutting UX + visual polish; supersedes parked "hub styling polish". Now includes navigation, two-step expense logging, category create flow, dashboard & yearly-report UX (see research.md). Prefer before S-05–S-07. |

## Open Roadmap Questions

1. **Unplanned-spending grouping (v1.1)** — exact shape of the v1.1 grouped-by-name report on the data MVP populates via FR-008 (group by which key? show top-N? threshold for recurrence?). Owner: user. Block: roadmap-wide (v1.1, not MVP).
2. **Visual distinction of the "other" category** — how should the designer communicate that "other" is a system-provided catch-all (colour, icon, position, non-editable affordance)? Owner: designer. Block: S-02 (visual only — assume default until resolved; no code gate).
3. **Burn-rate / pacing signal for irregular annual categories (v1.1)** — per-category pacing or only an overall year-pacing summary? Owner: user. Block: v1.1.
4. **Confidentiality at the wire** — HTTPS-only in transit. Resolved by platform choice (Cloudflare Workers; HTTPS by default). Owner: tech-stack-selector. Block: — (closed).
5. **Reconciliation of FR-008 with the v1 domain rule** — half-feature in v1 (logging into "other" without a grouped report) is the price for a complete v1.1 feature. Confirmed acceptable; re-review before MVP cutover. Owner: user. Block: MVP cutover.
6. **Auth strategy — confirm email/password (current) vs swap to OAuth (per shape-notes)** — FR-001 reads as "third-party identity provider", which Supabase email/password satisfies; shape-notes was more specific (OAuth via Google/GitHub). Owner: user. Block: S-01 only if the answer is "swap to OAuth" (would add work to S-01; otherwise no change).

## Parked

- **Native mobile app (iOS / Android binary)** — PRD §Non-Goals. Responsive web on mobile browsers is the MVP target.
- **Bank / financial-institution integration** — PRD §Non-Goals. Manual entry only. Load-bearing assumption that keeps the data layer simple.
- **Automatic expense categorisation (ML / rules)** — PRD §Non-Goals. User always picks the category at entry time.
- **Localisation beyond English UI** — PRD §Non-Goals + NFR. English-only for MVP.
- **Import / export of data (CSV / JSON / Excel migration)** — PRD §Non-Goals. Users start fresh in the app.
- **Account sharing / family or household accounts** — PRD §Non-Goals. Single named user.
- **WCAG-AA accessibility audit** — PRD §Non-Goals. Reasonable contrast + keyboard usability assumed; no formal compliance audit.
- **Push notifications / email reminders** — PRD §Non-Goals. Report is pull, not push.
- **Grouped-by-name surfacing of unplanned expenses (the original Phase-1 product insight)** — deferred to v1.1. FR-008 in MVP feeds the v1.1 dataset on day one.
- **Multi-year planning + year-switcher UI** — deferred to v1.1.
- **Multi-currency / FX conversion** — deferred to v1.1.
- **Burn-rate / pacing signal for irregular annual categories** — deferred to v1.1 (see Open Q #3).
- **Signed-in hub styling polish** — S-01 shipped functional but visually rough (tested on prod 2026-05-29). Refine the action-card visuals, spacing, and welcome header against the cosmic identity, and drop the redundant Topbar "Dashboard" link the user is already on. Cosmetic only — no behaviour change. Owner: user/designer. **Promoted into S-08 (ui-visual-refresh)** — track it there rather than as a standalone item.

## Done

- F-01 / data-layer-and-rls — shipped 2026-05-28. Migration 20260528132105_create_budget_schema.sql; types in src/db/database.types.ts.
- S-01 / signed-in-shell — shipped to prod 2026-05-29. Post-login redirect to `/dashboard`; middleware protects `/categories`, `/expenses`, `/report`; dashboard hub with three vertical action cards + sign-out. Styling polish deferred (see Parked).
- S-04 / per-category-report — shipped 2026-06-08. `src/lib/report.ts` (pure buildReport helper) + `src/pages/report.astro` (static server-rendered page); Monthly section (recurring: avg/limit/delta/burn%) + Yearly section (irregular: spent/limit/remaining/burn%, "other" last). North-star loop complete.

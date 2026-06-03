---
project: 10xmoney-tracker
version: 1
status: draft
created: 2026-05-27
updated: 2026-06-03
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
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------------------- | -------- |
| F-01 | data-layer-and-rls     | (foundation) categories + expenses tables + per-user RLS + generated TS types                                  | —                | NFR §Data isolation, FR-003, FR-007 | done     |
| S-01 | signed-in-shell        | sign in, sign out, and land on a hub linking to Categories / Log expense / Report                              | —                | FR-001, FR-002                      | done     |
| S-02 | categories-create-list | create a category and see all categories listed (including implicit "other")                                   | F-01, S-01       | FR-003, FR-004                      | done     |
| S-03 | log-expense-from-phone | log an expense (amount + category + date) from a phone, with "other" as fallback                               | F-01, S-01, S-02 | FR-007, FR-008                      | proposed |
| S-04 | per-category-report    | view per-category remaining for the current year (avg monthly spend for recurring, single value for irregular) | F-01, S-02, S-03 | FR-011, US-01                       | proposed |
| S-05 | expenses-list          | view the list of previously logged expenses                                                                    | S-03             | FR-009                              | proposed |
| S-06 | expenses-edit-delete   | edit or delete a previously logged expense                                                                     | S-05             | FR-010                              | proposed |
| S-07 | categories-edit-delete | edit a category and delete one with cascade-to-"other" reassignment of expenses                                | S-02             | FR-005, FR-006                      | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                  | Chain                             | Note                                                                                                |
| ------ | ---------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| A      | Auth & shell           | `S-01`                            | Independent of data; can run in parallel with F-01 in a separate evening session.                   |
| B      | Path to the north star | `F-01` → `S-02` → `S-03` → `S-04` | Critical path. `main_goal: learn` puts the most novel tech (RLS, period attribution) on this chain. |
| C      | Expenses lifecycle     | `S-05` → `S-06`                   | Post-north-star hardening; joins Stream B at `S-03` (consumes the expenses table).                  |
| D      | Categories lifecycle   | `S-07`                            | Post-north-star hardening; joins Stream B at `S-02`. Exercises cascade-to-"other" semantics.        |

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
- **Status:** proposed

### S-04: Per-category report — remaining for the current year (NORTH STAR)

- **Outcome:** user can view, per category, the amount remaining for the current calendar year (1 Jan – 31 Dec), alongside a spend metric whose shape follows the category's type — an **average monthly spend** for recurring monthly categories, and a **single cumulative spent** value for irregular annual categories.
- **Change ID:** per-category-report
- **PRD refs:** FR-011, US-01, Business Logic §Period attribution, §Plan-relative roll-up, §Calendar-year boundary
- **Prerequisites:** F-01, S-02, S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - How does the report row visually communicate "average monthly spend" vs "single cumulative spent" so the user doesn't have to translate the metric mentally? — Owner: designer. Block: no.
  - Default category ordering — alphabetical, by spend, by % of limit? — Owner: user. Block: no.
- **Risk:** The PRD's Business Logic central rule lives here. Period attribution + plan-relative roll-up + calendar-year boundary correctness is the single load-bearing thing this slice ships. Get it wrong and the report lies about plan vs actuals — which invalidates the whole product premise.
- **Status:** proposed

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

## Backlog Handoff

| Roadmap ID | Change ID              | Suggested issue title                               | Ready for `/10x-plan` | Notes                                                                                                     |
| ---------- | ---------------------- | --------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------- |
| F-01       | data-layer-and-rls     | Foundation: domain data model + per-user RLS        | shipped               | Migration 20260528132105_create_budget_schema.sql; types in src/db/database.types.ts.                     |
| S-01       | signed-in-shell        | Signed-in shell + budget-tracker landing hub        | shipped               | Shipped to prod 2026-05-29. Hub styling rough — see Parked.                                               |
| S-02       | categories-create-list | Categories: create + list (incl. implicit "other")  | shipped               | Shipped to prod 2026-06-02. POST /api/categories, categories.astro, CategoryForm.tsx; "other" app-seeded. |
| S-03       | log-expense-from-phone | Log an expense from a phone (with "other" fallback) | ready                 | Prereqs F-01, S-01, S-02 all shipped — ready to plan.                                                     |
| S-04       | per-category-report    | Per-category report (north-star slice)              | no                    | Blocked by F-01, S-02, S-03. Promote first once Prereqs ship.                                             |
| S-05       | expenses-list          | Expenses list view                                  | no                    | Blocked by S-03.                                                                                          |
| S-06       | expenses-edit-delete   | Expenses: edit + delete                             | no                    | Blocked by S-05.                                                                                          |
| S-07       | categories-edit-delete | Categories: edit + delete (cascade-to-"other")      | ready                 | Sole prereq S-02 shipped — ready to plan.                                                                 |

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
- **Signed-in hub styling polish** — S-01 shipped functional but visually rough (tested on prod 2026-05-29). Refine the action-card visuals, spacing, and welcome header against the cosmic identity, and drop the redundant Topbar "Dashboard" link the user is already on. Cosmetic only — no behaviour change. Owner: user/designer. Open via `/10x-new` when picked up.

## Done

- F-01 / data-layer-and-rls — shipped 2026-05-28. Migration 20260528132105_create_budget_schema.sql; types in src/db/database.types.ts.
- S-01 / signed-in-shell — shipped to prod 2026-05-29. Post-login redirect to `/dashboard`; middleware protects `/categories`, `/expenses`, `/report`; dashboard hub with three vertical action cards + sign-out. Styling polish deferred (see Parked).

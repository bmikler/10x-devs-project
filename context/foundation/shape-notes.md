---
project: 10xmoney-tracker
context_type: greenfield
updated: 2026-05-21
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 11
  quality_check_status: accepted
product_type: web-app
target_scale:
  users: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# 10xmoney-tracker — shape notes

Seed idea source: `idea-notes.md`. The notes are detailed enough that several phases will move quickly — but each phase still produces a real decision, captured by the user, not invented here.

## Vision & Problem Statement

Planning a personal annual budget and logging expenses against it is currently
handled in Excel — one sheet for the plan, one sheet per month. Three things
make this painful:

1. **Mobile expense entry is awful.** Logging an expense from a phone in a shop
   means tapping cells in a spreadsheet. The friction is high enough that
   expenses get skipped or batched at the end of the day, which erodes the
   fidelity of the annual plan.
2. **The year is not a first-class object.** Excel models months; the annual
   view is just a sum. Rebuilding the plan every January is pure busywork.
3. **Mid-year category changes touch every monthly tab.** Adding a new category
   in July requires manually editing twelve sheets — so changes get deferred
   and the plan drifts from reality.

The product replaces the spreadsheet with something purpose-built around three
insights:

- **Mobile-first fast capture.** Logging an expense from a phone should take
  seconds, not a struggle with a spreadsheet grid.
- **The year is the planning unit.** A category, once added, applies to the
  whole year automatically — no per-month duplication.
- **Recurring vs irregular budgets are different things.** Monthly-regenerating
  budgets (e.g. groceries 1500 PLN/month) and one-time annual pots (e.g.
  vacation 2000 PLN/year) are modelled distinctly, with appropriate rollup.

There is also a fourth, elevated insight that became a core domain rule
(see `## Business Logic`): the product actively surfaces *unplanned* spending
patterns — recurring expenses logged under "other" that the user didn't budget
for. The point is not just to track spend against a plan, but to reveal where
the plan is wrong.

## User & Persona

**Single named user** — the product is built for one person (the author), who
already actively budgets and logs personal expenses against an annual plan, and
has hit the friction wall of Excel-on-phone. Auth exists so the app can live
on the public internet without exposing personal financial data; it is not
because there are multiple unrelated users in scope for MVP.

- **Role**: solo personal-finance user
- **Existing behaviour**: maintains annual budget + monthly logs in Excel today
- **Trigger moments**:
  - Standing in a shop, needs to log an expense → reaches for phone
  - Mid-year, realises a category is missing or wrong → needs to update once
  - Late-month review: "did I overshoot? by how much?"
  - End-of-year planning: "what did last year actually cost me, and how should
    next year's plan look?"

## Access Control

- **Authentication**: OAuth via a third-party identity provider (e.g. Google,
  GitHub). The user signs in with an existing account; the application never
  stores a password. Specific provider choice is a downstream stack decision.
- **Role model**: **Flat** — one role, one signed-in user. The signed-in user
  can do everything; there is no admin / viewer / editor distinction.
- **Data isolation**: All data records are scoped to the signed-in user's
  identity. A user can only read and modify their own budget, categories, and
  expenses — never any other account's data. This applies even though the MVP
  has effectively a single user; the isolation is structural so the data layer
  is not coupled to the "just me" assumption.
- **Out of scope for MVP**: account sharing, family/household accounts,
  read-only sharing of reports, role-based access control, audit logging,
  account recovery flows beyond what the OAuth provider supplies.

## Success Criteria

### Primary

The user can complete this end-to-end loop unassisted, within an evening of
setup plus one shop visit:

1. Sign in via OAuth.
2. Define an annual budget by creating a small number of categories (each with
   a type — recurring monthly or irregular annual — and a spending limit).
3. From a phone, log a real expense against one of those categories.
4. Open the report and see, for that category, how much has been spent and how
   much remains for the current period (month for recurring, year for irregular).

If every step works without dropping out to Excel or another tool, the MVP has
proven its core thesis: the product is a viable replacement for the existing
spreadsheet workflow.

### Secondary

**Mobile expense entry under 10 seconds** — measured from tapping the app icon
on a phone (cold start, already signed in) to seeing confirmation that the
expense is saved. This signal is what separates the product from "Excel with a
nicer form": the phone-in-shop scenario has to feel fast.

### Guardrails

- **Data isolation** — a signed-in user must only ever read or modify their own
  data. This is structural, not policy: the data layer enforces ownership on
  every query and write. Even with a single user in MVP, a leak here would
  destroy trust if the product ever gains a second user.
- **Mobile usability** — every action on the primary loop (sign in, add an
  expense, view a category's status) must be usable one-handed on a phone.
  This is a non-negotiable consequence of the product's reason to exist; if
  any step requires a desktop or two hands, the MVP has failed at its core
  promise.

### Timeline

- **MVP budget**: ~3 weeks of after-hours work (`mvp_weeks: 3` in frontmatter).
- The scope of the primary loop was deliberately cut to fit this budget. Items
  pushed to v1.1 / v2 are listed in `## Non-Goals`.

## Functional Requirements

### Authentication

- FR-001: User can sign in via an OAuth identity provider. Priority: must-have
  > Socrates: Counter-argument considered: "OAuth is overkill for one user —
  > it adds an external dependency you could avoid with passwordless or local
  > auth." Resolution: kept. Not handling passwords ourselves outweighs the
  > provider-dependency cost; a single bug in a hand-rolled auth flow is worse
  > than a rare provider outage.

- FR-002: User can sign out and return to a signed-out state. Priority: must-have
  > Socrates: Counter-argument considered: "Sign-out is friction with no
  > benefit on a single-user phone — staying signed in is what you want."
  > Resolution: kept. Trivial to ship and table stakes for any web app; the
  > absence would look unfinished. The user can ignore the button if not used.

### Budget planning

- FR-003: User can create a category with a name, a type (recurring monthly or
          irregular annual), and a spending limit. Priority: must-have
  > Socrates: Counter-argument considered: "The recurring/irregular type
  > distinction is conceptual overhead that could be deferred." Resolution:
  > kept. The type distinction is load-bearing — it drives the report's
  > period semantics (monthly reset vs annual cumulative) and was identified
  > in Phase 1 as one of the three core product insights. Dropping it would
  > gut the product.

- FR-004: User can view the list of their categories. The implicit "other"
          category appears in the list alongside user-defined categories.
          Priority: must-have
  > Socrates: Counter-argument considered: "Visually distinguishing 'other'
  > is UX detail leaking into an FR." Resolution: FR reworded — the
  > visual-cue requirement is removed from this FR and routed to
  > ## Open Questions for the designer to resolve.

- FR-005: User can edit a category's name, type, or limit after creation.
          Priority: must-have
  > Socrates: Counter-argument considered: "Deleting a category orphans its
  > expenses" (covered jointly with FR-006). Resolution: kept; edit on its
  > own does not orphan data. The deletion semantics are clarified in FR-006.

- FR-006: User can delete a category. Any expenses previously logged against
          the deleted category are automatically reassigned to the implicit
          "other" category so no expense history is lost. Priority: must-have
  > Socrates: Counter-argument considered: "Deleting a category orphans
  > existing expenses logged against it." Resolution: FR updated to specify
  > cascade-to-other semantics. The user does not lose history; reassigned
  > expenses surface under "other" in the next report view.

### Expense logging

- FR-007: User can log an expense by entering an amount and selecting one of
          their categories. The date field defaults to today; the user can
          change it if logging a past expense. Priority: must-have
  > Socrates: Counter-argument considered: "This is just 'amount + category +
  > save' which Excel-on-phone almost matches." Resolution: kept as written.
  > Phase 1 elevated mobile-fast capture as the product's reason to exist;
  > this FR is the one that delivers it. The 10-second target lives in
  > Success Criteria as the secondary signal.

- FR-008: User can log an expense without picking a category — the expense is
          recorded under the implicit "other" category. Priority: must-have
  > Socrates: Counter-argument considered: "Without a grouped-by-name report,
  > 'other' is just a trash can — ship both or neither." Resolution: kept.
  > Logging into "other" in MVP populates the dataset that the v1.1 grouped
  > report will consume. Without FR-008 in MVP, v1.1's report would have no
  > prior data to work with on the day it ships. The half-feature in v1 is
  > the price for a complete feature in v1.1.

- FR-009: User can view a list of their previously logged expenses.
          Priority: must-have
  > Socrates: Counter-argument considered: "Could be deferred — MVP only
  > needs aggregate report." Resolution: kept. Without the list view, the
  > user cannot find a specific expense to edit (FR-010) or visually verify
  > recent entries. It is the necessary substrate for the edit/delete flow.

- FR-010: User can edit or delete a previously logged expense.
          Priority: must-have
  > Socrates: Counter-argument considered: "Edit/delete enables fraud against
  > oneself — silent rewriting of history weakens budgeting discipline."
  > Resolution: kept. Typos and wrong-category mistakes are inevitable on a
  > fast-capture flow; without edit/delete, every mistake permanently
  > corrupts the report. Self-discipline is a personal concern, not a
  > product-enforcement concern.

### Reporting

- FR-011: User can view, per category, the amount spent and the amount remaining
          for the current period — current month for recurring monthly
          categories, current year for irregular annual categories. All sums
          are bounded to the current calendar year (1 Jan – 31 Dec); values
          from prior or future years are never included. Priority: must-have
  > Socrates: Counter-argument considered: "'Remaining' for an irregular
  > annual category at month 3 hides pacing — burn-rate would be more useful."
  > Resolution: kept as written for MVP. Burn-rate and projected-total are
  > real product-value adds but additive; pushed to v1.1. Recorded in
  > ## Open Questions.

## User Stories

### US-01: Log an expense from a phone and see updated category status

```
Given I am signed in and have at least one category defined,
When I open the app on my phone, enter an expense amount, pick a category,
  and tap save (the date field is already today by default),
Then the expense is saved within a couple of seconds, and the report shows
  updated "spent" and "remaining" values for that category, bounded to the
  current calendar year.
```

## Business Logic

**The application treats the annual budget plan as the authoritative source of
truth for what the user intends to spend; every logged expense is automatically
attributed to a category and to the rule-appropriate budgeting period, and
reports always show the live delta between plan and actuals — never raw totals
divorced from intent.**

Inputs the rule consumes:

- An **annual plan**: a set of categories, each with a name, a budgeting type
  (`recurring monthly` or `irregular annual`), and a spending limit appropriate
  to that type.
- A stream of **logged expenses**: each with an amount, a date, and either an
  explicit category or the implicit "other" category.

What the application decides (and the user does not have to):

1. **Period attribution**. Each expense is attributed to a period derived from
   its category's type — the month containing the expense date for recurring
   monthly categories, the year containing the expense date for irregular
   annual categories. The user never picks a period themselves; the period
   follows from the type.
2. **Plan-relative roll-up**. Within a category, the application sums the
   attributed expenses for the current period and subtracts from the category's
   limit. The visible number is always *plan-relative* — "spent X of Y, with Z
   remaining" — never a bare total.
3. **Calendar-year boundary**. All summation is bounded to the current calendar
   year (1 Jan – 31 Dec). Expenses from prior or future years never contribute
   to the current view, even for irregular annual categories. This is an
   intentional simplification: the plan is the year's plan, not a rolling
   window.

How the user encounters the rule in the product flow:

- When the user logs an expense, they do not select a period — they only select
  a category. The period is derived automatically from the category's type.
- When the user opens the report, they see one row per category, each showing
  spent + remaining for the period that matters for that category — without
  having to mentally translate "this is a monthly category, so this number is
  for May".

## Non-Functional Requirements

- **Mobile responsiveness**: every primary-loop interaction (sign in, add an
  expense, view categories, view the report) remains usable and visually intact
  across phone screen widths from approximately 320 px upward, in modern mobile
  browsers. No horizontal scroll on the primary loop; tap targets sized for a
  thumb.
- **User-perceived response < 2 seconds**: the visible result of any data
  action — saving an expense, opening the report, listing categories — appears
  within 2 seconds on a typical mobile connection. Slower than this and the
  product fails its "better than Excel-on-phone" promise.
- **Data durability**: once a save operation returns success to the user, the
  expense is persisted. No best-effort writes that can vanish on refresh or on
  network failure between the success indication and the next page load.
- **Language**: the MVP user interface is English-only. Localisation is out of
  scope and not modelled in the data layer.

## Quality cross-check

All six gating elements present at finish:

- Access Control: present
- Business Logic (one-sentence rule + supporting paragraphs): present
- Project artifacts: present
- Timeline-cost: present (mvp_weeks=3, within the recommended 3-week timebox)
- Non-Goals: present (8 explicit non-goals + 4 items deferred to v1.1)
- Preserved behavior: n/a (greenfield)

Status: `accepted` — no gaps recorded.

## Open Questions

These are concerns raised during shaping that are NOT resolved at the PRD level
— either because they are downstream-of-stack-selection, or because they are
genuine open questions the user has deferred. `/10x-prd` will surface these
in the PRD's `## Open Questions` section.

- **Unplanned-spending grouping (v1.1)**: Phase 1 elevated grouped-by-name
  uncategorised-expense detection as a core product insight. MVP scope deferred
  the grouped report itself but kept logging-into-"other" (FR-008) so that
  the v1.1 grouped report has populated data on day one. Open: exact shape of
  the v1.1 report (group by which key? show top-N? threshold for recurrence?).
- **Visual distinction of the "other" category**: FR-004 originally specified
  that "other" be visually distinguished in the categories list. The visual
  mechanism was de-scoped from the FR as UX detail. Open: how should the
  designer communicate that "other" is a system-provided catch-all (color,
  icon, position, non-editable affordance)?
- **Burn-rate / pacing signal for irregular annual categories (v1.1)**: At
  month 3 of a 2000-PLN annual budget, "1800 remaining" doesn't communicate
  whether the user is pacing well. A burn-rate or projected-total view would.
  Deferred to v1.1; open whether to add per-category pacing or only an overall
  year-pacing summary.
- **Confidentiality at the wire**: Financial data should be HTTPS-only in
  transit. Not lifted to an explicit NFR because HTTPS is assumed baseline at
  stack-selection time, but flag if the chosen hosting / framework somehow
  makes this non-trivial.
- **Reconciliation of FR-008 with the v1 domain rule**: Logging into "other"
  is in MVP but the grouped-by-name surfacing report is not. The product ships
  with a half-feature in v1 — escape hatch without insight — that becomes a
  full feature in v1.1. Confirmed acceptable trade-off (see FR-008 Socrates
  blockquote), but worth a re-review before MVP cutover.

## Non-Goals

The MVP explicitly does NOT do these. Each is a real possibility someone might
ask for; pinning them here prevents silent scope creep.

- **Native mobile app (iOS / Android binary)** — the product is a responsive
  web app accessed from a mobile browser. Native is a separate build pipeline,
  app-store distribution, and platform-specific UI; out of scope.
- **Bank / financial-institution integration** — no Open Banking, no
  transaction import, no CSV import from a bank export, no scraping. All
  expenses are entered manually. This is the load-bearing assumption that
  keeps the data layer simple.
- **Automatic expense categorisation** — no ML model, no rules engine, no
  "suggest a category based on name or amount". The user always picks the
  category at entry time (or leaves it as "other").
- **Localisation beyond English UI** — the interface is English-only. No
  multi-language toggle, no locale-aware date or number formatting beyond
  reasonable defaults. Captured as an NFR too; pinned here as scope.
- **Import / export of data** — no CSV import, no JSON export, no
  spreadsheet-to-app migration tool. Users start fresh in the app.
- **Account sharing / family or household accounts** — the persona is a single
  named user. No shared budgets, no partner-view, no household roll-up.
- **WCAG-AA accessibility audit** — reasonable contrast and keyboard usability
  expected, but formal accessibility compliance is not a goal. Solo personal
  use does not justify the effort.
- **Push notifications / email reminders** — no "you've exceeded category X"
  alerts, no monthly recap email. The user opens the app on their own
  schedule; the report is pull, not push.

The following are NOT non-goals but ARE deferred from MVP (recorded in
`## Open Questions` and treated as v1.1+):

- Grouped-by-name surfacing of unplanned expenses (the original Phase-1 core
  insight; logging into "other" is in MVP, the GROUPED REPORT is v1.1).
- Multi-year planning and year-switcher UI.
- Multi-currency / FX conversion.
- Burn-rate / pacing signal for irregular annual categories.

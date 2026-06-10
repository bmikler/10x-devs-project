# Expenses — Edit and Delete — Plan Brief

> Full plan: `context/changes/expenses-edit-delete/plan.md`

## What & Why

Roadmap slice **S-06 (FR-010)** — let a signed-in user edit any field (amount, category, name, date) of a previously logged expense, or delete it outright. S-05 deliberately built the monthly-report rows as "the per-expense rows S-06 will later hook into"; this change makes those rows actionable.

## Starting Point

Expenses are listed in exactly one place — the monthly report island (`MonthlyReport.tsx`), as collapsible, **non-interactive** rows. The create flow (`ExpenseForm.tsx` → `POST /api/expenses`) is a native-form, server-redirect, no-JS-fetch pattern. There is no by-id mutation endpoint, no edit page, and validation is inline (no zod). RLS already permits owner `UPDATE`/`DELETE` on the `expenses` table.

## Desired End State

From `/report/monthly`, every expanded expense row shows an **Edit** link and a **Delete** control. Edit opens `/expenses/[id]/edit` — the familiar create form, prefilled — and saving returns the user to the monthly report with a success banner. Delete asks for inline confirmation; confirming permanently removes the row and returns with a success banner. Bad edits bounce back to the edit page with an error; a bogus id shows a friendly "not found".

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where edit/delete live | Hook into existing monthly-report rows | Reuses the only place expenses are listed — exactly what S-05 enabled; zero new list surface | Plan |
| Edit surface | Dedicated `/expenses/[id]/edit` reusing the create form | Mirrors the proven create flow; minimal new UI | Plan |
| Delete model | Hard delete | No schema/migration, no `deleted_at` filter to thread everywhere; matches "low-risk single-row mutation" | Plan |
| Delete safety | Explicit confirmation step | Guards irreversible deletes; PRD flagged self-rewriting-history as a concern | Plan |
| Mutation transport | Native POST forms now, REST later | Keeps the no-JS progressive-enhancement convention; REST refactor tracked in roadmap | Plan |
| API shape | One `POST /api/expenses/[id]`, `intent` discriminates update vs delete | Concentrates auth/validation in one place; the seam the REST refactor later splits | Plan |
| Return destination | Back to `/report/monthly` with a banner | Closes the loop where the user started managing the expense | Plan |

## Scope

**In scope:** `POST /api/expenses/[id]` (update + delete); shared expense-write helper module; mode-aware `ExpenseForm`; `/expenses/[id]/edit` page; Edit/Delete-with-confirm controls on monthly-report rows; result banner on `/report/monthly`; roadmap REST follow-up note.

**Out of scope:** soft delete / restore UI; flat `/expenses/list` page; inline or modal editing; true REST PUT/DELETE now; client-side fetch / optimistic UI; multi-year handling; schema/migration changes; undo banner.

## Architecture / Approach

A new `POST /api/expenses/[id]` route self-authenticates (it sits outside the middleware's protected prefixes) and branches on a hidden `intent` field — `delete` does a hard `DELETE`, otherwise it validates (same rules as create) and `UPDATE`s. The Warsaw-date + validation helpers currently locked in the create route are extracted to `src/lib/expense-write.ts` so update and create share one source of truth. `ExpenseForm` gains backward-compatible `action`/`initial`/`submitLabel` props so it serves both create and edit. The monthly-report island adds an Edit link and a confirm-then-POST delete form per row; the monthly page renders a success/error banner from query params. RLS remains the ownership backstop.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared helpers + mutation API | `POST /api/expenses/[id]` (update+delete) + extracted helpers | Update must reuse `warsawNoon`/future-date guard or `expense_at` drifts from the create convention |
| 2. Edit page + form generalization | Mode-aware `ExpenseForm` + prefilled `/expenses/[id]/edit` | Generalizing the form must not regress the shipped create page |
| 3. Wire affordances + roadmap note | Edit/Delete-with-confirm on rows + result banner + REST note | First interactivity in the report island; confirm flow must prevent accidental hard deletes |

**Prerequisites:** S-05 shipped (monthly report + expense rows). Phases 1 and 2 are independent; Phase 3 needs both.
**Estimated effort:** ~1–2 sessions across 3 small phases (all patterns already exist in the codebase).

## Open Risks & Assumptions

- **Assumption:** an expense's existing category is always a current-year category (single-year MVP), so it always appears in the edit dropdown. Revisit if multi-year lands.
- **Assumption:** a no-op update/delete on a non-owned id (RLS yields zero rows) is treated consistently rather than surfaced as a hard error.
- **Risk:** adding interactivity to the report island — the delete confirm state and native delete form must coexist with the existing collapse/expand state without regressions.
- **Tech debt (tracked):** POST-form transport with an `intent` discriminator is deliberate; a roadmap note records the future move to PUT/DELETE.

## Success Criteria (Summary)

- From the monthly report, the user can edit any field of an expense and see the change reflected in both the monthly and yearly views.
- The user can delete an expense only after confirming, and it disappears from both views.
- Invalid edits show an error and change nothing; `npm run build` and `npm run lint` pass.

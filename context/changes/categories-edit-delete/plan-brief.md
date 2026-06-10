# Categories Edit & Delete — Plan Brief

> Full plan: `context/changes/categories-edit-delete/plan.md`

## What & Why

Users can create budget categories but can't fix a typo, adjust a limit, or remove a category they no longer want. This adds **inline edit and delete** to the `/categories` page. The database was already built for this (cascade + protection triggers exist), so it's an API + UI change only.

## Starting Point

`/categories` today is **list + create only**: a static `.astro` list of the user's categories plus a `client:load` create form that native-form-`POST`s to `/api/categories`. There is no `/api/categories/[id]` route, no interactive list, and — across the whole app — no client-side `fetch`, no toast library, and no modal/dialog component. The mutation convention is native form `POST` → redirect, errors via `?error=` + `ServerError`.

## Desired End State

Each **user** category row shows Edit and Delete. Edit expands the row into an inline form pre-filled with name/type/limit; saving persists the change. Delete swaps the row into a "Delete «name»? Its expenses will move to other." confirm; confirming removes the category and the DB reassigns its expenses to the system `other` category — no data lost. The `other` row stays read-only.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Edit surface | Inline expand on the list | Keeps the single-screen mobile feel and reuses the existing form island. | Plan |
| Delete confirm | Two-step inline confirm | App has no modal component; inline avoids net-new overlay infra and states the cascade clearly. | Plan |
| Mutation routing | `POST` to action paths (`/[id]`, `/[id]/delete`) | Matches the existing native-form + `?error=` + redirect convention; no fetch needed. | Plan |
| Rename collisions | Validate + friendly error (mirror create) | Same UX and messages as create, including the `23505`→duplicate mapping. | Plan |
| Editable fields | Name, type, and limit | DB permits all three on user rows; matches the create form 1:1 for reuse. | Plan |
| List interactivity | One `CategoryList` island | Single mount owning per-row state; cleanest "one row open at a time" logic. | Plan |
| Delete warning | Always state the consequence | Honest about expense reassignment with zero extra queries. | Plan |

## Scope

**In scope:** update + delete API routes; parameterizing `CategoryForm` for edit; a `CategoryList` island with inline edit/confirm states; wiring `categories.astro`.

**Out of scope:** any DB migration; editing/deleting the system `other` row; client-side fetch / toasts / modals; per-category expense counts; bulk/undo/cross-year operations; changes to expenses or reports.

## Architecture / Approach

Backend first. Two `POST` routes (`/api/categories/[id]` update, `/api/categories/[id]/delete`) mirror the create route's auth → validate → mutate → redirect shape and guard the system row with a friendly error before the DB trigger does. Then the static list becomes a `CategoryList` React island holding per-row mode (idle / editing / confirming); the editing row reuses a parameterized `CategoryForm`, the confirming row posts a hidden delete form.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Mutation API routes | Update + delete endpoints, fully testable via raw form posts | Surfacing system-row/collision errors as friendly text, not raw trigger exceptions |
| 2. Interactive category list | Inline edit + two-step delete UI; `other` read-only | Moving list rendering from `.astro` into an island without create-flow regression |

**Prerequisites:** none — DB and create flow already in place.
**Estimated effort:** ~1 session across 2 phases.

## Open Risks & Assumptions

- Assumes the existing cascade/protection triggers behave as read (verified in the migration); the app guards are defense-in-depth on top.
- Moving the list into a `client:load` island adds client JS where there was none — acceptable for the interactivity, and the row count is small.

## Success Criteria (Summary)

- A user can rename, retype, and re-limit a category, and the change persists.
- Deleting a category removes it while its expenses survive under `other`.
- The system `other` row is never editable or deletable from the UI, and duplicate/reserved renames show friendly errors.

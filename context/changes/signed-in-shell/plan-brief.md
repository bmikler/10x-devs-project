# Signed-in Shell and Budget-Tracker Landing Hub — Plan Brief

> Full plan: `context/changes/signed-in-shell/plan.md`

## What & Why

Build the budget-tracker landing hub — the first thing a signed-in user sees. The current dashboard is a stub (email + sign-out). This slice transforms it into a navigation hub linking to the three primary flows (Categories, Log expense, Report), fixes the post-login redirect so users land there immediately, and pre-protects future routes in middleware.

## Starting Point

Auth is fully wired (sign-in/up/out endpoints, middleware, `Astro.locals.user`). The dashboard at `/dashboard` exists but is just a centered card showing the user's email and a sign-out button. Post-login redirect goes to `/` (public landing), not the dashboard. Only `/dashboard` is protected in middleware.

## Desired End State

A signed-in user is redirected to `/dashboard` immediately after sign-in and sees a mobile-first hub with three large, thumb-tappable action cards (Categories, Log expense, Report). All future budget-tracker routes (`/categories`, `/expenses`, `/report`) are pre-protected behind auth. The hub is usable one-handed on a phone.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Hub layout | Vertical action cards | Large tap targets optimised for one-handed phone use, matching the PRD's mobile-first mandate. |
| Dashboard reuse | Repurpose `/dashboard` | No new routes needed; middleware already protects it; avoids redirect plumbing. |
| Post-login redirect | Redirect to `/dashboard` | User lands on the actionable hub immediately — zero wasted taps. |
| Route protection | Pre-register future routes | One middleware change covers S-02 through S-07; future slices don't touch middleware. |

## Scope

**In scope:**
- Fix sign-in redirect from `/` to `/dashboard`
- Expand middleware `PROTECTED_ROUTES` to cover `/categories`, `/expenses`, `/report`
- Replace dashboard stub with hub layout (welcome header, three action cards, sign-out)
- Include Topbar on the hub page

**Out of scope:**
- Building Categories / Log expense / Report pages (S-02, S-03, S-04)
- Fetching or displaying budget data
- OAuth (staying with email/password)
- New React islands (hub is static `.astro`)

## Architecture / Approach

Pure server-rendered Astro page — no client-side JS needed. The dashboard page imports `Layout` and `Topbar`, reads `user` from `Astro.locals`, and renders three linked cards. The sign-in endpoint's redirect target changes from `/` to `/dashboard`. Middleware adds three route prefixes to the existing `startsWith` matching.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Post-login redirect & route protection | Users land on hub after sign-in; future routes pre-protected | None — two single-line changes |
| 2. Dashboard hub page | Visual hub with action cards and Topbar | Cards might not feel tappable enough on small screens |
| 3. Smoke-test the full loop | End-to-end verification on desktop and mobile | None — verification only |

**Prerequisites:** Auth flows working (already shipped in baseline).
**Estimated effort:** ~1 short session (1 phase of plumbing + 1 phase of UI).

## Open Risks & Assumptions

- Action card links point to pages that don't exist yet (expected 404s behind auth until S-02/S-03/S-04 ship)
- Assumes email/password auth is sufficient for S-01 (per roadmap Open Q #6)

## Success Criteria (Summary)

- User signs in and lands directly on the hub at `/dashboard`
- Hub shows three action cards usable one-handed on a phone (375px viewport)
- All budget-tracker routes redirect to sign-in when unauthenticated

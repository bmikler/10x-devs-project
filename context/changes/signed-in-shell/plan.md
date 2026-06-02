# Signed-in Shell and Budget-Tracker Landing Hub — Implementation Plan

## Overview

Transform the existing dashboard stub into a budget-tracker hub that a signed-in user lands on immediately after sign-in. The hub presents three vertical action cards linking to the primary budget-tracker flows (Categories, Log expense, Report). Fix the post-login redirect so users go straight to the hub, and pre-register future budget-tracker routes in middleware protection.

## Current State Analysis

- **Auth is fully wired**: sign-in/up/out endpoints work; middleware protects `/dashboard`; `Astro.locals.user` carries auth state.
- **Dashboard is a stub**: `src/pages/dashboard.astro` shows email + sign-out button in a centered card. No navigation, no links to budget features.
- **Post-login redirect is wrong**: `src/pages/api/auth/signin.ts:19` redirects to `/` (public landing) after successful sign-in. The user must manually navigate to `/dashboard`.
- **Only `/dashboard` is protected**: middleware `PROTECTED_ROUTES` array at `src/middleware.ts:3` contains only `"/dashboard"`. Future budget pages will need protection.
- **Topbar has a "Dashboard" link** when signed in (`src/components/Topbar.astro:14`), but the hub doesn't include the Topbar itself.
- **Cosmic visual identity** is established: `bg-cosmic` gradient, `border-white/10 bg-white/10 backdrop-blur-xl` card pattern, purple/blue gradient text.

### Key Discoveries:

- Middleware uses `pathname.startsWith(route)` matching (`src/middleware.ts:19`), so adding `"/categories"`, `"/expenses"`, `"/report"` will cover all sub-routes automatically.
- The `Topbar.astro` component already handles both signed-in and signed-out states — reusable on the hub page.
- The `Layout.astro` component is minimal (head + Banner + slot) — pages control their own body structure.

## Desired End State

After this plan is complete:

1. A user who signs in is redirected to `/dashboard` — the budget-tracker hub.
2. The hub page shows a welcome greeting (user email), three large action cards (Categories, Log expense, Report) in a vertical stack, and a sign-out button. Each card links to its future route (pages don't exist yet — that's fine, they're behind auth).
3. The Topbar is visible on the hub page, providing consistent navigation.
4. Middleware protects `/dashboard`, `/categories`, `/expenses`, and `/report` — future slices don't need to touch middleware.
5. The hub is usable one-handed on a phone (large tap targets, vertical layout, no horizontal scroll).

**Verification**: Sign in → land on hub → see three action cards → tap each (expect 404 for now, behind auth) → sign out → redirected to `/` → try `/dashboard` directly → redirected to `/auth/signin`.

## What We're NOT Doing

- Building the Categories, Log expense, or Report pages (those are S-02, S-03, S-04).
- Fetching or displaying any budget data.
- Changing the landing page (`/`) or auth pages.
- Adding OAuth (staying with email/password per roadmap Open Q #6).
- Creating new React islands — the hub is static navigation, no client-side interactivity needed.

## Implementation Approach

Two-phase approach: (1) fix the plumbing (redirect + route protection), then (2) build the UI (dashboard hub). This order means the hub is testable end-to-end from sign-in as soon as Phase 2 lands.

## Phase 1: Post-login redirect and route protection

### Overview

Fix the sign-in redirect target and extend middleware to protect future budget-tracker routes.

### Changes Required:

#### 1. Fix sign-in redirect

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Change the success redirect from `/` to `/dashboard` so users land on the hub after sign-in.

**Contract**: Line 19 — change `return context.redirect("/");` to `return context.redirect("/dashboard");`.

#### 2. Extend protected routes

**File**: `src/middleware.ts`

**Intent**: Add `/categories`, `/expenses`, and `/report` to the `PROTECTED_ROUTES` array so all budget-tracker routes are behind auth from day one.

**Contract**: Line 3 — expand the `PROTECTED_ROUTES` array to include `"/dashboard"`, `"/categories"`, `"/expenses"`, `"/report"`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Sign in → redirected to `/dashboard` (not `/`)
- Visit `/categories` while signed out → redirected to `/auth/signin`
- Visit `/expenses` while signed out → redirected to `/auth/signin`
- Visit `/report` while signed out → redirected to `/auth/signin`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard hub page

### Overview

Replace the dashboard stub with a hub layout containing a welcome header, three vertical action cards (Categories, Log expense, Report), and a sign-out button. Include the Topbar for consistent navigation.

### Changes Required:

#### 1. Rewrite dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the stub content with a hub layout. Include the Topbar at the top. Below it, show a welcome greeting with the user's email, then three large vertical action cards linking to `/categories`, `/expenses`, and `/report`. Each card should have an icon (emoji or text), a title, and a one-line description. At the bottom, a sign-out form. Follow the existing cosmic visual identity (`bg-cosmic`, `border-white/10 bg-white/10 backdrop-blur-xl` card pattern, gradient text).

**Contract**: The page imports `Layout` and `Topbar`. It reads `user` from `Astro.locals`. The three cards link to:

- `/categories` — "Categories" — manage your budget categories
- `/expenses` — "Log expense" — record a new expense
- `/report` — "Report" — view spending vs plan

Cards must be large enough for comfortable one-handed phone tapping (min-height ~80px, full-width on mobile). The layout uses a single-column stack with `max-w-md mx-auto` centering, consistent with the existing auth page pattern.

#### 2. Update Topbar link

**File**: `src/components/Topbar.astro`

**Intent**: When the user is signed in and already on the dashboard, the Topbar's "Dashboard" link is redundant. No functional change needed — the link still works (it just reloads the page). Leave as-is for now; this is a cosmetic concern for a later polish pass.

**Contract**: No change to Topbar in this phase.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification:

- Dashboard shows welcome greeting with user email
- Three action cards visible in vertical stack
- Each card links to the correct route
- Cards are large enough for comfortable thumb tapping on a phone-width viewport (~375px)
- No horizontal scroll on mobile viewports down to 320px
- Sign-out button works (redirects to `/`)
- Topbar displays correctly at the top of the hub

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Smoke-test the full loop

### Overview

End-to-end manual verification of the complete sign-in → hub → sign-out flow on both desktop and mobile viewports.

### Changes Required:

No code changes. This phase is purely verification.

### Success Criteria:

#### Manual Verification:

- Full loop on desktop: sign in → land on hub → see three cards → click each (expect 404, behind auth) → sign out → back to `/`
- Full loop on mobile viewport (375px): same flow, one-handed usability confirmed
- Unauthenticated access to `/dashboard`, `/categories`, `/expenses`, `/report` all redirect to `/auth/signin`
- Sign-out from hub redirects to `/` (public landing)

**Implementation Note**: This is a manual-only verification phase. Confirm all criteria pass before marking the change as complete.

---

## Testing Strategy

### Manual Testing Steps:

1. Open the app in a browser, sign in with test credentials
2. Verify redirect lands on `/dashboard` (not `/`)
3. Verify the hub shows welcome greeting, three action cards, sign-out button
4. Tap each action card — expect 404 (pages don't exist yet), but verify the URL is correct and behind auth
5. Use browser DevTools to simulate mobile viewport (375px width)
6. Verify cards stack vertically, no horizontal scroll, tap targets are comfortable
7. Sign out — verify redirect to `/`
8. Try accessing `/dashboard` directly — verify redirect to `/auth/signin`
9. Try accessing `/categories`, `/expenses`, `/report` — verify all redirect to `/auth/signin`

## References

- Roadmap: S-01 in `context/foundation/roadmap.md`
- PRD: FR-001, FR-002 in `context/foundation/prd.md`
- Existing auth: `src/pages/api/auth/signin.ts`, `src/middleware.ts`
- Dashboard stub: `src/pages/dashboard.astro`
- Topbar: `src/components/Topbar.astro`
- Visual patterns: `src/styles/global.css` (cosmic theme)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Post-login redirect and route protection

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 5ac2685
- [x] 1.2 Build succeeds: `npm run build` — 5ac2685

#### Manual

- [x] 1.3 Sign in → redirected to `/dashboard`
- [x] 1.4 Unauthenticated `/categories` → redirected to `/auth/signin`
- [x] 1.5 Unauthenticated `/expenses` → redirected to `/auth/signin`
- [x] 1.6 Unauthenticated `/report` → redirected to `/auth/signin`

### Phase 2: Dashboard hub page

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — dd8c08f
- [x] 2.2 Build succeeds: `npm run build` — dd8c08f

#### Manual

- [x] 2.3 Dashboard shows welcome greeting with user email
- [x] 2.4 Three action cards visible in vertical stack
- [x] 2.5 Cards are thumb-tappable on mobile (375px)
- [x] 2.6 No horizontal scroll on 320px viewport
- [x] 2.7 Sign-out button works

### Phase 3: Smoke-test the full loop

#### Manual

- [x] 3.1 Full sign-in → hub → sign-out loop on desktop
- [x] 3.2 Full loop on mobile viewport (375px), one-handed usability
- [x] 3.3 All protected routes redirect when unauthenticated

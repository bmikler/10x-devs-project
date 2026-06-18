---
date: 2026-06-18T00:00:00+02:00
researcher: bartlomiej.mikler
git_commit: 9f4130257e613a8cc5c9824bb491216be90a016b
branch: master
repository: 10x-devs
topic: "Data-isolation & auth-boundary integration (test-plan Phase 2, Risks #1 + #5)"
tags: [research, codebase, rls, auth, supabase, middleware, integration-tests, vitest]
status: complete
last_updated: 2026-06-18
last_updated_by: bartlomiej.mikler
last_updated_note: "Resolved the four Open Questions empirically (Vitest probe, live-web verification, key sourcing, seeding route)."
---

# Research: Data-isolation & auth-boundary integration (Phase 2)

**Date**: 2026-06-18T00:00:00+02:00
**Researcher**: bartlomiej.mikler
**Git Commit**: 9f4130257e613a8cc5c9824bb491216be90a016b
**Branch**: master
**Repository**: 10x-devs

## Research Question

Ground test-plan Phase 2 (`context/foundation/test-plan.md` §3 row 2). Two risks to verify
with integration tests:

- **Risk #1** — a signed-in user reads or modifies *another user's* categories/expenses
  (ownership not enforced on a read/write path).
- **Risk #5** — an *unauthenticated* request reaches a gated page or API endpoint
  (middleware/guard gap).

The §2 Risk-Response guidance asks research to ground: *where ownership is actually
enforced (RLS policy vs endpoint code)*, *the Supabase client/session shape*, *how a second
user's identity is simulated*, *which route patterns middleware actually matches*, and *any
per-endpoint auth checks*. Scope agreed with user: code grounding **plus** integration-harness
selection; focus on Risk #1/#5 surfaces only (Phase 3's cascade/validation paths out of scope).

## Summary

**Ownership is enforced by RLS, not by app code.** Both user-scoped tables (`categories`,
`expenses`) have RLS **enabled** with a single `FOR ALL TO authenticated` policy carrying
**both** `USING (auth.uid() = user_id)` and `WITH CHECK (auth.uid() = user_id)`. No endpoint
adds a `.eq('user_id', ...)` filter — app-code lookups exist only to produce friendly errors.
This means **a test must let real RLS run** (over-mocking the DB defeats the entire test) and
must **assert on DB state, not HTTP status**, because cross-user UPDATE/DELETE are *silent
no-ops* under RLS (0 rows affected, endpoint still redirects as "success").

**The auth boundary is enforced per-endpoint, not by middleware.** `src/middleware.ts` only
guards four *page* prefixes (`/dashboard`, `/categories`, `/expenses`, `/report`) via
`startsWith`. **It does not match `/api/*` at all** — every API endpoint compensates with its
own `if (!locals.user)` check. Both layers respond to an unauthenticated request with a **302
redirect to `/auth/signin`**, never a 401/403. Integration tests should assert `302 +
Location: /auth/signin`, not `401`.

**Harness recommendation (cost × signal):** for Risk #1, **Vitest + `@supabase/supabase-js`
against local Supabase with two real users** — zero new packages, stays on `environment:
"node"`, and *dodges a known Astro-v6 + Cloudflare + Vitest incompatibility* because it never
imports app code. For Risk #5, a thin guard test that calls each endpoint's handler with
`locals.user = null` (mocking the `astro:*` virtual modules) and asserts the 302. Do **not**
adopt Astro's `getViteConfig()` — it breaks under the Cloudflare adapter. Full page-level
redirect fidelity, if ever needed, belongs to a later Playwright/e2e lesson.

## Detailed Findings

### A. Ownership enforcement (Risk #1)

**Schema & RLS** — `supabase/migrations/20260528132105_create_budget_schema.sql` (the only migration):

- Two user-scoped tables. `categories` (`:9-30`) and `expenses` (`:36-50`), each with
  `user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE` (`:11`, `:38`).
- RLS **enabled** on both (`:56-57`).
- Policies (`:59-67`), both `FOR ALL TO authenticated`:
  - `categories_owner_all` and `expenses_owner_all`, each `USING (auth.uid() = user_id)`
    **and** `WITH CHECK (auth.uid() = user_id)`.
  - `USING` filters reads and gates which rows a write can touch; `WITH CHECK` blocks an
    insert/update whose post-image carries someone else's `user_id`. **No read/write gap** —
    both clauses present.
- **FK note:** `expenses.category_id REFERENCES public.categories(id)` (`:39`) is **not** a
  composite `(category_id, user_id)` FK, so the DB alone does not stop an expense pointing at
  another user's category. Protection here is RLS + the app's category lookup → worth an
  explicit test (insert expense referencing user B's category id → expect "Invalid or
  inaccessible category").
- Triggers (relevant but Phase 3 territory): `fn_cascade_to_other` +
  `categories_cascade_other_before_delete` (`:73-102`); `fn_protect_system_category` +
  `categories_protect_system_before_update` (`:108-126`).

**Endpoint code — relies on RLS, never filters by `user_id`:**

- `src/pages/api/categories/index.ts` — POST create; client `:12`, auth guard `:17-20`,
  insert sets `user_id: user.id` (`:47`). Insert safety = `WITH CHECK`.
- `src/pages/api/categories/[id].ts` — POST update; existence check selects
  `.eq("id", id).eq("year", year)` (`:48-53`) — **no `user_id`** → RLS `USING` hides other
  users' rows so `maybeSingle()` returns nothing → "Category not found" (`:55-57`); update
  `.eq("id", id)` only (`:62-65`).
- `src/pages/api/categories/[id]/delete.ts` — same pattern: select `.eq("id",id).eq("year",year)`
  (`:27-32`), delete `.eq("id", id)` (`:41`).
- `src/pages/api/expenses/index.ts` — POST create; category lookup
  `.eq("id",categoryId).eq("year",year).single()` (`:34-39`), comment at `:31-32` states "RLS
  enforces isolation, but an explicit lookup gives a user-friendly error"; insert `:47-53`.
- `src/pages/api/expenses/[id].ts` — **thinnest path.** Delete branch `.delete().eq("id", id)`
  with **no existence check, no `user_id` filter** (`:21-27`); update branch lookup + `.update().eq("id", id)`
  (`:41-56`). Only RLS `USING` protects user B's row → silent 0-row no-op.

**Supabase client / session shape** — `src/lib/supabase.ts`:

- Single factory `createClient(requestHeaders, cookies)` (`:6`) using `createServerClient<Database>`
  from `@supabase/ssr` (`:1`,`:10`). Anon key from `astro:env/server` (`SUPABASE_URL`,
  `SUPABASE_KEY`; declared secret+optional in `astro.config.mjs:25-26`).
- Cookies feed the client: `getAll()` parses the request `Cookie` header (`:12-17`); `setAll()`
  writes refreshed auth cookies back (`:18-23`). Per-request, **carries the logged-in user's
  JWT** → `auth.uid()` resolves to the caller → RLS keys off the real user.
- **No service-role / admin client anywhere in the app.** No RLS-bypassing path exists in
  production code (a test will need to create its own service-role client from the local key).

**How identity flows to `auth.uid()`:** request cookies → `src/middleware.ts:7` builds the
client → `:10-13` `auth.getUser()` → `context.locals.user`. Each endpoint rebuilds its own
client from the same cookies. The cookie/JWT is the **sole** source of identity — there is no
header or body field that overrides it. To act "as user B" a test sends B's auth cookies (or
constructs a per-user client signed in as B).

### B. Auth boundary (Risk #5)

**Middleware** — `src/middleware.ts` (full file 1-25):

- `PROTECTED_ROUTES = ["/dashboard","/categories","/expenses","/report"]` (`:4`); guard is
  `PROTECTED_ROUTES.some(r => pathname.startsWith(r))` (`:18`).
- Auth: builds client (`:7`), `auth.getUser()` (`:10-12`), sets `locals.user = user ?? null`
  (`:13`); `null` if Supabase unconfigured (`:15`). Type `App.Locals.user: User | null`
  (`src/env.d.ts:1-3`). **No `locals.session`, only `user`.**
- Unauthenticated → gated route: `context.redirect("/auth/signin")` (`:20`) = **HTTP 302**.
  Same for pages and (if they matched) API — **no `/api/*` branch**.
- **Gap (a): the matcher MISSES all API routes.** `/api/categories/*` and `/api/expenses/*`
  do not start with any protected prefix → middleware does **not** guard the data endpoints.

**Per-endpoint guards (compensate for gap a):**

| Endpoint | Own `locals.user` check | On missing user |
|---|---|---|
| `api/categories/index.ts` | `:17-20` | redirect `/auth/signin` (302) |
| `api/categories/[id].ts` | `:17-20` | redirect `/auth/signin` |
| `api/categories/[id]/delete.ts` | `:15-18` | redirect `/auth/signin` |
| `api/expenses/index.ts` | `:16-19` | redirect `/auth/signin` |
| `api/expenses/[id].ts` | `:13-15` | redirect `/auth/signin` |
| `api/auth/{signin,signup,signout}.ts` | none (public) | n/a |

- All five data endpoints are **POST-only** (a GET yields 405, not data).
- **Finding (b): unauthenticated `/api/*` returns a 302 redirect, never 401/403.** Assert
  `status 302` + `Location: /auth/signin`.
- **Finding (c): no endpoint blindly trusts middleware** — each re-checks `locals.user`. Good.

**Session establishment / cookies** (matters for how a test obtains a session):

- `src/lib/supabase.ts:10-24` — `@supabase/ssr`, cookies via `parseCookieHeader`; **cookie
  names not hardcoded** (standard `sb-<ref>-auth-token`, possibly chunked) — let the library
  set them, don't forge by name.
- Sign-in `src/pages/api/auth/signin.ts:13` `signInWithPassword` → cookies set → redirect
  `/dashboard` (`:19`). Callback `src/pages/auth/callback.ts:10` `exchangeCodeForSession`.
  Sign-out `src/pages/api/auth/signout.ts:6-9` `signOut()` → redirect `/`.
- Test path to a real session: POST form-encoded `email`/`password` to `/api/auth/signin`,
  capture `Set-Cookie`, replay on later requests. Missing-session case: send no cookies.

**Gated pages (all middleware-guarded by prefix; none have inline redirects):**
`/dashboard`, `/categories`(+`/new`,`/[id]/edit`), `/expenses`(+`/[id]/edit`), `/report`.
Each destructures `Astro.locals.user` and null-guards its query (`if (supabase && user)`), but
the redirect is solely the middleware's job. `astro.config.mjs:11` `output: "server"` (full
SSR, no prerender). **No page-route gap found.** Public: `/`, `/auth/{signin,signup,confirm-email,callback}`.

### C. Integration harness options

**Repo signals (verified):**

- `supabase/config.toml:128` `[auth] enabled = true`; **`:166` `enable_confirmations = false`**
  → locally created users are usable immediately, no email step. Ports API `54321` / DB `54322`
  / Studio `54323`.
- `[db.seed] enabled = true` points at `./seed.sql` (`:65-71`) — **but no `supabase/seed.sql`
  exists.** Tests must create their own data; don't rely on a seed.
- `package.json`: `test`=`vitest run`, Vitest `^3.2.4`; `@supabase/supabase-js ^2.99.1` and
  `@supabase/ssr ^0.10.3` already deps (**no new package needed for the RLS suite**); `wrangler
  ^4.90.0` present but no `wrangler dev` script.
- `vitest.config.ts`: `environment: "node"`, `@`→`./src` alias, **does NOT use Astro's
  `getViteConfig()`** → `astro:*` virtual modules are not resolvable today.
- `astro.config.mjs`: `output:"server"`, `adapter: cloudflare()`, env via `astro:env`.
- `.github/workflows/ci.yml`: `npm ci → astro sync → lint → npm run test → build`. **The
  `test` step runs with no Supabase service** — fine for Phase 1 unit math, but Phase 2 DB
  tests need `supabase start` (or Postgres + `supabase db reset`) wired in, or split into a
  separate lane so the fast unit gate stays DB-free.

**Options compared:**

- **(A) Vitest + `@supabase/supabase-js` vs local Supabase (two real JWTs).** Drive the DB
  directly with two per-user clients; assert RLS denies cross-user read/write. *Pros:* zero new
  deps, no `astro:*` problem (never imports app code), proves the real migration policy at the
  cheapest layer, CI-able. *Cons:* does not execute endpoint/middleware code (proves the DB
  isolates, not that endpoints pass the right JWT); does not cover Risk #5. **Best for Risk #1.**
- **(B) Vitest invoking Astro route handlers in-process.** `import { POST }` and call with a
  mock `APIContext`/`locals`, backed by real local Supabase. *Pros:* exercises endpoint + RLS;
  can assert the `if (!locals.user)` 302 branch (Risk #5). *Cons / big risk:* importing an
  endpoint transitively pulls `astro:env/server` (and middleware pulls `astro:middleware`).
  Resolving those needs `getViteConfig()`, which on **Astro v6 + `@astrojs/cloudflare`
  currently breaks** (Cloudflare Vite plugin rejects the SSR `resolve.external` Astro injects —
  see Open Questions). Workaround: `vi.mock("astro:env/server")` + `vi.mock("astro:middleware")`,
  stay `environment:"node"`, synthesize `APIContext` — fragile but workable for a thin guard test.
- **(C) `wrangler dev`/`astro dev` + real HTTP.** Highest fidelity; only option that proves the
  page-level redirect end-to-end. *Cons:* heaviest, flakiest, real-cookie orchestration — e2e
  territory (Playwright), reserved for a later lesson. **Avoid for Phase 2.**

**Minting two users + state reset (recipe):**

1. Service-role client (RLS bypass) from the local service key, init with
   `auth: { persistSession: false, autoRefreshToken: false }` (avoids the documented
   service-client-adopts-user-session bug).
2. `serviceClient.auth.admin.createUser({ email, password, email_confirm: true })` for user A
   and user B — immediate sign-in because `enable_confirmations = false`.
3. Per-user clients: separate `createClient(URL, ANON_KEY, { auth: { persistSession: false } })`
   each, then `signInWithPassword`. Separate instances so `auth.uid()` is correct and storage
   isn't shared; `persistSession:false` lets you stay on `environment:"node"`.
4. Assertions (Risk #1): A inserts a row (allowed by `WITH CHECK`); B's `.select()` returns 0
   rows for A's data; B's `update`/`delete`/`insert` targeting A is denied/no-op.
5. Reset: scope data to the two ephemeral users and `auth.admin.deleteUser(id)` in `afterAll`
   — `ON DELETE CASCADE` wipes their rows. Use unique emails per run. `supabase db reset` is
   the hard reset but slow.

**Gotchas:** service client must be `persistSession:false`; no seed file exists; staying
node + `persistSession:false` avoids the jsdom localStorage session-sharing issue;
`auth.admin.createUser` does **not** run the app's signup side-effects, so the per-year
`is_system` "other" category is **not** auto-seeded — a test that inserts an *expense* must
first create a category via the user's own client (the app seeds "other" in the
category-create route, not on signup).

## Code References

- `supabase/migrations/20260528132105_create_budget_schema.sql:56-67` — RLS enabled + the two `FOR ALL … USING … WITH CHECK` policies (the real Risk #1 boundary)
- `supabase/migrations/20260528132105_create_budget_schema.sql:39` — `expenses.category_id` FK is not composite with `user_id`
- `src/lib/supabase.ts:6-24` — per-request `createServerClient` carrying the user's JWT; cookie get/set; anon key (no service-role client)
- `src/middleware.ts:4,18,20` — `PROTECTED_ROUTES` page-prefix matcher; 302 redirect; **no `/api/*` coverage**
- `src/pages/api/expenses/[id].ts:21-27` — delete with no existence check, RLS-only (thinnest isolation path)
- `src/pages/api/categories/[id].ts:48-65` — update path: lookup without `user_id`, relies on RLS to return "not found"
- `src/pages/api/expenses/index.ts:31-42` — explicit category lookup documented as friendly-error-only, RLS does isolation
- `src/pages/api/auth/signin.ts:13-19` — `signInWithPassword` → cookies → redirect (how a test mints a session)
- `supabase/config.toml:128,166` — local auth enabled, email confirmations off
- `vitest.config.ts` — `environment:"node"`, `@` alias, no `getViteConfig()`
- `.github/workflows/ci.yml` — `npm run test` runs with no DB service today

## Architecture Insights

- **RLS is the single source of truth for ownership.** App code intentionally adds no
  `user_id` filter; lookups exist only for friendly errors. Corollary: the highest-value test
  asserts the *database* denies cross-user access even when app code would forward a forged id.
  A test that mocks the DB away tests nothing real (the §2 #1 anti-pattern).
- **Silent no-op semantics.** Cross-user UPDATE/DELETE affect 0 rows and the endpoint still
  redirects "successfully." Tests must assert post-state in the DB (row unchanged / still
  present), never the HTTP status — directly the §2 #1 "assert side-effects, not status" rule.
- **Auth boundary lives in two places, asymmetrically.** Pages → middleware redirect; APIs →
  per-endpoint guard (middleware doesn't see `/api/*`). Both emit 302→`/auth/signin`, not 401.
  This shapes the Risk #5 assertion and confirms §2 #5's "middleware covers every route" is the
  exact wrong assumption here.
- **Layer-split principle** (`context/foundation/lessons.md:17-19`): data-loss invariants in DB
  triggers, UX convenience in app — consistent with RLS-as-boundary.
- **Runtime constraint drives the harness choice.** The Cloudflare adapter + Astro v6 makes
  Astro-aware Vitest (`getViteConfig()`) currently break, which is the decisive reason to keep
  the Risk #1 suite off the Astro module graph (Option A) and to use plain `vi.mock` for the
  thin Risk #5 guard test rather than booting Astro.

## Historical Context (from prior changes)

- `context/foundation/lessons.md:5-7` — canonical RLS shape decision: `FOR ALL TO authenticated`
  with both `USING` and `WITH CHECK`; "`WITH CHECK` is what blocks an authenticated user from
  inserting rows with someone else's `user_id`."
- `context/foundation/lessons.md:17-19` — layer-split principle (data-loss in DB, UX in app).
- `context/changes/data-layer-and-rls/plan.md:44-49` — "other" category seeded by **app code**
  (S-02 route), not a trigger; the cascade trigger's `RAISE EXCEPTION` is the fail-fast backstop.
- `context/changes/data-layer-and-rls/plan.md:318-335` — original **manual** RLS verification
  intent: "Spawn a second auth user … query categories as them — confirm no rows from the first
  user are visible." Phase 2 automates exactly this.
- `context/changes/signed-in-shell/plan.md:54-60` — post-login redirect changed `/`→`/dashboard`.
- `context/changes/categories-create-list/plan.md:186-189` — prior baseline: "No test runner is
  configured … verification is `npm run build` + `npm run lint` + manual checks." (Superseded by
  the Phase 1 Vitest bootstrap.)
- `context/foundation/prd.md:301-315` — Data isolation guardrail: "A user can only read and
  modify their own budget, categories, and expenses — never any other account's data … the
  isolation is structural." FR-001/FR-002 (sign-in/out); FR-006 cascade-to-"other".

## Related Research

- `context/changes/testing-report-math/research.md` — Phase 1 (Risks #2/#3) research, sibling
  rollout phase; established the Vitest runner and `@/*` alias this phase builds on.

## Open Questions — Resolved (follow-up 2026-06-18)

All four were dug into and answered; carried here as settled facts for the plan.

1. **Astro v6 + Cloudflare + Vitest — RESOLVED EMPIRICALLY (positive).** A throwaway probe
   (`src/pages/api/_probe.test.ts`, since deleted) ran `vi.mock("astro:env/server", () => ({
   SUPABASE_URL, SUPABASE_KEY }))` then `await import("@/pages/api/categories/index")` and called
   `POST` with `locals.user = null`. It **passed** under the *current* plain `vitest.config.ts`
   (Vitest 3.2.6, `environment:"node"`, **no `getViteConfig()`**) and correctly returned `302 →
   /auth/signin`. So the Risk #5 endpoint-guard test is feasible **in-process today** with zero
   new config. The endpoint's only runtime virtual is `astro:env/server` (pulled via
   `@/lib/supabase`); the `astro` import is type-only and erased. The web caveat (that `vi.mock`
   needs the resolver to already know a virtual specifier) did **not** bite — Vitest's hoisted
   factory mock intercepted the bare import. Decision stands: **do NOT adopt `getViteConfig()`** —
   verified open issue withastro/astro#15878 (recurrence of the closed #15310) confirms it still
   breaks under `@astrojs/cloudflare`. Correction to first-pass research: the cited #12723 is a
   *separate* TS-typing bug, not the Cloudflare issue; the real anchors are **#15310 (closed) +
   #15878 (open)**.
2. **CI lane — RESOLVED (decision for the plan).** `.github/workflows/ci.yml:21` runs `npm run
   test` *before* build, with **no Supabase service and no env** (env is only on the build step,
   `:23-25`). Keep the unit lane DB-free: add a **separate** script (e.g. `test:integration`) for
   the live-Supabase suite. Phase 4 then wires `supabase start` + that script as the integration
   gate without touching the existing green unit floor. Do **not** fold DB tests into `npm run test`.
3. **Local key sourcing — RESOLVED.** `.dev.vars` (gitignored, Cloudflare convention) already
   holds `SUPABASE_URL=http://127.0.0.1:54321` and `SUPABASE_KEY=sb_publishable_…` (the local
   anon/publishable key); `.env.example` documents both. The **service-role key is in no committed
   file** — obtain it from `supabase status` (e.g. `supabase status -o env`) locally and in CI. A
   test helper reads URL + anon key from env/`.dev.vars` and the service-role key from `supabase status`.
4. **"other" seeding in tests — RESOLVED.** `src/pages/api/categories/index.ts:59-71` seeds the
   per-(user,year) system "other" row via an idempotent `upsert(…, {onConflict:"user_id,year,name",
   ignoreDuplicates:true})` **after** the first user-category insert — i.e. seeding happens only
   through the create-category *route*, never on signup and never on a direct client `.insert`.
   `auth.admin.createUser` yields a user with **zero** categories. So a Risk #1 test creates
   category rows directly via each user's own client (RLS `WITH CHECK` permits `user_id =
   auth.uid()`); an expense-insert needs a category to exist first (`expenses/index.ts:34-39`
   lookup). "other" only matters for Phase 3 cascade tests, not here.

## Decisions for the plan

- **Isolation boundary — DECIDED (user, 2026-06-18): keep RLS as the structural boundary; test
  it for real.** An app-level-auth-only alternative (add `.eq("user_id", …)` checks and unit-test
  them with a mocked client, skipping RLS tests) was considered and **rejected**: a mocked-client
  test asserts the code *called* a filter, not that isolation *holds* — exactly the §2 Risk #1
  anti-pattern ("over-mocking the DB so the RLS policy never actually runs"), and RLS remains the
  real gate per `lessons.md` + PRD ("isolation is structural"). No endpoint code changes in this
  phase. Concretely Phase 2 is:
  - **Risk #5 (auth boundary):** cheap, DB-free, in-process handler tests. Proven feasible —
    `vi.mock("astro:env/server")` + `await import(endpoint)` + `locals.user = null` → assert
    `302 → /auth/signin`. Runs under the current `vitest.config.ts`, no `getViteConfig()`.
  - **Risk #1 (data isolation):** real-RLS integration test against local Supabase, two users
    minted via service-role `auth.admin.createUser({email_confirm:true})` + per-user
    `signInWithPassword`; assert cross-user read/write is denied **by inspecting DB state**, not
    HTTP status. Lives in a **separate `test:integration` lane** so the existing unit gate stays
    DB-free; Phase 4 wires `supabase start` + that lane as the integration gate.

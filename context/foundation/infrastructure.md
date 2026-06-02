---
project: 10xmoney-tracker
researched_at: 2026-05-25
recommended_platform: cloudflare-workers
runner_up: vercel
context_type: mvp
tech_stack:
  language: typescript
  framework: astro-6-ssr-react-19
  runtime: cloudflare-workers
  database: supabase-postgres
---

## Recommendation

**Deploy on Cloudflare Workers.**

The starter ships with `@astrojs/cloudflare` v13 already wired, `wrangler` v4 in
devDependencies, and `wrangler.jsonc` configured with `nodejs_compat` and a
post-2024-09-23 `compatibility_date` — the prerequisites for both Astro SSR on
Workers and Hyperdrive-fronted Supabase Postgres. Free-tier headroom (100k
requests/**day**) covers the MVP's expected traffic by an order of magnitude,
the deploy loop is one CLI command, and the platform has no commercial-use
clause to constrain a personal-finance app that will live on the public
internet. The five-criteria scoring puts Cloudflare at 5/5 Pass; the head-to-head
against Vercel surfaced two tilt-points specific to this PRD (private
preview URLs by default; edge-by-default removes the "what region?" question)
that broke the tie in Cloudflare's favour.

## Platform Comparison

| Platform               | CLI-first | Managed/Serverless               | Agent docs            | Stable deploy API | MCP / Integration     | Free-tier cost @ MVP traffic    |
| ---------------------- | --------- | -------------------------------- | --------------------- | ----------------- | --------------------- | ------------------------------- |
| **Cloudflare Workers** | Pass      | Pass                             | Pass                  | Pass              | Pass                  | $0 (100k req/day free)          |
| Vercel                 | Pass      | Pass                             | Pass                  | Pass              | Partial (MCP beta)    | $0 (Hobby; non-commercial only) |
| Netlify                | Pass      | Pass                             | Partial (no llms.txt) | Pass              | Pass                  | $0–$9                           |
| Render                 | Pass      | Pass                             | Pass                  | Pass              | Pass                  | $7/mo (free tier sleeps 15 min) |
| Railway                | Pass      | Pass                             | Pass                  | Pass              | Pass                  | $5/mo (no free always-on)       |
| Fly.io                 | Pass      | Partial (Docker, region pinning) | Pass                  | Pass              | Partial (MCP preview) | ~$3–5/mo (no free tier)         |

### Shortlisted platforms

#### 1. Cloudflare Workers (Recommended)

Five of five criteria Pass. `wrangler` 4 ships deterministic deploy, `wrangler
rollback` switches to any prior version instantly, `wrangler tail` streams
logs (remember Wrangler 4 defaults to `--local`; pass `--remote` for live
production). Docs are published as markdown with `Accept: text/markdown` and as
`llms.txt`/`llms-full.txt` — agents can load the actual reference. ~16
production MCP servers (docs, bindings, builds, observability) cover the
agent-driven ops surface. Hyperdrive solves Postgres-from-edge cleanly:
included on free tier at 100k queries/day, in front of Supabase's **direct**
(not pooler) connection string. The deploy preview is per-version and not a
guessable public URL — meaningful for a personal-finance app.

The cost of admission: `@astrojs/cloudflare` v13 introduces a dual env-access
pattern (build-time vars on `import.meta.env`, runtime bindings on
`Astro.locals.runtime.env`); a 3 MB gzipped bundle ceiling on the free plan
(10 MB on $5/mo Paid Standard); a 10 ms CPU-time-per-request limit on free
(network waits don't count); and a faster adapter release cadence than a
solo evening-only dev can casually track.

#### 2. Vercel (Runner-up)

Four Pass, one Partial (MCP still beta after 8+ months). Strongest
agent-readable docs surface (every page available as `.md` plus
`llms-full.txt`). Hobby free tier covers MVP traffic. Real concerns: Hobby is
**non-commercial only** — even a future "buy me a coffee" link risks the
project being paused; preview deployment URLs are **public by default**
(Deployment Protection is Pro-only); single fixed region on Hobby; Hobby
rollback only goes to the immediately previous deployment; and the current
Supabase Supavisor pooler + Fluid Compute connection-growth issue
(Supabase discussion #40671, unresolved as of 2026-05) is a real
operational risk to monitor.

#### 3. Netlify

Four Pass, one Partial (markdown but no advertised `llms.txt`). Official
Netlify MCP server (`@netlify/mcp`) is production-quality, the new
`netlify logs` CLI command went GA on 2026-05-01. Astro 6 supported via
`@astrojs/netlify` v7. Free tier (300 credits/mo) fits ~10k req; ~100k req
likely pushes to Personal ($9/mo). Cold-start latency on sparse SSR traffic
runs 800 ms–1.5 s — crowds the PRD's <2 s response budget for the
phone-in-shop scenario. Free tier is locked to us-east-2.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **`@astrojs/cloudflare` v13 is freshly cut.** The latest minor was ~3 days
   old at research time and v13 introduced a non-trivial entrypoint change
   (`setPrerenderer()` exercising workerd at build time). A solo dev hitting
   an adapter regression has no escalation path beyond GitHub. Pin the
   version.
2. **Two parallel env-access patterns in the same codebase.** Public
   build-time secrets live on `import.meta.env`; runtime Workers bindings
   live on `Astro.locals.runtime.env`. `astro:env` does not yet cover
   Cloudflare bindings. Read one, write the other, and the bug surfaces at
   runtime as an opaque `undefined`.
3. **3 MB gzipped bundle on free, 10 MB on Paid Standard.** Astro 6 SSR +
   React 19 + Tailwind 4 + Supabase + a Postgres client fits today; every
   additional server-side dep (PDF gen, image processing, anything
   ML-adjacent) chips at the ceiling. The first time you hit it the error is
   at deploy time and the fix is route restructuring.
4. **Hyperdrive is one more moving piece to configure correctly.** Forget
   `nodejs_compat`, forget the post-2024-09-23 compatibility date, point at
   Supabase's pooler instead of the direct connection — each fails
   differently and the diagnostic is post-deploy logs, not a build error.
5. **10 ms CPU per request on free.** Most SSR rendering fits because network
   waits don't count, but any synchronous server-side computation (a complex
   report aggregation done in TypeScript instead of pushed to SQL) silently
   approaches the limit under contention. The failure mode is 1101 errors,
   not graceful degradation.

### Pre-Mortem — How This Could Fail

It's late 2026. The MVP shipped on Cloudflare Workers as planned. Six months
later the budget tracker still works but nothing has shipped on top of it.
Why: the v1.1 "grouped unplanned-spend report" was supposed to be a few SQL
aggregations rendered server-side. The solo author wrote them in TypeScript
inside an Astro server route — the way they would have on any Node platform —
and the report page started intermittently 1101'ing (CPU limit exceeded) under
real data. They moved the aggregation to SQL, which fixed the CPU issue but
the page now hits four serialised Hyperdrive queries and feels slow. Meanwhile,
a second `@astrojs/cloudflare` minor introduced a breaking change to
`Astro.locals.runtime.env` shape, the deploy quietly succeeded, the runtime
started returning undefined for one Supabase env var, and writes silently
failed for an evening before the user noticed. The pattern: edge-runtime
constraints make "the obvious next feature" subtly expensive, and the
platform's pace of change is faster than a solo evening-only dev can track.

### Unknown Unknowns

- **`@astrojs/cloudflare` is now a _Workers_ adapter, not a _Pages_ adapter**,
  even though the package name suggests platform-neutral. Old tutorials still
  say `wrangler pages deploy`; the correct command for this project is
  `wrangler deploy`. Following stale guides is the most likely first-deploy
  footgun. Pages and Workers were unified in 2024–2025; new projects deploy
  to Workers.
- **Cloudflare rarely labels features GA/beta inline on docs pages.** A
  capability that looks like "just install it" can be GA, preview, or
  region-limited and the only way to find out is the changelog. Hyperdrive
  is GA; Containers and Workflows on Workers are recent enough to verify if
  reached for.
- **Wrangler 4 defaults commands to `--local`.** `wrangler tail` no longer
  hits production unless you pass `--remote`. New users (and agents
  that haven't read the changelog) get clean output and assume the service
  is silent.
- **Workers have no traditional filesystem at runtime.** Anything that writes
  a temp file (PDF lib, image processor) breaks in non-obvious ways. R2 is
  the substitute but it is a different mental model — most Node libraries
  assume `/tmp` exists.
- **Free-tier 100k req/day resets at UTC midnight, not local midnight.** For
  an EU-evening usage pattern, "I've used 80% by 22:00 UTC" is much closer
  to the wall than the daily average suggests.

## Operational Story

- **Preview deploys**: `wrangler deploy` creates a versioned deployment with
  its own per-version preview URL (not a public guessable URL like
  Vercel/Netlify previews). Promote a version to production with
  `wrangler versions deploy` or roll back with `wrangler rollback`. For
  PR-style previews, configure a separate Worker per branch or use
  `--name <branch>-10xmoney-tracker` on `wrangler deploy` from CI.
- **Secrets**: `wrangler secret put SUPABASE_URL` / `wrangler secret put
SUPABASE_KEY` — stored encrypted in the Workers platform, never in the
  repo. Hyperdrive connection string is configured separately via
  `wrangler hyperdrive create`. Local dev reads from `.dev.vars` (gitignored,
  same KEY=VALUE format). Rotation: re-run `wrangler secret put` with the
  new value; the next deploy picks it up.
- **Rollback**: `wrangler rollback [<version-id>]` switches traffic to a prior
  version instantly (no rebuild). If `<version-id>` is omitted, picks the
  last stable 100% version. Data caveat: Supabase migrations are not part
  of the Worker rollback — if a release shipped a destructive migration,
  rolling back the Worker leaves the database on the new schema.
- **Approval**: agent may run `wrangler deploy` against a non-production
  Worker name freely. **Human-only**: promoting a version to production via
  `wrangler versions deploy`, rotating `SUPABASE_KEY`, deleting a Worker,
  changing the custom domain or zone. Destructive Supabase ops (drop table,
  reset password) are also human-only by policy.
- **Logs**: `wrangler tail --remote` for live request logs;
  `wrangler tail --remote --format=json` for structured output an agent can
  parse. With `observability.enabled = true` already set in `wrangler.jsonc`,
  the Workers Observability MCP server (`observability.mcp.cloudflare.com/mcp`)
  exposes structured queries against logs and metrics without parsing
  CLI output.

## Risk Register

| Risk                                                                                                           | Source           | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@astrojs/cloudflare` v13 adapter regression in a future minor                                                 | Devil's advocate | M          | H      | Pin to a known-good minor in `package.json` (currently `^13.5.0`; consider pinning to exact `13.5.x` post-launch). Verify each upgrade against `astro preview` (which runs workerd) before deploying.                                                                                                                                                                                     |
| Dual env-access pattern (`import.meta.env` vs `Astro.locals.runtime.env`) causes silent `undefined` at runtime | Devil's advocate | M          | M      | Define a typed `getRuntimeEnv()` helper in `src/lib/env.ts` that reads from `Astro.locals.runtime.env`; route all Supabase secret access through it. Document the pattern in `AGENTS.md` / `CLAUDE.md`.                                                                                                                                                                                   |
| 3 MB gzipped bundle ceiling on free tier blocks a future server-side feature                                   | Devil's advocate | L          | M      | Monitor `wrangler deploy` output (size is printed). Lazy-import heavy deps via `await import()` inside route handlers. Upgrade to Paid Standard ($5/mo, 10 MB ceiling) before adding any PDF/image/server-side processing.                                                                                                                                                                |
| 10 ms CPU limit hit by server-side aggregation in the v1.1 grouped-spend report                                | Pre-mortem       | M          | H      | Do report aggregation in SQL (Postgres views or RPC), not in the Astro server route. Profile any new server-side computation with `wrangler tail --remote` before considering it shippable.                                                                                                                                                                                               |
| `Astro.locals.runtime.env` shape change between minors causes silent secret unavailability                     | Pre-mortem       | L          | H      | Validate Supabase env presence at startup with a typed Zod schema; throw on missing values rather than serving requests with `undefined`. The typed helper from row #2 is the right home.                                                                                                                                                                                                 |
| Following stale `wrangler pages deploy` tutorials breaks first deploy                                          | Unknown unknowns | M          | L      | Stick to `wrangler deploy` (Workers); pin `wrangler.jsonc` `$schema` to the installed Wrangler version (already done).                                                                                                                                                                                                                                                                    |
| Wrangler 4 `--local` default makes `wrangler tail` appear silent                                               | Unknown unknowns | M          | L      | Always pass `--remote` for production observability. Add an `npm run tail` script (`wrangler tail --remote --format=json`) so the agent has one canonical command.                                                                                                                                                                                                                        |
| Hyperdrive misconfiguration (wrong connection string, missing flag) on first deploy                            | Devil's advocate | M          | H      | Follow Cloudflare's [Hyperdrive + Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) guide exactly. Use the Supabase **direct** connection string, not the pooler. Verify `compatibility_flags: ["nodejs_compat"]` is present (already done) and `compatibility_date >= 2024-09-23` (currently 2026-05-08, fine). |
| 100k req/day free quota exhausted on UTC reset boundary                                                        | Unknown unknowns | L          | M      | Set up a `wrangler analytics` check or use the Workers Observability MCP to alert before 80% consumption on a given UTC day. Upgrade to Paid Standard ($5/mo, 10M req/mo) once any kind of public-facing traffic appears.                                                                                                                                                                 |
| Worker rollback restores code but Supabase migration cannot be rolled back trivially                           | Research finding | L          | H      | Treat Supabase migrations as forward-only by convention. Test destructive migrations against a Supabase branch (Supabase has branching) before applying to the production project.                                                                                                                                                                                                        |

## Getting Started

The project is already wired for Cloudflare Workers: `@astrojs/cloudflare`
v13.5.0, `wrangler` v4.90.0, and `wrangler.jsonc` with `nodejs_compat` +
`compatibility_date: 2026-05-08` are in place. The remaining steps are
authentication, secrets, and the first deploy.

1. **Authenticate Wrangler with your Cloudflare account.**

   ```bash
   npx wrangler login
   ```

   Opens a browser; pick the right Cloudflare account if you have more than
   one. Persists credentials in `~/.wrangler`.

2. **Add the Supabase secrets to the Worker.**

   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_KEY
   ```

   Each command prompts for the value once and stores it encrypted. Repeat
   for any other server-side secret. For local dev, create `.dev.vars`
   (gitignored) with the same `KEY=VALUE` pairs.

3. **(Recommended) Provision Hyperdrive in front of Supabase Postgres.**

   ```bash
   npx wrangler hyperdrive create 10xmoney-pg \
     --connection-string="postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
   ```

   Use the Supabase **direct** connection string (not the Supavisor pooler —
   Hyperdrive pools). Add the returned binding to `wrangler.jsonc` as
   `hyperdrive: [{ binding: "HYPERDRIVE", id: "<id-returned>" }]`.

4. **Local development.**

   ```bash
   npm run dev      # Astro dev server (fast, Node-based, for UI iteration)
   npm run preview  # astro preview — runs workerd locally for runtime fidelity
   ```

   In Astro 6 + `@astrojs/cloudflare` v13, `astro preview` exercises the
   actual Workers runtime via `setPrerenderer()` — use this for any change
   that touches `Astro.locals.runtime.env`, secrets, or bindings.

5. **First production deploy.**

   ```bash
   npm run build
   npx wrangler deploy
   ```

   `wrangler deploy` (not `wrangler pages deploy`) is the correct command for
   Astro 6 + adapter v13. Add an npm script for convenience:

   ```json
   "deploy": "astro build && wrangler deploy"
   ```

6. **Observability.**
   ```bash
   npx wrangler tail --remote --format=json
   ```
   With `observability.enabled = true` already set in `wrangler.jsonc`, logs
   are also queryable via Cloudflare's Observability MCP at
   `observability.mcp.cloudflare.com/mcp`.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration (Workers does not use containers for this stack)
- CI/CD pipeline setup (covered in a later step; the lesson points to GitHub
  Actions auto-deploy-on-merge as the default flow for this starter)
- Production-scale architecture (multi-region active-active, HA, DR)
- Custom domain and zone configuration

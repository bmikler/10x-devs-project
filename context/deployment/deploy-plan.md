---
project: 10x-money-tracker
deployed_at: 2026-05-25
platform: cloudflare-workers
production_url: https://10x-money-tracker.devbmmail.workers.dev
cloudflare_account: devbmmail@gmail.com
cloudflare_account_id: 359030a43ffcc063cb2ae04344a393bd
deploy_method: manual
ci_deploys: false
---

# Deploy plan — execution record

Audit trail of the first production deployment, executed per the plan at
`~/.claude/plans/let-s-plan-cloudflare-integration-velvet-island.md` and the
research at `context/foundation/infrastructure.md`. This file is the
hand-off to downstream milestone-planning skills: it answers
"what is already deployed, and what runs the deploy?".

## What was deployed

- **Worker name**: `10x-money-tracker`
- **Default URL**: `https://10x-money-tracker.devbmmail.workers.dev`
- **Adapter**: `@astrojs/cloudflare` v13.5.0 (Astro 6 SSR)
- **Wrangler**: 4.93.1 at deploy time
- **Bundle size**: 1911 KiB unzipped / 391 KiB gzipped — comfortably under the
  3 MiB free-tier ceiling.
- **Worker startup time**: 19–22 ms across deploys.

## Bindings

| Binding   | Resource                                 | ID                                 | Source                                                                                               |
| --------- | ---------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ASSETS`  | Static assets from `./dist`              | n/a                                | declared in `wrangler.jsonc:assets`                                                                  |
| `SESSION` | KV namespace `10x-money-tracker-session` | `b6d193ca12954145b55a6164a7473c57` | declared in `wrangler.jsonc:kv_namespaces` (auto-provisioned on first deploy, then locked in config) |
| `IMAGES`  | Cloudflare Images                        | n/a                                | platform-provided; enabled by adapter                                                                |

## Secrets

Stored encrypted in Cloudflare via `wrangler secret put`. Never in the repo.

- `SUPABASE_URL` — production Supabase project URL.
- `SUPABASE_KEY` — production Supabase publishable key (`sb_publishable_*`
  format; designed for client-safe exposure, kept as a Worker secret for
  parity with the `astro:env` schema in `astro.config.mjs`).

## Deploy mechanics

- **Trigger**: human runs `npm run deploy` from local after merging to `master`.
- **No CI deploys**. `.github/workflows/ci.yml` continues to run lint + build
  only on push/PR; no `wrangler deploy` step.
- **Rollback**: `npx wrangler rollback` — reverts active version instantly.
  Verified end-to-end during Phase 5 of the original plan.
- **Logs**: `npm run tail` (= `wrangler tail --format=json`). The
  `infrastructure.md` claim that `--remote` is needed for Wrangler 4 turned out
  to be incorrect for the `tail` subcommand in 4.93.1 — `wrangler tail` targets
  the deployed Worker by default; `--remote` is not a valid flag and was
  removed from the npm script.
- **Observability MCP**: `observability.enabled = true` in `wrangler.jsonc`;
  structured logs available at `observability.mcp.cloudflare.com/mcp` for
  agent-driven queries.

## Deviations from the original plan

1. **No `--remote` on `wrangler tail`.** Removed from the `tail` npm script
   after the first invocation errored with "Unknown argument: remote". The
   underlying claim from `infrastructure.md` Unknown-Unknowns #3 (Wrangler 4
   defaults to local) applies to `wrangler dev`, not `wrangler tail`.
2. **`SESSION` KV namespace explicitly bound in `wrangler.jsonc`.** On the
   first deploy, Wrangler's experimental "bindings to provision" flow created
   the namespace automatically. Binding it explicitly in config keeps future
   deploys deterministic.
3. **`workers.dev` subdomain registration was an additional manual gate.**
   The plan covered `wrangler login` as a manual step but did not call out
   that a Cloudflare account also needs a one-time workers.dev subdomain
   registration before any Worker is publicly accessible. First deploy
   reached "Uploaded" then halted; the user registered the subdomain via
   `https://dash.cloudflare.com/<account-id>/workers/onboarding` and the
   re-deploy succeeded.
4. **Hyperdrive skipped (planned).** The data layer uses `@supabase/ssr`
   (REST/PostgREST), not a raw Postgres client. Add Hyperdrive only if a
   raw-postgres data layer is introduced later.

## Version history

| Version ID                             | Created              | Note                                                                |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------- |
| `db46e301-342a-49b6-9b39-30e175a8684f` | 2026-05-25 13:36 UTC | initial Worker upload before secrets                                |
| `fae4a0bb-4540-4b2e-9fd2-ecbf4d7c311c` | 2026-05-25 13:36 UTC | post `SUPABASE_URL` secret                                          |
| `a4c9d062-451d-455d-bba7-cde4587f5e47` | 2026-05-25 13:36 UTC | post `SUPABASE_KEY` secret                                          |
| `4db16bf8-f643-4b28-a4fe-75fa13861ee1` | 2026-05-25 13:37 UTC | first `wrangler deploy` (failed publish — no workers.dev subdomain) |
| `7f02cc23-cf53-487c-9ffd-3849aca9032d` | 2026-05-25 13:39 UTC | first successful production deploy                                  |
| `0d7cde81-65c4-43c2-a698-051fb294dff2` | 2026-05-25 13:46 UTC | post explicit SESSION KV binding in wrangler.jsonc                  |
| `7f02cc23-cf53-487c-9ffd-3849aca9032d` | 2026-05-25 13:48 UTC | **rollback** to previous version (Phase 5 verification)             |
| `067889c8-12c3-42db-89ce-58f33d8c072f` | 2026-05-25 13:49 UTC | roll-forward; current active version                                |

## What is already wired (so downstream planners can rely on it)

- Cloudflare account, Worker, KV namespace, secrets — all provisioned.
- `npm run deploy` and `npm run tail` are project-local commands; an agent can
  invoke them without re-discovering wrangler flags.
- Production secrets only need refreshing if Supabase credentials rotate;
  re-running `wrangler secret put` is the only step.

## What is intentionally NOT wired

- **No GitHub Actions deploy job.** Production deploys are human-driven.
- **No PR-preview Workers.** Per-version preview URLs are auto-generated by
  Wrangler on each deploy (the "Preview URLs will be enabled by default"
  warning) but are not actively used in the workflow; local `npm run preview`
  (workerd) is the inner-loop fidelity check.
- **No custom domain.** Default `*.workers.dev` URL is used; add a `routes`
  entry in `wrangler.jsonc` plus DNS via Cloudflare to attach one later.
- **No Hyperdrive.** Not needed for the current Supabase-REST data layer.

## Approval boundary

Per `infrastructure.md`'s operational story, the following remain human-only
even with the Worker live:

- Promoting / rolling back production versions (`wrangler rollback`,
  `wrangler versions deploy`).
- Rotating `SUPABASE_KEY` or any Worker secret.
- Deleting the Worker or changing the workers.dev subdomain.
- Destructive Supabase operations (drop table, reset password, schema rollback).

Agent may run `wrangler deploy` against a non-production Worker name freely
once one exists; the production Worker remains a human gate.

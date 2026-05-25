---
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xmoney-tracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: manual-deploy
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

Solo author shipping a personal budget+expense tracker in 3 after-hours weeks
needs auth, a Postgres-backed data model with structural per-user isolation,
mobile-first responsive UI, and a deployment that won't burn the timeline. The
10x Astro Starter is the recommended default for `(web, js)` and bundles all
four: Astro 6 + React islands + TypeScript + Tailwind handle the mobile UI and
under-2-second response budget; Supabase provides third-party identity sign-in
(FR-001/002) and Postgres with row-level security to enforce the data-isolation
guardrail structurally; Cloudflare Workers is the starter's deployment default and
keeps cold-start latency low for the phone-in-shop scenario. All four
agent-friendly gates pass (typed, convention-based, popular in JS training
data, well-documented). Bootstrapper confidence is first-class — scaffolding
should be mostly smooth with occasional manual steps. CI on GitHub Actions with
auto-deploy-on-merge matches the standard solo shape.

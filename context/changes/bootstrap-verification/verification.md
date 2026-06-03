---
bootstrapped_at: 2026-05-22T09:45:00Z
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: 10xmoney-tracker
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim copy of `context/foundation/tech-stack.md` frontmatter:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: 10xmoney-tracker
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

### Why this stack

Solo author shipping a personal budget+expense tracker in 3 after-hours weeks
needs auth, a Postgres-backed data model with structural per-user isolation,
mobile-first responsive UI, and a deployment that won't burn the timeline. The
10x Astro Starter is the recommended default for `(web, js)` and bundles all
four: Astro 6 + React islands + TypeScript + Tailwind handle the mobile UI and
under-2-second response budget; Supabase provides third-party identity sign-in
(FR-001/002) and Postgres with row-level security to enforce the data-isolation
guardrail structurally; Cloudflare Pages is the starter's deployment default and
keeps cold-start latency low for the phone-in-shop scenario. All four
agent-friendly gates pass (typed, convention-based, popular in JS training
data, well-documented). Bootstrapper confidence is first-class — scaffolding
should be mostly smooth with occasional manual steps. CI on GitHub Actions with
auto-deploy-on-merge matches the standard solo shape.

## Pre-scaffold verification

| Signal      | Value   | Severity | Notes                                                                           |
| ----------- | ------- | -------- | ------------------------------------------------------------------------------- |
| npm package | not run | n/a      | cmd_template starts with `git clone`; no npm CLI to query                       |
| GitHub repo | not run | n/a      | `gh api` returned 401 (Bad credentials); public API returned 403 (rate limited) |

Recency check unavailable on both signals. Per the slot's failure-mode policy this is warn-and-continue; the scaffold proceeded with no recency heads-up.

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 (`.env.example`, `.github/`, `.husky/`, `.nvmrc`, `.prettierrc.json`, `.vscode/`, `CLAUDE.md` → `CLAUDE.md.scaffold`, `README.md`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `node_modules/`, `package-lock.json`, `package.json`, `public/`, `src/`, `supabase/`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (cwd `CLAUDE.md` preserved; scaffold copy sidelined for diffing)
**.gitignore handling**: append-merged with `# from 10x-astro-starter` separator; scaffold lines `.DS_Store` and `.idea/` deduped against cwd
**.bootstrap-scaffold cleanup**: deleted

Notes:

- A leftover `.bootstrap-scaffold/` from a previous interrupted run was present at Step 0; per user choice it was deleted and the clone re-run from scratch.
- The inherited `.git/` was removed before move-up so the upstream starter's history does not leak into the project repo.
- The user's own `.git/` in cwd was untouched.
- `context/` had no clash (the starter ships no `context/` tree).

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 0 CRITICAL, 1 HIGH, 9 MODERATE, 0 LOW
**Direct vs transitive**: 0/0/2/0 direct of total 0/1/9/0
**Dependency counts**: 449 prod, 316 dev, 131 optional (895 total)

#### CRITICAL findings

_(none)_

#### HIGH findings

- **devalue** (5.6.3 - 5.8.0) — **transitive**, advisory via `devalue`. No bootstrapper auto-fix; review `npm audit` output for the upstream fix path.

#### MODERATE findings

- **@astrojs/check** (>=0.9.3) — **direct**, advisory via `@astrojs/language-server`.
- **@astrojs/language-server** (>=2.14.0) — transitive, advisory via `volar-service-yaml`.
- **@cloudflare/vite-plugin** (<=0.0.0-fff677e35 || 0.0.7 - 1.37.2) — transitive, advisory via `miniflare`, `wrangler`, `ws`.
- **miniflare** (<=0.0.0-fff677e35 || 3.20250204.0 - 4.20260518.0) — transitive, advisory via `ws`.
- **volar-service-yaml** (<=0.0.70) — transitive, advisory via `yaml-language-server`.
- **wrangler** (<=0.0.0-kickoff-demo || 3.108.0 - 4.93.0) — **direct**, advisory via `miniflare`.
- **ws** (8.0.0 - 8.20.0) — transitive, advisory via `ws`.
- **yaml** (2.0.0 - 2.8.2) — transitive, advisory via `yaml`.
- **yaml-language-server** (1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0) — transitive, advisory via `yaml`.

#### LOW / INFO findings

_(none)_

The 2 direct findings (`@astrojs/check`, `wrangler`) are the most actionable — your `package.json` controls those versions. The HIGH `devalue` finding and the rest are transitive; they resolve when upstream maintainers (Astro, Cloudflare's wrangler, Volar) ship updates. Bootstrapper takes no auto-fix action.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | null                 |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- `git init` is not needed — cwd already carries your own `.git/`; the cloned starter's `.git/` was removed during scaffold so its history does not leak.
- Review `CLAUDE.md.scaffold` against your existing `CLAUDE.md` (`diff CLAUDE.md CLAUDE.md.scaffold`) and merge anything starter-specific you want to keep (commands, architecture notes, conventions). Delete `CLAUDE.md.scaffold` afterwards.
- Address audit findings per your project's risk tolerance — the 2 direct findings (`@astrojs/check`, `wrangler`) are the most actionable; `npm audit fix` may resolve some without breaking changes.
- Copy `.env.example` to `.env` (or `.dev.vars` for Cloudflare local dev) and fill in `SUPABASE_URL` / `SUPABASE_KEY` before `npm run dev`.
- Start a local Supabase stack (`npx supabase start`, requires Docker) before exercising any auth flow.

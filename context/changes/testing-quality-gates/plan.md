# Quality-gates Wiring Implementation Plan

## Overview

Lock the project's test lanes into the existing GitHub Actions CI as enforced
gates (Phase 4 of `context/foundation/test-plan.md`). Three gates land: an
explicit typecheck on the fast lane, a **blocking** integration lane backed by
an ephemeral local Supabase, and branch protection on `master` that requires
both checks to pass and forbids direct pushes (changes land only via PR).

## Current State Analysis

- **CI today** (`.github/workflows/ci.yml`) is a single `ci` job on
  `ubuntu-latest`, triggered on push + PR to `master`:
  `checkout → setup-node@22 (npm cache) → npm ci → npx astro sync →
  npm run lint → npm run test → npm run build` (build gets `SUPABASE_URL` /
  `SUPABASE_KEY` from repo secrets). The **unit lane already runs in CI** via
  `npm run test` (`vitest run`, `vitest.config.ts` excludes
  `tests/integration/**`).
- **No explicit typecheck step.** `npx astro sync` generates types but does not
  typecheck; `astro build` does not reliably surface all TS type errors.
  `@astrojs/check` (`^0.9.8`) is installed, so `astro check` is available.
  §5 of the test-plan already *claims* "lint + typecheck" is wired — this is
  currently inaccurate.
- **Integration lane cannot run in CI as written.** `package.json:19`
  (`test:integration`) invokes `node --env-file=.dev.vars …`; `.dev.vars` is
  gitignored (`.gitignore:30`) and absent on the runner, so the script fails
  before vitest starts. The helper `tests/integration/helpers/supabase.ts:14-18`
  reads `SUPABASE_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY` from `process.env` and
  throws a clear error if any is missing.
- **Integration suite** lives in `tests/integration/**` (`data-isolation.test.ts`,
  `mutation-safety.test.ts`, `placeholder.test.ts`) and is targeted by
  `vitest.integration.config.ts`. It needs a running local Supabase
  (API on `:54321`) with migrations applied.
- **Migration application:** §6.6 records that `supabase db reset` is the
  reliable way to apply migrations to local Supabase when PostgREST reports a
  schema-cache miss — more dependable than relying on `supabase start` alone.
- **Key format gotcha:** §6.2 / the helper comment require the **JWT-format**
  `ANON_KEY` from `supabase status -o env`, *not* the opaque
  `sb_publishable_…` key (local PostgREST validates it as a JWT).
- **Branch protection** is a repo-level GitHub setting, not expressible in the
  workflow file. The repo is GitHub (`.github/workflows/`), so the tool is
  `gh` (not `glab`).

## Desired End State

- A push or PR to `master` triggers two jobs: the existing fast `ci` job
  (now including a typecheck step) and a new `integration` job that boots local
  Supabase and runs `tests/integration/**` as a **blocking** gate.
- `master` is protected: merges require both the `ci` and `integration` checks
  to pass, require a pull request, and direct pushes are rejected.
- `test-plan.md` §3 Phase 4 reads `complete`; §5's integration gate reflects
  "enforced"; §6 documents how CI runs the lanes. `change.md` is `planned`.

**Verification:** Open a PR with a deliberately failing integration assertion →
the `integration` check goes red and the PR cannot be merged. Attempt
`git push origin master` directly → rejected by branch protection.

### Key Discoveries:

- Unit lane is already a CI gate (`npm run test`); only the integration lane is
  genuinely new. (`.github/workflows/ci.yml:21`)
- The integration helper reads `process.env` directly
  (`tests/integration/helpers/supabase.ts:14-18`) — so a CI-friendly script
  that drops `--env-file` and exports keys into the job environment is all
  that's needed; no `.dev.vars` file required on the runner.
- `supabase` CLI is a devDependency (`package.json:60`), so `npx supabase …`
  works after `npm ci`; `ubuntu-latest` ships Docker for the local stack.
- `supabase status -o env` emits the keys but under its own names (`ANON_KEY`,
  `SERVICE_ROLE_KEY`, `API_URL`); the helper wants `SUPABASE_URL` + `ANON_KEY` +
  `SERVICE_ROLE_KEY`, so a small name-mapping is required when exporting.

## What We're NOT Doing

- Not adding e2e, visual-diff, or accessibility gates (§3 / §7 exclude them).
- Not running integration tests against a *remote*/hosted Supabase — the lane
  uses ephemeral local Supabase whose keys are generated per run.
- Not converting the integration lane to a soak / `continue-on-error` period —
  it blocks from day one.
- Not refactoring CI into a reusable workflow or matrix (two lanes don't justify
  it).
- Not changing the unit suite, integration suite contents, or any app/source
  code (beyond fixing type errors a new `astro check` step may surface).
- Not touching the existing build secrets wiring (`SUPABASE_URL` /
  `SUPABASE_KEY` for `npm run build`).

## Implementation Approach

Two parallel CI jobs keep the fast feedback lane Supabase-free while the
heavier integration lane runs independently. The fast lane gains a typecheck
step; the integration lane is a fresh job that owns the Supabase lifecycle. Both
job names become required status checks under branch protection, which is what
actually enforces "no merge unless green" and "no direct push to master".
Documentation is updated last so it reflects what shipped.

## Critical Implementation Details

- **Key name mapping (load-bearing):** `supabase status -o env` does **not** emit
  a `SUPABASE_URL` variable — it emits `API_URL` (plus `ANON_KEY`,
  `SERVICE_ROLE_KEY`). The integration job must map `API_URL → SUPABASE_URL`
  when exporting to `$GITHUB_ENV`, and must use the **JWT** `ANON_KEY` (not the
  `sb_publishable_…` key). Getting this wrong produces the exact "X is required"
  throw from the helper or a PostgREST JWT-rejection.
- **Migration ordering:** run `supabase db reset --no-seed` (or `db reset`)
  *after* `supabase start` and *before* the tests, so migrations are reliably
  applied (§6.6) — don't assume `start` alone leaves the schema cache correct.
- **Branch-protection check names must match job IDs.** The required status
  checks configured via `gh api` must be the exact job names GitHub reports
  (`ci` and `integration`). If a job is renamed, protection silently stops
  gating it.

## Phase 1: Fast-lane typecheck gate

### Overview

Add an explicit typecheck to the existing `ci` job and resolve any pre-existing
type errors it surfaces, so §5's "typecheck wired" claim becomes true.

### Changes Required:

#### 1. CI workflow — typecheck step

**File**: `.github/workflows/ci.yml`

**Intent**: Add an `astro check` step to the `ci` job so type drift fails CI
explicitly rather than relying on `build` to catch it.

**Contract**: New `- run: npx astro check` step in the `ci` job, ordered after
`npx astro sync` (sync must generate types first) and before or alongside
`npm run lint`. No new dependency — `@astrojs/check` is already installed.

#### 2. Pre-existing type errors (conditional)

**File**: source files flagged by `astro check` (unknown until run)

**Intent**: If `astro check` reports errors on the current tree, fix them so the
new gate passes green. If it reports zero, this sub-step is a no-op.

**Contract**: Whatever type fixes are needed; no behavioral change. Scope is
limited to making the existing tree typecheck-clean — not a broader cleanup.

### Success Criteria:

#### Automated Verification:

- Typecheck passes locally: `npx astro sync && npx astro check`
- Lint passes: `npm run lint`
- Unit tests pass: `npm run test`
- Build passes: `npm run build`

#### Manual Verification:

- The `ci` job on a pushed branch shows the `astro check` step running and green.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Integration lane in CI

### Overview

Add a CI-friendly integration script and a new blocking `integration` job that
owns the local Supabase lifecycle and runs `tests/integration/**`.

### Changes Required:

#### 1. CI-friendly integration script

**File**: `package.json`

**Intent**: Add a `test:integration:ci` script that runs the integration vitest
config without `--env-file`, so it reads keys straight from `process.env` (which
the CI job will populate). The existing `test:integration` (local, `.dev.vars`)
stays unchanged.

**Contract**: New script key:
`"test:integration:ci": "vitest run --config vitest.integration.config.ts"`.

#### 2. New `integration` CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Add a second job, parallel to `ci`, that stands up local Supabase,
applies migrations, exports the JWT keys into the job env, and runs the
integration suite as a blocking gate (no `continue-on-error`).

**Contract**: A new `integration` job under `jobs:` on `ubuntu-latest`,
triggered by the same existing `on:` block. Step sequence:
`checkout → setup-node@22 (npm cache) → npm ci → npx supabase start →
npx supabase db reset → export keys → npm run test:integration:ci`.
The key-export step maps `supabase status -o env` output into `$GITHUB_ENV`
with the names the helper expects:

```bash
# supabase emits API_URL / ANON_KEY / SERVICE_ROLE_KEY; helper wants SUPABASE_URL too
eval "$(npx supabase status -o env | sed 's/^/export /')"
{
  echo "SUPABASE_URL=$API_URL"
  echo "ANON_KEY=$ANON_KEY"
  echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
} >> "$GITHUB_ENV"
```

(Exact quoting/parsing is the implementer's call — the contract is: the three
process-env names the helper reads end up set, with the JWT `ANON_KEY`.)

### Success Criteria:

#### Automated Verification:

- Local dry run mirrors CI: `supabase start && supabase db reset` then
  `export $(supabase status -o env | grep -E 'ANON_KEY|SERVICE_ROLE_KEY')` +
  `SUPABASE_URL` set → `npm run test:integration:ci` passes.
- The `integration` job runs on a pushed branch and is green.
- A deliberately broken integration assertion turns the `integration` job red
  (proves the gate actually fails CI).

#### Manual Verification:

- CI run shows `ci` and `integration` as two separate jobs running in parallel.
- The fast `ci` job does not boot Supabase (stays fast / Supabase-free).
- Integration job logs show migrations applied before the suite runs.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: Branch protection on master

### Overview

Require both CI checks to pass via PR and forbid direct pushes to `master`.

### Changes Required:

#### 1. Branch-protection configuration

**File**: repo setting on GitHub (no file in-tree) — applied via `gh api`

**Intent**: Protect `master` so merges require the `ci` and `integration`
status checks to pass, require a pull request before merging, and reject direct
pushes. Document the exact command so it's reproducible and reviewable.

**Contract**: A `gh api` call to
`PUT /repos/{owner}/{repo}/branches/master/protection` setting
`required_status_checks.contexts` to `["ci","integration"]`,
`required_pull_request_reviews` present (PR required), and
`enforce_admins`/`restrictions` per the desired strictness. The check context
strings must match the job names exactly (see Critical Implementation Details).
Requires a token/account with admin on the repo; if unavailable, fall back to
the manual GitHub UI steps documented alongside.

### Success Criteria:

#### Automated Verification:

- Protection reads back correctly:
  `gh api repos/{owner}/{repo}/branches/master/protection` shows
  `ci` and `integration` in `required_status_checks.contexts` and PR-required.

#### Manual Verification:

- `git push origin master` directly is rejected (must go through a PR).
- A PR with a red `integration` (or `ci`) check cannot be merged; the same PR
  becomes mergeable once both are green.

**Implementation Note**: After completing this phase and all automated
verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Docs sync

### Overview

Update the test-plan and change record to reflect the now-enforced gates.

### Changes Required:

#### 1. Test-plan status + gate updates

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that Phase 4 shipped. Set §3 Phase 4 Status to `complete`
and fill its Change folder cell; update §5 so the integration gate reads as
enforced (no longer "required after §3 Phase 2" / pending) and the
"lint + typecheck" row is accurate now that `astro check` runs; add a §6
note describing how CI runs both lanes (separate jobs, Supabase boot + `db
reset`, JWT key export, `test:integration:ci`).

**Contract**: Edits to the §3 rollout table row 4, the §5 gates table, and a new
short §6 sub-note (e.g. under §6.2 or a §6.7). Update the "Last updated" date.
Do not alter §1–§4 strategy beyond the status/gate facts that changed.

#### 2. Change record

**File**: `context/changes/testing-quality-gates/change.md`

**Intent**: Mark the change as planned/landed per the lifecycle.

**Contract**: `status: planned` (or `complete` once implemented) and
`updated: <today>` in the frontmatter.

### Success Criteria:

#### Automated Verification:

- Markdown lint/format passes on the edited docs: `npm run format` (or the
  lint-staged prettier pass) leaves them clean.

#### Manual Verification:

- §3 Phase 4 row and §5 gates table read correctly and match the shipped CI.
- A reader following §6 can reproduce the CI integration run locally.

**Implementation Note**: Final phase — no downstream phase to gate.

---

## Testing Strategy

### Unit Tests:

- No new unit tests; the existing unit suite (`npm run test`) must stay green
  and continues to run as the fast-lane gate.

### Integration Tests:

- Existing `tests/integration/**` suite is the payload of the new gate. The
  meaningful new verification is *operational*: that the CI job boots Supabase,
  applies migrations, and runs the suite to a real pass — and that a forced
  failure reddens the gate.

### Manual Testing Steps:

1. Push a branch; confirm `ci` (with `astro check`) and `integration` run as
   parallel jobs and both go green.
2. Open a PR that breaks one integration assertion; confirm the `integration`
   check fails and the PR is unmergeable.
3. Attempt `git push origin master`; confirm branch protection rejects it.
4. Revert the broken assertion; confirm the PR becomes mergeable once green.

## Performance Considerations

The fast `ci` lane stays Supabase-free so lint/unit/typecheck feedback isn't
delayed by Docker startup. The `integration` job pays a one-time
`supabase start` + image-pull cost (~1–2 min); acceptable for a blocking gate
on a deploy branch. `npm` is already cached via `setup-node`. Docker-layer
caching for the Supabase images is a possible future optimization, not in scope.

## Migration Notes

No data migration. The only "migration" is operational: existing local
integration workflows are unaffected (`test:integration` + `.dev.vars` stays);
CI uses the new `test:integration:ci` script.

## References

- Test plan: `context/foundation/test-plan.md` (§3 Phase 4, §5 gates, §6.2/§6.6)
- Change record: `context/changes/testing-quality-gates/change.md`
- Current CI: `.github/workflows/ci.yml`
- Integration helper: `tests/integration/helpers/supabase.ts:14-18`
- Integration config: `vitest.integration.config.ts`
- Integration scripts: `package.json:19-20`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fast-lane typecheck gate

#### Automated

- [x] 1.1 Typecheck passes locally: `npx astro sync && npx astro check`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Unit tests pass: `npm run test`
- [x] 1.4 Build passes: `npm run build`

#### Manual

- [ ] 1.5 The `ci` job shows the `astro check` step running and green

### Phase 2: Integration lane in CI

#### Automated

- [ ] 2.1 Local dry run mirrors CI and `npm run test:integration:ci` passes
- [ ] 2.2 The `integration` job runs on a pushed branch and is green
- [ ] 2.3 A deliberately broken integration assertion turns the `integration` job red

#### Manual

- [ ] 2.4 CI shows `ci` and `integration` as two parallel jobs
- [ ] 2.5 The fast `ci` job does not boot Supabase
- [ ] 2.6 Integration job logs show migrations applied before the suite runs

### Phase 3: Branch protection on master

#### Automated

- [ ] 3.1 Protection reads back with `ci` + `integration` required and PR-required

#### Manual

- [ ] 3.2 Direct `git push origin master` is rejected
- [ ] 3.3 A PR with a red check cannot be merged; mergeable once both are green

### Phase 4: Docs sync

#### Automated

- [ ] 4.1 Markdown format/lint passes on the edited docs

#### Manual

- [ ] 4.2 §3 Phase 4 row and §5 gates table match the shipped CI
- [ ] 4.3 A reader following §6 can reproduce the CI integration run locally

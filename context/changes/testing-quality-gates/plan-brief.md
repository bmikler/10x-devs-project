# Quality-gates Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates/plan.md`

## What & Why

Phase 4 of `test-plan.md`: turn the project's test lanes into enforced CI gates.
Today CI runs lint + unit + build, but the **integration** lane (data-isolation,
cascade, validation — the highest-risk coverage) runs only on developer machines,
and `master` accepts direct pushes. This change makes integration a blocking CI
gate, adds an explicit typecheck, and protects `master`.

## Starting Point

`.github/workflows/ci.yml` is a single `ci` job (lint → unit → build) on push/PR
to `master`. The unit lane already runs there; the integration lane can't —
`test:integration` depends on a gitignored `.dev.vars` and a running local
Supabase. There is no explicit typecheck step, and `master` has no branch
protection.

## Desired End State

Push/PR to `master` runs two parallel jobs — the fast `ci` job (now with
`astro check`) and a blocking `integration` job that boots ephemeral local
Supabase and runs `tests/integration/**`. `master` is locked: merges require
both checks green via PR, and direct pushes are rejected.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Job structure | Separate `integration` job, parallel to `ci` | Keep fast lane Supabase-free; Docker boot doesn't block lint/unit | Plan |
| Gate enforcement | Block immediately (no soak) | The point of Phase 4; a non-blocking gate protects nothing (§5) | Plan |
| Triggers + master | Same push/PR triggers; block direct pushes via branch protection | master is the deploy branch — no hole for direct pushes | Plan |
| Key wiring | New `test:integration:ci` script reading `process.env` | Helper already reads process.env; no secret file on runner | Plan |
| Typecheck | Add `astro check` to fast lane | Makes §5's "typecheck wired" claim true | Plan |
| Master lock | Branch protection via `gh api` + manual fallback | Reproducible; real platform mechanism vs workflow hack | Plan |

## Scope

**In scope:** `astro check` step; `test:integration:ci` script; new `integration`
CI job (Supabase boot + `db reset` + JWT key export); `master` branch protection;
test-plan + change-record doc updates.

**Out of scope:** e2e / visual / a11y gates; remote-Supabase integration; soak
period; CI matrix/reusable-workflow refactor; app code changes (beyond fixing any
type errors `astro check` surfaces).

## Architecture / Approach

Two jobs in one workflow. `ci`: checkout → npm ci → astro sync → **astro check** →
lint → unit → build (unchanged secrets). `integration`: checkout → npm ci →
`supabase start` → `supabase db reset` → export `API_URL→SUPABASE_URL` +
JWT `ANON_KEY` + `SERVICE_ROLE_KEY` into `$GITHUB_ENV` → `test:integration:ci`.
Both job names become required status checks under `master` branch protection.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Typecheck gate | `astro check` in the fast lane | May surface pre-existing type errors to fix |
| 2. Integration lane | Blocking `integration` job + CI script | Supabase boot / key-name mapping in CI |
| 3. Branch protection | `master` requires both checks via PR | Needs repo-admin token; check names must match job IDs |
| 4. Docs sync | test-plan §3/§5/§6 + change.md updated | Low — keep docs matching shipped CI |

**Prerequisites:** Docker on the runner (ubuntu-latest has it); repo-admin
access for branch protection.
**Estimated effort:** ~1–2 sessions across 4 phases.

## Open Risks & Assumptions

- `supabase status -o env` emits `API_URL` (not `SUPABASE_URL`) — the export
  step must map it, and must use the JWT `ANON_KEY`, or the helper throws.
- Supabase boot adds ~1–2 min and can be a flakiness source; mitigated by the
  separate job + `db reset` ordering. No retry wrapper (would mask flakiness).
- Branch-protection check contexts must exactly equal job names (`ci`,
  `integration`); renaming a job silently disables that gate.

## Success Criteria (Summary)

- A PR with a broken integration assertion shows a red `integration` check and
  is unmergeable; green once fixed.
- Direct `git push origin master` is rejected.
- §3 Phase 4 reads `complete` and §5 reflects the enforced integration gate.

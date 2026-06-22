---
change_id: testing-quality-gates
title: Quality-gates wiring — lock unit + integration into the CI floor
status: implementing
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

Phase 4 of context/foundation/test-plan.md (§3). Goal: lock the unit +
integration lanes into the existing GitHub Actions CI floor
(.github/workflows/ci.yml, which today runs lint + build on push/PR to
master). Risks covered: cross-cutting. Test type: gates (CI).

Per §5, after this lands the `integration` gate is enforced (it currently
reads "required after §3 Phase 2") and the unit gate continues to run.
Integration lane needs local Supabase + exported keys — CI wiring must
account for `supabase start` and the JWT-format ANON_KEY/SERVICE_ROLE_KEY
(see §6.2 prerequisites).

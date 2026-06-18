---
change_id: testing-data-isolation
title: Data-isolation & auth-boundary integration tests
status: implementing
created: 2026-06-18
updated: 2026-06-19
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Phase 2 of the test-plan rollout (`context/foundation/test-plan.md` §3). Covers Risk #1
(cross-user read/write must be denied) and Risk #5 (unauthenticated request must be rejected
at the API/route boundary). Test type: integration. Integration harness is TBD — selection is
part of this phase's research/plan.

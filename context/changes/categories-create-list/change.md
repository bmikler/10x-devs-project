---
change_id: categories-create-list
title: Categories — create and list (incl. implicit "other")
status: implementing
created: 2026-06-02
updated: 2026-06-02
archived_at: null
---

## Notes

Roadmap item **S-02** (Stream B, critical path to the north star). User can create a category (name + type `recurring|irregular` + spending limit) and see all categories listed, including the implicit "other" alongside user-defined ones.

- PRD refs: FR-003, FR-004
- Prerequisites: F-01 (data-layer-and-rls, shipped), S-01 (signed-in-shell, shipped) — both done, so this is unblocked.
- First slice exercising RLS on a real read+write path — proves the per-user data-isolation guardrail. An RLS mistake here cascades to S-03 and S-04.
- Open question (non-blocking): how is "other" visually distinguished in the list (Roadmap Open Q #2 / PRD Open Q)? Ship a sensible default; refine in v1.1.

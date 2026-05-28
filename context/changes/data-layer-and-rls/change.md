---
id: data-layer-and-rls
roadmap_id: F-01
title: Foundation — domain data model + per-user RLS
status: implemented
created: 2026-05-28
updated: 2026-05-28
---

# Foundation — domain data model + per-user RLS (F-01)

The first migration ever: create `categories` and `expenses` with year-scoped
categories, a `name`-bearing expense row, an `is_system = true` 'other'
fallback category seeded by S-02 (app-level convention, not a DB trigger),
and structural per-user isolation via row-level security. Two DB triggers
guard the system row from delete/update and cascade child expenses to
'other' on user-category delete. Wire generated TypeScript types into
`src/lib/supabase.ts` so every future data-access call inherits schema-level
types. Amend PRD FR-007/FR-008 to reflect the `name` field and the "at
least one category must exist before logging" rule.

- Plan: `plan.md`
- Brief: `plan-brief.md`

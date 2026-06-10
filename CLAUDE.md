# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project — 10x Astro Starter

Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, deployed to Cloudflare Workers via `@astrojs/cloudflare`. Canonical docs: @README.md, @context/foundation/prd.md, @context/foundation/tech-stack.md.

## Runtime gotchas

- **Deploy target is Cloudflare Workers, not Node.** Code reachable from a request (Astro pages, `src/pages/api/`, middleware) must not import Node-only APIs (`fs`, `path`, Node `crypto` bindings, native modules). Build-time scripts are fine.
- **React only where interactivity is required.** Default to `.astro` components for static rendering; reach for `.tsx` islands only with an explicit `client:*` directive. Don't convert `.astro` to `.tsx` "to be safe" — it ships unnecessary JS.
- **Supabase env vars are required**: `SUPABASE_URL`, `SUPABASE_KEY`. CI fails without them. The `supabase/` directory holds local config and migrations.

## Commands

- `npm run dev` — Astro dev server
- `npm run build` — production build (also runs in CI)
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` — Prettier
- **No test runner is configured.** Don't invent `npm test` / `vitest` / `jest` invocations; verify changes by building and exercising the app.

## Commit etiquette

- A husky pre-commit hook runs `eslint --fix` on `.ts/.tsx/.astro` and `prettier --write` on `.json/.css/.md` via lint-staged. Don't bypass with `--no-verify`; fix the underlying issue.
- CI (`.github/workflows/ci.yml`) runs lint + build on push and PRs to `master`.

## Repo layout quirks

- `.agents/skills/` belongs to the Codex CLI sibling tooling — NOT Claude Code skills. Claude Code skills live in `.claude/skills/`. Don't move files between them.
- `context/archive/` is immutable. Skills must not write there; if a resolved target starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."
- The block below between ``is managed by`10x-cli` and may be regenerated; don't edit inside the markers.

## Lessons learned

- see: `context/foundation/lessons.md`

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill                                                                                                                   | Use it when                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Roadmap (lesson focus)**                                                                                              |                                                                                                                                                                                                                                                                                                                                                                                            |
| `/10x-roadmap`                                                                                                          | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed**                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                            |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready.                                                                                                                                                                                                      |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

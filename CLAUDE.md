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

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 4

Prepare for a harder implementation stream with the **research-backed planning chain**:

```
internal research (/10x-research) + external research (exa.ai, Context7) -> /10x-plan -> /10x-implement -> success
```

The lesson focus is distinguishing internal from external research and using evidence to back planning decisions.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Internal research (lesson focus)** | |
| `/10x-research <change-id>` | You need evidence from the existing codebase — patterns, conventions, integration points, or existing implementations. Runs parallel sub-agents over the repo and writes structured findings to `research.md`. |
| **External research (lesson focus)** | |
| exa.ai | You need AI-native web search for library comparisons, best practices, or ecosystem context that the codebase cannot answer. |
| Context7 (`resolve-library-id` → `get-library-docs`) | You need live, current documentation for a specific library or framework. Resolves a library ID first, then fetches relevant doc pages. |
| **Framing spare wheel** | |
| `/10x-frame <change-id>` | The plan won't converge, the plan doesn't deliver expected results, or persistent drift keeps breaking the implementation. Use as an escape hatch on a separate problem (demonstrated on Space Explorers example), not as pre-research ritual. |
| **Planning and execution** | |
| `/10x-plan <change-id>` / `/10x-implement <change-id> phase <n>` | Use the same planning and execution chain from Lesson 2, now with upstream research evidence feeding the plan. |

### Research discipline

- Internal research (`/10x-research`) answers "what does our codebase already do?" — patterns, schemas, conventions, integration points.
- External research (exa.ai, Context7) answers "what should we do?" — library capabilities, API docs, ecosystem best practices.
- Combine both as evidence-backed input to `/10x-plan`. A plan without research evidence on a non-trivial stream is a guess.
- Agent-friendly docs (`llms.txt`, markdown-for-agents, `/md` endpoints) are a quality signal for library selection — libraries that publish agent-readable docs integrate faster.

### `/10x-frame` as spare wheel

Three triggers for reaching for `/10x-frame`:
1. The plan won't converge — research keeps opening more questions instead of narrowing to a contract.
2. The plan doesn't deliver — implementation repeatedly fails to meet success criteria.
3. Persistent drift — the implementation keeps diverging from the plan in ways that suggest the problem was mis-framed.

Demonstrated on a Space Explorers example, not the SRS path. It is an escape hatch, not a mandatory step.

### Paths used by this lesson

- `context/changes/<change-id>/research.md` - internal research output
- `context/changes/<change-id>/frame.md` - framing output when needed
- `context/changes/<change-id>/plan.md` - evidence-backed implementation contract
- `context/foundation/lessons.md` - recurring rules and pitfalls

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

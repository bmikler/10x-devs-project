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
- The block below between `` is managed by `10x-cli` and may be regenerated; don't edit inside the markers.

## Lessons learned

- see: `context/foundation/lessons.md`

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 4

Onboard the agent to the project you scaffolded in Lesson 3 with the **agent-context chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper)  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson
```

The PRD → tech-stack → bootstrap chain ships from Lessons 1–3 (re-included so you can fix the project mid-flight). `/10x-agents-md`, `/10x-rule-review`, and `/10x-lesson` are the lesson's main topics. The chain extends in Lesson 5 to the infra/deploy step.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Agent context (lesson focus)** | |
| `/10x-agents-md` | The repo is scaffolded but the agent has no project-specific onboarding. Inspects the repo (package manifest, README, scripts, lint/test config, layout, commit history) and writes a concise, ordered "Repository Guidelines" to `AGENTS.md` (or, when invoked from a subdirectory, a directory-level `AGENTS.md` reframed around local conventions and the dominant unit). Use as an alternative to the host's built-in `/init` or as a fallback for tools without one. Repo-level body targets ~200 lines; directory-level guides target 120–250 words. |
| `/10x-rule-review <path>` | You have a rules-for-AI file (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.mdc`, `.github/copilot-instructions.md`, `.windsurfrules`, nested per-area files) and want a 5-axis scorecard: length, embedded code/config snippets, precision of language, redundancy with public knowledge, and rule ordering. Tool-agnostic — scores the artifact's condition, not the project. Default output is read-only; only Check 5 (reorder) may edit, and only with explicit approval. |
| `/10x-lesson [seed]` | You spotted a recurring rule worth surfacing for future runs of `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, and `/10x-impl-review`. Appends a single entry (Context / Problem / Rule / Applies to) to `context/foundation/lessons.md`. Self-bootstraps the file with the canonical `# Lessons Learned` header on first use. Append-only — never reorders or rewrites prior entries. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can fix the PRD, swap the stack, or re-scaffold mid-flight. If `/10x-rule-review` flags a `FAIL` you can't shrink your way out of, that often points back to ambiguous PRD or stack decisions — re-run the upstream skill rather than padding `AGENTS.md` with corrections. |

### How the chain hands off

- `/10x-agents-md` writes (or surgically updates) `AGENTS.md` at the resolved scope. Repo-level scope = the file lives at the repo root and frames the project as a whole; directory-level scope = the file lives next to the code it governs and reframes around the local unit, dropping repo-wide framing entirely. The skill never silently overwrites — it switches to an update flow when the target exists.
- `/10x-rule-review` reads any rules-for-AI markdown file you point it at and prints a 5-check scorecard (`OK` / `WARN` / `FAIL`) with concrete fixes. It does not depend on `/10x-agents-md` having run; you can review `.cursor/rules/`, copilot instructions, or a hand-written `CLAUDE.md` the same way.
- `/10x-lesson` self-bootstraps `context/foundation/lessons.md` on first use, then appends one Context/Problem/Rule/Applies-to entry per invocation. The file is consumed as a prior by the planning- and review-phase skills introduced later in the workflow — `/10x-frame`, `/10x-research`, `/10x-plan`, `/10x-plan-review`, `/10x-implement`, `/10x-impl-review`.

### What the lesson's skills capture (and what they do NOT)

- **`/10x-agents-md` captures**: project structure, build/test/lint commands actually present in scripts, commit conventions inferred from history, repo-specific tripwires the agent would otherwise miss, references to canonical files via `@`-paths instead of pasting their content. Directory-level scope additionally captures: local naming/layout patterns inferred from siblings, allowed/forbidden imports, the test pattern used by neighbours, and tripwires visible in the immediate area.
- **`/10x-agents-md` does NOT** paste in the contents of `tsconfig.json` / `eslint.config` / framework docs the agent already knows; it does NOT generate generic "write clean code" intentions; it does NOT replace the host's built-in `/init` when one exists — it's positioned as an alternative or fallback, not a default.
- **`/10x-rule-review` captures**: a length verdict (OK ≤ 200 non-empty lines, WARN 201–500, FAIL 501+), code/config blocks that should be `@`-references instead, vague-intention language, redundancy with framework docs the agent already has from training, and a Check 5 reorder proposal that surfaces critical rules to the top.
- **`/10x-rule-review` does NOT** edit the file by default; it does NOT score project content (architecture, stack choices) — it scores the rule artifact's condition; it does NOT generate a "fixed version" of the file (Check 5 may move sections with explicit approval, never rewrite rule wording).
- **`/10x-lesson` captures**: one entry per invocation with a short imperative H2 title (the title IS the rule), Context (subsystem / phase / file pattern, specific enough to pattern-match), Problem (what concretely breaks without the rule, ideally with a past incident), Rule (1–2 imperative sentences pasteable verbatim into a future review finding), Applies to (subset of `frame`, `research`, `plan`, `plan-review`, `implement`, `impl-review`, or `all`).
- **`/10x-lesson` does NOT** edit or remove existing lessons — the file is append-only by design (rewriting recurring rules without thought is the failure mode this convention prevents); it does NOT batch multiple rules per invocation; it does NOT pre-fill fields proactively (the user does the writing — that's the price of capturing rules outside a structured review).

### The inclusion test (the filter for AGENTS.md / CLAUDE.md)

Before you add a rule to any rules-for-AI file, ask: *could the agent know this without this file? Could public training data — books, blogs, repos in this stack — have prepared it for this?* If yes, drop it. If no, keep it. The file is onboarding for an agent that already knows TypeScript / Python / your framework but does NOT know your local conventions.

Belongs:
- non-obvious project conventions (error-response shape, file naming, allowed import paths)
- project-specific traps and "embarrassing" workarounds tied to history or dependency bugs
- referenced canonical files via `@`-paths (e.g. `@src/features/users/user.service.ts` as a pattern reference, not pasted code)

Does NOT belong:
- mainstream framework documentation
- README content the agent will read anyway (link with `@README.md`)
- popular generic advice ("use TypeScript strict mode") that's already enforced by config
- intention statements ("write clean code", "follow good practices") — convert to a checkable behaviour or drop

### U-shaped attention and granular rules

LLMs attend most strongly to the start and end of context (Lost-in-the-Middle / U-shaped attention). A long monolithic `CLAUDE.md` puts its middle rules in the weakest attention zone. Two practical consequences:

1. **Most important rules go to the top** of any rule file.
2. **Per-area rules belong next to their code** — nested `AGENTS.md` / `CLAUDE.md` inside `src/api/`, `.cursor/rules/*.mdc` with file globs, etc. Granular files are loaded selectively and arrive whole near the start of their own section, instead of being buried at line 400 of one big file.

`/10x-rule-review` Check 5 (reorder) operationalizes consequence (1); the inclusion test plus directory-level `/10x-agents-md` operationalizes consequence (2).

### The five-pattern calibration drill

Before writing a rule, validate that the agent actually breaks the convention without it. Pick one pattern from your project (error-response shape, file naming, import style, module structure, date handling). Then:

1. Ask the agent to implement against the pattern 3–5 times from a clean state, no rule.
2. Note where it broke the convention; capture run time, files explored, and visible cost/tokens if the host surfaces them.
3. Add a 1–3-sentence rule to the appropriate scope (root or area-level).
4. Re-run the same task in a fresh session and compare convention adherence, time, files, and iterations.

If the agent already trends toward the convention without the rule, you don't need the rule. If it systematically picks the wrong pattern, you've found a high-leverage rule to add. This drill is what "earning a rule from a recurring failure" actually looks like.

### Hierarchy and tool interop

- **Claude Code** loads `CLAUDE.md` from the user dir (`~/.claude/CLAUDE.md`), the repo root, and any subdirectory the agent works under. Deeper files override or supplement higher ones.
- **Codex** and **GitHub Copilot** load `AGENTS.md` from the current directory upward — closest file wins.
- One canonical file is preferable to three duplicates. A common pattern: `AGENTS.md` as source of truth, `CLAUDE.md` as a thin Claude-Code shim with `@AGENTS.md` import, `.github/copilot-instructions.md` only if Copilot needs its own additions. Symlink (`ln -s AGENTS.md CLAUDE.md`) is the simplest deduplication when tools require both names.
- Auto-memory (e.g. Claude Code's `~/.claude/projects/<dir-with-slashes-as-dashes>/memory/MEMORY.md`) is local to the machine and not a substitute for `AGENTS.md`. Team-binding rules live in the repo; auto-memory is a personal cache, periodically reviewable.

### Inner-loop hooks (deterministic feedback without prompting)

Mechanical, non-pickable checks belong in hooks (e.g. Claude Code's `PostToolUse`), not in the rule file. The agent finishes an edit; a formatter or fast lint runs; the result feeds back without you reminding it. Settings template (`settings.json.template`) ships in the lesson pack as the wiring entry point. Keep procedural workflows (deeper review, release checklist, deploy on sandbox) in skills, and reserve hooks for deterministic tool signals.

### Foundation paths used by this lesson

- `AGENTS.md` / `CLAUDE.md` (and per-area variants) — `/10x-agents-md` output
- `context/foundation/lessons.md` — `/10x-lesson` output (append-only register, consumed by future planning/review skills)
- `context/foundation/prd.md`, `context/foundation/tech-stack.md` — inputs from earlier lessons, still present
- `docs/reference/contract-surfaces.md` — load-bearing names registry (scaffolded by `/10x-init`)

### Universal language

The shipped skills carry no 10xDevs / cohort / certification references. `/10x-agents-md` discovers from the repo it's invoked in; `/10x-rule-review` is tool-agnostic and treats every file as "a rules-for-AI artifact"; `/10x-lesson` writes one entry shape regardless of project domain. The 5-pattern calibration drill is illustrative — substitute patterns from your own stack.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit — Module 1, Lesson 5

Pick a deployment platform and ship to production with the **infra chain**:

```
(/10x-init  →  /10x-shape  →  /10x-prd  →  /10x-tech-stack-selector  →  /10x-bootstrapper  →  /10x-agents-md  →  /10x-rule-review  →  /10x-lesson)  →  /10x-infra-research  →  Plan Mode deploy
```

The full Module 1 chain ships from Lessons 1–4 (re-included so you can fix any earlier contract mid-flight). `/10x-infra-research` is the lesson's main topic; the deploy step itself uses the host's built-in **Plan Mode** rather than a dedicated skill — the artifact (`context/deployment/deploy-plan.md`) is what carries forward.

### Task Router — Where to start

| Skill | Use it when |
| --- | --- |
| **Infrastructure (lesson focus)** | |
| `/10x-infra-research [path-to-tech-stack-or-prd]` | You have a `context/foundation/tech-stack.md` (and ideally a `prd.md`) and need to pick an MVP deployment platform. The skill loads the stack as a hard constraint, runs a 5-question developer interview (persistent connections, cost sensitivity, existing familiarity, global reach, co-location preference), spawns parallel subagent research across six candidate platforms, scores them Pass/Partial/Fail across the five agent-friendly criteria from `references/agent-friendly-criteria.md`, shortlists the top three, and runs a three-lens anti-bias cross-check on the leader (devil's advocate, pre-mortem, unknown unknowns) before writing `context/foundation/infrastructure.md`. Use AFTER `/10x-tech-stack-selector`, BEFORE `/10x-implement`. |
| **Deploy (host built-in, not a skill)** | |
| Plan Mode deploy | You have `infrastructure.md` + `tech-stack.md` and want a read-only plan reviewed before any mutation hits the platform. Activate the host's plan mode (Claude Code: `Shift+Tab` cycles default → auto-accept → plan; IDE: dedicated button) with the prompt "Wykonajmy pierwsze wdrożenie w oparciu o `@infrastructure.md`, zgodnie ze stackiem z `@tech-stack.md`". Read the plan, demand corrections, approve, then let the agent execute. The approved plan persists at `context/deployment/deploy-plan.md` so the next lesson's milestone planning can reference what's already deployed and which secrets are already wired. |
| **Re-run upstream if needed** | |
| `/10x-init` / `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-rule-review` / `/10x-lesson` / `/10x-stack-assess` / `/10x-health-check` | Bundled so you can patch any earlier contract mid-flight. If the anti-bias cross-check forces a platform swap that pushes a stack-shaped decision (e.g. "this DB doesn't fit any platform we'd accept"), re-run `/10x-tech-stack-selector` to keep `tech-stack.md` and `infrastructure.md` aligned. |

### How the chain hands off

- `/10x-infra-research` reads `context/foundation/tech-stack.md` (language, framework, runtime, database) as **hard constraints** — platforms that can't run the stack are dropped before scoring. It also reads `context/foundation/prd.md` (scale, latency, uptime expectations) as **soft weights** when scoring. Both inputs are optional but strongly recommended; without them the skill proceeds but warns.
- The skill writes `context/foundation/infrastructure.md` as the third foundation contract: frontmatter (`project`, `researched_at`, `recommended_platform`, `runner_up`, `context_type`, `tech_stack`) plus a body covering recommendation, full platform comparison with scoring matrix, anti-bias findings, operational story (preview / secrets / rollback / approval / logs), and a risk register tying every entry back to the lens that surfaced it. On collision the skill prompts: overwrite, save as `infrastructure-v2.md`, or abort.
- Plan Mode reads `infrastructure.md` and `tech-stack.md` together. The agent emits a step-by-step plan covering automated steps it owns, manual setup gates (account creation, secret configuration), exact deploy commands (Pages vs Workers commands are NOT interchangeable on Cloudflare — the plan must specify), and verification steps. The plan is rejected/edited until it's right; only then does Plan Mode exit and execution begin. The approved plan lands at `context/deployment/deploy-plan.md` and is consumed downstream by milestone-planning skills as ground truth for "what's already deployed".

### What the lesson's skills capture (and what they do NOT)

- **`/10x-infra-research` captures**: platform shortlist scored against five agent-friendly criteria (CLI quality, managed/serverless degree, agent-readable docs, stable/scriptable deploy API, MCP or first-class agent integration), three anti-bias outputs on the leader (numbered weaknesses, 150–200-word failure narrative, 3–5 unknown-unknowns), an operational story with one concrete answer per axis (not categories), and a risk register where every row names its source lens (`Devil's advocate` / `Pre-mortem` / `Unknown unknowns` / `Research finding`). Status of every non-GA feature is captured inline (`beta` / `preview` / `region-limited` / `deprecated`) with the date the status was checked.
- **`/10x-infra-research` does NOT** build Docker images or write Dockerfiles, configure CI/CD pipelines, or plan beyond MVP scope (multi-region HA is explicitly out of scope). It does NOT decide for you — the user accepts, swaps to runner-up, or aborts after the cross-check, and that decision is recorded in the output.
- **Plan Mode** captures: an explicit human gate between "agent has a plan" and "agent mutates production". The artifact (`deploy-plan.md`) is the audit trail for "what was supposed to happen" when the live run goes sideways. Plan Mode does NOT replace `/10x-infra-research` (the platform decision must already be made — Plan Mode plans the deploy, it doesn't pick where to deploy).

### The five agent-friendly criteria (and why they're load-bearing)

The criteria that make `/10x-infra-research`'s scoring matrix are not generic "good platform" axes — they're the specific traits that determine whether an agent can operate this platform from a session without you holding its hand:

1. **CLI-first** — every routine operation has a documented command; the agent doesn't need to click in a panel.
2. **Managed / serverless** — fewer moving pieces means fewer ways the agent (or you) breaks something the platform was supposed to handle.
3. **Agent-readable docs** — markdown / `llms.txt` / GitHub-hosted docs the agent can fetch and parse, not JS-rendered marketing pages.
4. **Stable, scriptable deploy API** — predictable exit codes, structured output, no interactive prompts mid-deploy.
5. **MCP server or first-class agent integration** — bonus, not required. CLI alone is fine for MVP; MCP earns its keep when the agent makes dozens of structured queries against live state.

Hard filters apply before scoring (persistent-connection requirement drops Netlify/Vercel serverless-only; tech-stack runtime mismatch drops the platform entirely). Interview answers reweight criteria after — cost sensitivity penalizes expensive base tiers, familiarity breaks ties, global-reach preference favours edge-native platforms, co-location preference favours integrated databases.

### Anti-bias as a decision discipline (not theatre)

Every research conversation with an LLM has a built-in tilt toward whatever the user already signalled. `/10x-infra-research` runs three structured lenses against the leader BEFORE the file is written, not after:

- **Devil's advocate** — *find the weaknesses, hidden costs, and failure modes specific to deploying `<this stack>` on `<this platform>`*. Output is a numbered list of 3–5 specifics, not categories.
- **Pre-mortem** — *six months later, this decision turned out to be a complete disaster; walk through the assumptions and underestimated risks that led there*. Output is a 150–200-word narrative; narratives surface concrete failure shapes that abstract risk lists hide.
- **Unknown unknowns** — *what's true about this combination that the marketing page and docs don't make obvious?* Output is 3–5 non-obvious risks.

After the cross-check the user has three real options: **proceed with the leader and absorb the risks into the register**, **swap to runner-up** (and re-run the cross-check on the new leader), or **swap to third place**. The third option is rare; if it never happens across many runs, the cross-check has degraded into a ritual and should be rewritten.

Two additional techniques (no skill required, raw prompts) belong in the same toolbox: forcing the model to compare three alternatives in a markdown table (structure beats "the same answer in different words"), and role-rotation (the same decision through a frontend dev's, security person's, and cost owner's eyes — surface the cost each role pays and propose alternatives if any of them flinch).

### CLI vs MCP for live-infra operability

After deploy, the agent needs a way to talk to the running platform. Two paths, complementary not competing:

- **CLI** (`wrangler`, `flyctl`, `vercel`, `gh`) — explicit and auditable, output stays in the terminal, safer defaults for irreversible actions (e.g. `netlify deploy` is draft by default; `--prod` must be passed). Best for MVP: minimal setup, low context cost (no tool schemas pre-loaded), and the agent has to know the command (which is where a per-tool skill helps).
- **MCP** — a dedicated server exposing structured tools with schemas (`pages_deployments_list`, etc.). Each connected MCP server adds tool definitions to the context window, so cost compounds across servers. Earns its keep when the agent makes many discovery-style queries against live state (logs, deployment diffs) and structured JSON beats parsing CLI output.

Sensible default: start with CLI, add MCP when you notice a recurring pattern of `--help` traversal the agent has to do to answer a class of questions. Anthropic's own [building-agents-that-reach-production](https://claude.com/blog/building-agents-that-reach-production-systems-with-mcp) framing is "API, CLI, and MCP are three complementary paths" — pick by task, not by hype.

### Production-access boundary (minimal permissions, human-on-irreversibles)

Both CLI and MCP can give the agent direct access to production. The lesson sets a default posture:

- **Tokens are scoped, not master keys.** On Cloudflare: an API token limited to Pages or Workers for one project, no DNS, no Workers Secrets for unrelated projects, no billing. AWS / GCP equivalent: scoped IAM role with `console-only-user` or read-only on production, full access on staging.
- **Tokens live in env vars, not in `.mcp.json` committed to the repo.** The agent picks them up via the MCP server or CLI's env-discovery, not via plaintext in conversation.
- **Destructive actions are human-only.** Drop a database, rotate a primary secret, delete a project — those are panel-by-hand operations, even if the agent suggests them. Manual click costs 30 seconds; cleanup after an automated mistake costs hours.

This is the MVP posture. As the project matures, the natural evolution is staging gets full agent access, production becomes read-only — covered in later modules.

### Foundation paths used by this lesson

- `context/foundation/tech-stack.md` — input (Lesson 2 hand-off, hard constraints)
- `context/foundation/prd.md` — input (Lesson 1 hand-off, soft weights)
- `context/foundation/infrastructure.md` — output (the third foundation contract)
- `context/deployment/deploy-plan.md` — output of Plan Mode deploy (audit trail of "what was supposed to happen")
- `context/foundation/lessons.md` — recurring rules & pitfalls (use `/10x-lesson` from Lesson 4 if you spot a class of agent failure during research or deploy)
- `docs/reference/contract-surfaces.md` — load-bearing names registry

### Universal language

The shipped skill carries no 10xDevs / cohort / certification references. The candidate platform list (Cloudflare, Vercel, Netlify, Fly.io, Railway, Render) is the starting research lens, not a recommendation set — the scoring + interview + cross-check pipeline is what's load-bearing, and a platform absent from the default list can be added by extending the research step. The five agent-friendly criteria are the artifact's true core; `/10x-infra-research` re-reads them from `references/agent-friendly-criteria.md` so they evolve as platforms do.

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->

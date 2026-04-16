# Harness — AI Implementation Team

Generic AI-driven development pipeline. 6 agents (Orchestrator, Coder, Tester, Reviewer, Integrator, Curator) collaborate on an arbitrary target project autonomously. The harness is project-agnostic; project-specific content (milestones, assets, agent prompt specializations, knowledge base) lives in the target repo, not here.

**Currently driving:** [Zombie Farm](https://github.com/V1ctor2182/zombie-farm-godot) (Godot 4.6.1). Full decoupling plan in [basic-doc/plan-harness-decoupling.md](./basic-doc/plan-harness-decoupling.md).

## Documentation

- [basic-doc/techdesign/](./basic-doc/techdesign/) — 5 techdesign docs covering architecture, execution, knowledge, failure modes, API contracts. Uses Zombie Farm as the running example project.
- [basic-doc/plan-harness-decoupling.md](./basic-doc/plan-harness-decoupling.md) — roadmap for making the harness fully project-agnostic.

## Rules

### Keep docs in sync

When you make a change that affects architecture, schemas, project structure, event formats, environment variables, or any other documented specification, update the relevant doc in the same task.

### Project conventions

- **Monorepo:** npm workspaces. `apps/server/` (Express), `apps/dashboard/` (Next.js), `packages/shared/` (types/constants)
- **Language:** TypeScript, strict mode
- **Agent prompts:** `agents/` directory at root — 6 markdown files defining each role. Each project can override these by shipping its own prompts in its repo (Phase D of the decoupling plan)
- **Knowledge base:** `knowledge/` directory — generic engineering practices. Project-specific knowledge (GDScript conventions, domain glossary) is expected to move into the target repo
- **Docker:** `docker/agent/` — base agent image with Claude Code CLI + tooling for the current target (currently Godot 4.6.1 + GUT 9.x + pr body helpers)
- **Database:** MongoDB name `harness`. Models in `apps/server/src/models/`
- **IDs:** `Cycle._id` is auto-incrementing integer, `Task._id` is `TASK-{padded number}`
- **Streaming:** Claude Code `stream-json` NDJSON output. Only complete messages persisted; `stream_event` deltas broadcast via SSE only
- **System prompts:** Passed to agents via `--system-prompt-file`, never as inline CLI args
- **Container labels:** All agent containers use `harness=agent` label for orphan recovery. Legacy `zombie-farm=agent` label is still scanned during orphan recovery for one release cycle.
- **Tests:** `apps/server/tests/` mirroring `src/` structure. NEVER colocate test files next to source files
- **Target repo:** configured via `GAME_REPO_LOCAL_PATH` (to be renamed `PROJECT_REPO_LOCAL_PATH` in Phase C). Harness reads milestones, assets, and agent prompt overrides from this path

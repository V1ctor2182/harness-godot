# Zombie Farm — AI Implementation Team

AI-driven game development pipeline for **Zombie Farm** (Godot 4.6.1). 6 agents (Orchestrator, Coder, Tester, Reviewer, Integrator, Curator) collaborate to implement the game autonomously.

## Documentation

- [architecture/](./architecture/) — 11 architecture docs covering dev cycle, phases, infrastructure, asset pipeline, feature rooms, knowledge evolution
- Game repo: `V1ctor2182/zombie-farm-godot` — Godot project + PRD + milestones

## Rules

### Keep docs in sync

When you make a change that affects architecture, schemas, project structure, event formats, environment variables, or any other documented specification, update the relevant doc in the same task.

### Project conventions

- **Monorepo:** npm workspaces. `apps/server/` (Express), `apps/dashboard/` (Next.js), `packages/shared/` (types/constants)
- **Language:** TypeScript, strict mode
- **Agent prompts:** `agents/` directory at root — 6 markdown files defining each agent's role
- **Knowledge base:** `knowledge/` directory — boot.md (system overview), conventions.md (GDScript standards), glossary.md (game + engine terms)
- **Docker:** `docker/agent/` — Godot 4.6.1 headless + Claude Code CLI + GUT 9.x + tools (gen_pr_body.py, validate_pr_body.py)
- **Database:** MongoDB. Models in `apps/server/src/models/` — includes Godot-specific TestResult and Screenshot collections
- **IDs:** `Cycle._id` is auto-incrementing integer, `Task._id` is `TASK-{padded number}`
- **Streaming:** Claude Code `stream-json` NDJSON output. Only complete messages persisted; `stream_event` deltas broadcast via SSE only
- **System prompts:** Passed to agents via `--system-prompt-file`, never as inline CLI args
- **Container labels:** All agent containers use `zombie-farm=agent` label for orphan recovery
- **Tests:** `apps/server/tests/` mirroring `src/` structure. NEVER colocate test files next to source files
- **Game code:** Agents clone `zombie-farm-godot` repo, write GDScript, run GUT tests via `godot --headless`
- **Godot version:** 4.6.1 locked across Docker, CI, and all environments

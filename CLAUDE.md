# Ludus — AI Implementation Team

Generic AI-driven development pipeline. 6 agents (Orchestrator, Coder, Tester, Reviewer, Integrator, Curator) collaborate on an arbitrary target project autonomously. Ludus is **project-agnostic** — all project-specific context comes from the target repo's `.ludus/project.yaml`.

**Currently driving:** [Zombie Farm](https://github.com/V1ctor2182/zombie-farm-godot) (Godot 4.6.1).

## Documentation

- [basic-doc/techdesign/](./basic-doc/techdesign/) — 8 techdesign docs (architecture, execution, knowledge, failure modes, API contracts, dashboard, known issues, **project setup**)
- [basic-doc/techdesign/08-project-setup.md](./basic-doc/techdesign/08-project-setup.md) — how to connect/setup a game project
- [basic-doc/plan-harness-decoupling.md](./basic-doc/plan-harness-decoupling.md) — decoupling roadmap (Phases A-G)

## Rules

### Keep docs in sync

When you make a change that affects architecture, schemas, project structure, event formats, environment variables, or any other documented specification, update the relevant doc in the same task.

### Project conventions

- **Monorepo:** npm workspaces. `apps/server/` (Express), `apps/dashboard/` (Next.js), `packages/shared/` (types/constants)
- **Language:** TypeScript, strict mode
- **Agent prompts:** `agents/` directory — 6 generic stub files. Project context auto-injected from `project.yaml` at spawn time (no prompt override mechanism)
- **Knowledge base:** Project knowledge lives in the target repo's `.ludus/rooms/` (Feature Room specs). The old `knowledge/` dir was removed during decoupling.
- **Docker:** `docker/agent/` — base agent image with Claude Code CLI
- **Database:** MongoDB name `ludus`. Models in `apps/server/src/models/`
- **IDs:** `Cycle._id` is auto-incrementing integer, `Task._id` is `TASK-{padded number}`
- **Streaming:** Claude Code `stream-json` NDJSON output. Only complete messages persisted; `stream_event` deltas broadcast via SSE only
- **System prompts:** Passed to agents via `--system-prompt-file`, never as inline CLI args
- **Container labels:** All agent containers use `ludus=agent` label for orphan recovery (legacy `harness=agent` still scanned one release for cleanup)
- **Tests:** `apps/server/tests/` mirroring `src/` structure. NEVER colocate test files next to source files
- **Target project:** configured via `PROJECT_REPO_LOCAL_PATH` env var. Ludus reads `.ludus/project.yaml` for identity + context, `.ludus/rooms/` for Feature Rooms, and `prd/` for product docs
- **Milestones:** Mongo-only (no yaml). Created by human or proposed by Orchestrator → confirmed from Inbox
- **The `.ludus/` contract:** `project.yaml` (identity) + `rooms/` (knowledge). Nothing else. Every path use goes through the `PROJECT_CONFIG_DIR` constant in `@ludus/shared` — don't hardcode `'.ludus'` in new code.

## Design System

Always read [DESIGN.md](./DESIGN.md) before making any visual or UI decisions. All font choices, colors, spacing, border radius, and aesthetic direction are defined there. Do not deviate without explicit user approval.

Direction: **Editorial Workbench** — Fraunces serif + Instrument Sans + JetBrains Mono, warm paper light mode default, burgundy + forest accents, hierarchical radius (pills round, cards 4-6px, inputs 3px), motion only when meaningful. In QA or design reviews, flag any code that drifts from DESIGN.md.

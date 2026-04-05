# Erika

Self-improving agentic development team. Agents write code that builds the system itself.

## Documentation

Read these before making changes:

- [docs/architecture.md](./docs/architecture.md) — Vision, principles, agent roles, development cycle, evaluation layers, technology decisions, v1 lessons
- [docs/project-structure.md](./docs/project-structure.md) — Monorepo directory tree and rationale
- [docs/schemas.md](./docs/schemas.md) — MongoDB collections, indexes, counter pattern, knowledge feedback loop
- [docs/streaming.md](./docs/streaming.md) — Claude Code stream-json schema, capture pipeline, event normalization, SSE protocol
- [docs/infrastructure.md](./docs/infrastructure.md) — Docker image, entrypoint, container lifecycle, error recovery, resource limits, environment variables, local development

## Rules

### Keep docs in sync

When you make a change that affects architecture, schemas, project structure, event formats, environment variables, or any other documented specification, you MUST update the relevant doc in the same task. Do not defer doc updates to a follow-up.

- New file, directory, or package → update `docs/project-structure.md`
- New or changed collection, field, or index → update `docs/schemas.md`
- New or changed event type, SSE format, or capture logic → update `docs/streaming.md`
- New or changed container config, CLI flag, or env var → update `docs/infrastructure.md`
- Changed design principle, agent role, or process → update `docs/architecture.md`

### Project conventions

- **Monorepo:** npm workspaces. `apps/server/` (Express), `apps/dashboard/` (Next.js), `packages/shared/` (types/constants)
- **Language:** TypeScript, strict mode
- **Agent prompts:** `agents/` directory at root (data files, not code)
- **Knowledge base:** `knowledge/` directory at root (static bootstrap files)
- **Docker:** `docker/` directory at root. Agent image is `node:22-slim` + Claude Code CLI
- **Database:** MongoDB standalone local instance. Mongoose models in `apps/server/src/models/`
- **IDs:** `Cycle._id` is auto-incrementing integer, `Task._id` is `TASK-{padded number}` — both via a `Counter` collection
- **Streaming:** Claude Code `stream-json` NDJSON output. Only complete messages persisted to MongoDB; `stream_event` deltas broadcast via SSE only
- **System prompts:** Passed to agents via `--system-prompt-file`, never as inline CLI args
- **Container labels:** All agent containers are created with `erika=agent` label for orphan recovery
- **Tests:** Top-level `apps/server/tests/` directory mirroring `src/` structure. NEVER colocate test files next to source files

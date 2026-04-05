# Coding Conventions

## Language and Style

- **TypeScript strict mode** — no implicit `any`, no unchecked index access
- **Node.js 22** — use built-in APIs when available (no lodash for what Node provides)
- **ES modules** with `.js` extensions in imports (TypeScript convention for Node16 module resolution)

## Naming

- Files: `kebab-case.ts` (e.g., `job-queue.ts`, `agent-run.ts`)
- Variables/functions: `camelCase`
- Types/interfaces: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Mongoose models: `PascalCase` + `Model` suffix (e.g., `CycleModel`, `TaskModel`)

## Project Structure

- Server code: `apps/server/src/`
- Server tests: `apps/server/tests/` (mirrors `src/` structure, NOT colocated)
- Dashboard code: `apps/dashboard/src/`
- Shared types: `packages/shared/src/`
- Agent prompts: `agents/` (data files, not code)
- Knowledge: `knowledge/` (static bootstrap files)
- Docker: `docker/`

## Patterns

- **Config**: all env vars parsed in `apps/server/src/config.ts` with defaults
- **Errors**: use typed errors from `apps/server/src/lib/errors.ts`
- **Models**: Mongoose schemas in `apps/server/src/models/`, one file per collection
- **IDs**: `Cycle._id` is auto-incrementing integer, `Task._id` is `TASK-{padded number}` via Counter collection
- **Timestamps**: use Mongoose `timestamps: true` where applicable, or explicit `Date` fields

## Git

- Branch naming: `task-{taskId}-{short-slug}` (e.g., `task-001-add-job-queue`)
- Commit messages: descriptive, focused on "why" not "what"
- One branch per task, one PR per task
- Never push directly to main

## What Not To Do

- Don't add dependencies without justification
- Don't refactor code outside your task scope
- Don't create utility abstractions for one-off operations
- Don't add error handling for impossible scenarios
- Don't write documentation files unless the task requires it

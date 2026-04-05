# Project Roadmap

Summary of all 10 bootstrap phases from `ROADMAP.md`. Each phase is a git commit boundary.

## Completion Legend

- **Complete** — all items checked off in ROADMAP.md; tagged commit exists
- **Complete (inline)** — items built as part of an earlier phase, noted in ROADMAP.md
- **In progress** — some items done; work ongoing via agent cycles

---

## Phase 1: Project Scaffold — `a94173a` — Complete

Set up the monorepo skeleton: npm workspaces, TypeScript base config, package stubs for `apps/server`, `apps/dashboard`, `packages/shared`, `.gitignore`, `.env.example`, and the initial Docker directory.

## Phase 2: Shared Types & Constants — `d31a0f4` — Complete

All TypeScript interfaces from `docs/schemas.md`, enums, status constants, timeout constants, and shared validation types for agent structured output.

## Phase 3: Database Layer — `cbed490` — Complete

MongoDB connection, all Mongoose models (Counter, Migration, Cycle, Task, AgentRun, AgentEvent, Job, KnowledgeFile, Control), atomic counter helpers, migration runner, and index definitions.

## Phase 4: Agent Definitions & Knowledge — `72b018c` — Complete

System prompts for orchestrator, coder, and reviewer (`agents/` directory). Bootstrap knowledge files: `knowledge/boot.md`, `conventions.md`, `glossary.md`.

## Phase 5: Core Services — `144a1d3` — Complete

Docker wrapper, context builder, container manager, stream capture + event normalization, agent spawner orchestration, polling job queue with slot pools, SSE manager, GitHub service.

## Phase 6: API Routes — `2150e19` — Complete

All REST endpoints: health, cycles, tasks, agent runs + events, jobs (approve/reject), knowledge CRUD, control (mode, spending, kill, overrides), SSE (global + per-agent with replay). Orphan recovery and spending reconciliation on startup.

## Phase 7+8: Dashboard — `2ea0315` — Complete

Next.js app with dark monospace theme. Navigation, SSE subscription hook, API client. Pages: main dashboard, cycles, tasks, agents list, agent detail with live stream viewer, jobs (approve/reject), knowledge browser, human review panel.

## Phase 9: Integration & Wiring — Complete (inline)

All items were built as part of earlier phases:

- Launcher end-to-end flow — Phase 5
- Cycle state machine (plan → implement → review → retrospect) — Phase 5 (advance-cycle handler)
- Orphaned container recovery — Phase 6
- Spending circuit breaker — Phase 5 (spawner)
- Conflict detection (pre-merge dry run) — Phase 5 (github.ts)
- Retry logic with context injection — Phase 5 (spawner + context-builder)

## Phase 10: Testing & CI — Complete

All items completed by agent cycles:

- [x] Test harness setup (Vitest) — `apps/server/vitest.config.ts` exists
- [x] Unit tests for critical paths — all tests in `apps/server/tests/` mirroring `src/` structure (NOT colocated with source)
- [x] GitHub Actions CI config — `.github/workflows/ci.yml` exists
- [x] Linting (ESLint + Prettier) — `eslint.config.mjs` and `.prettierrc` at repo root
- [x] Integration tests (container lifecycle, cycle transitions) — added in Cycle 7

---

The bootstrap roadmap is complete. All ten phases have been implemented. Future phases are agent-proposed — the orchestrator will plan new cycles based on retrospective findings, system needs, and emergent improvements. Phase numbering continues from 11 onward, authored by the orchestrator agent rather than the human bootstrapper.

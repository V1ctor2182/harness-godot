# Implementation Roadmap

Tracks bootstrap implementation progress. Each phase is a git commit boundary.

## Phase 1: Project Scaffold `a94173a`

- [x] Initialize git repo
- [x] Root package.json with npm workspaces
- [x] TypeScript base config
- [x] apps/server package + tsconfig
- [x] apps/dashboard package + tsconfig
- [x] packages/shared package + tsconfig
- [x] .gitignore, .env.example
- [x] Docker directory (Dockerfile, entrypoint.sh, docker-compose.yml)

## Phase 2: Shared Types & Constants `d31a0f4`

- [x] All TypeScript interfaces from schemas.md
- [x] Enums and constants (statuses, defaults, limits)
- [x] Shared validation types for agent structured output

## Phase 3: Database Layer `cbed490`

- [x] MongoDB connection + config module
- [x] All Mongoose models (Counter, Migration, Cycle, Task, AgentRun, AgentEvent, Job, KnowledgeFile, Control)
- [x] Counter helper (atomic ID generation)
- [x] Migration runner
- [x] Index definitions

## Phase 4: Agent Definitions & Knowledge `72b018c`

- [x] Orchestrator system prompt (agents/orchestrator.md)
- [x] Coder system prompt (agents/coder.md)
- [x] Reviewer system prompt (agents/reviewer.md)
- [x] Bootstrap knowledge files (knowledge/boot.md, conventions.md, glossary.md)

## Phase 5: Core Services `144a1d3`

- [x] Docker wrapper (lib/docker.ts)
- [x] Context builder (services/launcher/context-builder.ts)
- [x] Container manager (services/launcher/container.ts)
- [x] Stream capture + event normalization (services/launcher/stream-capture.ts)
- [x] Agent spawner orchestration (services/launcher/spawner.ts)
- [x] Job queue with slot pools (services/job-queue.ts)
- [x] SSE manager (services/sse-manager.ts)
- [x] GitHub service (services/github.ts)

## Phase 6: API Routes `2150e19`

- [x] Health endpoint (DB + Docker checks)
- [x] Cycles CRUD + auto-spawn orchestrator
- [x] Tasks CRUD with filters
- [x] Agent runs + events
- [x] Jobs (with approve/reject workflow)
- [x] Knowledge CRUD
- [x] Control (mode, spending, kill, overrides)
- [x] SSE endpoints (global + per-agent with replay)
- [x] Orphan recovery on startup
- [x] Spending reconciliation on startup

## Phase 7+8: Dashboard `2ea0315`

- [x] Next.js app with dark monospace theme
- [x] Layout, navigation
- [x] SSE subscription hook (global + per-agent)
- [x] API client
- [x] Main dashboard (mode, spending, active cycle, live events)
- [x] Cycles page (list + create)
- [x] Tasks page (sortable by status)
- [x] Agents page (list all runs)
- [x] Agent detail with live stream viewer
- [x] Jobs page with approve/reject
- [x] Knowledge browser with category filter
- [x] Human review panel

## Phase 9: Integration & Wiring

- [x] Launcher end-to-end flow (spawn -> stream -> collect -> cleanup) — built in Phase 5
- [x] Cycle state machine (plan -> implement -> review -> retrospect) — built in Phase 5 (advance-cycle handler)
- [x] Orphaned container recovery on startup — built in Phase 6
- [x] Spending circuit breaker — built in Phase 5 (spawner)
- [x] Conflict detection (pre-merge dry run) — built in Phase 5 (github.ts)
- [x] Retry logic with context injection — built in Phase 5 (spawner + context-builder)

## Phase 10: Testing & CI

- [x] Test harness setup (Vitest)
- [x] Unit tests for critical paths (job queue, stream capture, plan validation)
- [x] Integration tests (container lifecycle, cycle transitions)
- [x] GitHub Actions CI config
- [x] Linting (ESLint + Prettier)

---

The bootstrap roadmap is complete. All ten phases have been implemented. Future phases are agent-proposed — the orchestrator will plan new cycles based on retrospective findings, system needs, and emergent improvements.

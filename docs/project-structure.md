# Project Structure

npm workspaces monorepo. No build orchestrator — workspace linking is sufficient at this scale, and agents can introduce one later if they determine it is needed.

**Note:** The tree below is the target structure. During bootstrap, files are created incrementally — not all listed files exist yet. The structure is canonical; implementation fills it in.

```
erika/
├── package.json                  # Root workspace configuration
├── tsconfig.base.json            # Shared TypeScript config
├── README.md                     # Project overview and quick start
├── CLAUDE.md                     # Agent instructions and doc index
│
├── agents/                       # Agent role definitions (data, not code)
│   ├── orchestrator.md           # Orchestrator system prompt
│   ├── coder.md                  # Coder system prompt
│   ├── reviewer.md               # Reviewer system prompt
│   ├── curator.md                # Curator system prompt (knowledge inbox)
│   └── integrator.md             # Integrator system prompt (branch merging)
│
├── knowledge/                    # Static knowledge base (human-bootstrapped)
│   ├── boot.md                   # System overview — injected into every agent
│   ├── conventions.md            # Coding standards and conventions
│   ├── glossary.md               # Terminology reference
│   ├── cycle-9-retrospective.md  # Cycle 9 retrospective (TASK-040 through TASK-043)
│   ├── cycle-10-retrospective.md # Cycle 10 retrospective (TASK-044 through TASK-048)
│   ├── cycle-11-retrospective.md # Cycle 11 retrospective (TASK-049 through TASK-053)
│   ├── cycle-12-retrospective.md # Cycle 12 retrospective (TASK-054 through TASK-058)
│   ├── cycle-13-retrospective.md # Cycle 13 retrospective (TASK-059 through TASK-063)
│   ├── cycle-14-retrospective.md # Cycle 14 retrospective (TASK-064 through TASK-068)
│   ├── cycle-15-retrospective.md # Cycle 15 retrospective (TASK-069 through TASK-073)
│   ├── cycle-16-retrospective.md # Cycle 16 retrospective (TASK-074 through TASK-078)
│   ├── cycle-17-retrospective.md # Cycle 17 retrospective (TASK-079 through TASK-083)
│   ├── cycle-18-retrospective.md # Cycle 18 retrospective (TASK-084 through TASK-088)
│   ├── cycle-19-retrospective.md # Cycle 19 retrospective (TASK-089 through TASK-093)
│   ├── known-issues.md           # Acknowledged bugs, tech debt, and future work (updated each cycle)
│   └── knowledge-api.md          # Knowledge API endpoint reference (for agents/curator)
│
├── docs/                         # Design documentation
│   ├── architecture.md
│   ├── project-structure.md      # This file
│   ├── schemas.md
│   ├── streaming.md
│   └── infrastructure.md
│
├── .dockerignore                    # Shared Docker build exclusions
├── docker-compose.yml               # Full stack (MongoDB, server, dashboard, reloader)
│
├── docker/
│   ├── agent/
│   │   ├── Dockerfile            # Agent container image
│   │   └── entrypoint.sh        # Container entry script
│   └── reloader/
│       ├── Dockerfile            # Reloader sidecar image (docker:27-cli)
│       └── reload.sh            # Poll-based reload trigger script
│
├── apps/
│   ├── server/                   # Express backend
│   │   ├── package.json
│   │   ├── Dockerfile            # Multi-stage production build
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   ├── tests/                # Unit tests (mirrors src/ structure, NOT colocated)
│   │   │   ├── agents/           # Agent prompt regression tests
│   │   │   ├── routes/           # Route handler tests
│   │   │   ├── services/         # Service + launcher tests
│   │   │   └── prompts/          # Agent prompt regression tests (read agents/*.md files)
│   │   └── src/
│   │       ├── index.ts          # Entry: connect DB, start server, start job queue
│   │       ├── app.ts            # Express app, middleware, route registration
│   │       ├── config.ts         # Environment configuration with defaults
│   │       ├── routes/
│   │       │   ├── health.ts
│   │       │   ├── cycles.ts
│   │       │   ├── tasks.ts
│   │       │   ├── agents.ts
│   │       │   ├── jobs.ts
│   │       │   ├── knowledge.ts
│   │       │   ├── control.ts
│   │       │   ├── events.ts     # SSE endpoints
│   │       │   └── analytics.ts  # Analytics endpoints (spending aggregations)
│   │       ├── models/
│   │       │   ├── counter.ts
│   │       │   ├── cycle.ts
│   │       │   ├── task.ts
│   │       │   ├── agent-run.ts
│   │       │   ├── agent-event.ts
│   │       │   ├── job.ts
│   │       │   ├── knowledge-file.ts
│   │       │   └── control.ts
│   │       ├── migrations/
│   │       │   ├── 001-update-agent-container-setup.ts
│   │       │   ├── 002-archive-stale-container-knowledge.ts
│   │       │   ├── 003-cycle-9-retrospective.ts
│   │       │   ├── 004-cycle-11-retrospective.ts
│   │       │   ├── 005-cycle-12-retrospective.ts
│   │       │   ├── 006-cycle-13-retrospective.ts
│   │       │   ├── 007-cycle-14-retrospective.ts
│   │       │   ├── 008-cycle-15-retrospective.ts
│   │       │   ├── 009-knowledge-api-docs.ts
│   │       │   ├── 010-cycle-16-retrospective.ts
│   │       │   ├── 011-cycle-17-retrospective.ts
│   │       │   ├── 012-fix-migrations-registry.ts
│   │       │   ├── 013-cycle-18-retrospective.ts
│   │       │   ├── 014-cycle-19-retrospective.ts
│   │       │   ├── 015-populate-auto-approval-categories.ts
│   │       │   ├── 016-backfill-retrospectives.ts
│   │       │   └── 017-fix-knowledge-categories.ts
│   │       ├── services/
│   │       │   ├── launcher/
│   │       │   │   ├── spawner.ts          # Agent spawn orchestration
│   │       │   │   ├── container.ts        # Dockerode container operations
│   │       │   │   ├── stream-capture.ts   # Attach, parse, fan-out
│   │       │   │   └── context-builder.ts  # Build context payload for agents
│   │       │   ├── job-queue.ts            # Polling job queue with slot pools
│   │       │   ├── sse-manager.ts          # SSE connection and broadcast management
│   │       │   └── github.ts              # Git operations, PR creation, CI polling
│   │       └── lib/
│   │           ├── docker.ts           # Dockerode wrapper
│   │           ├── errors.ts           # Error types
│   │           └── seed-knowledge.ts   # Seed knowledge/ directory into MongoDB on startup
│   │
│   └── dashboard/                # Next.js frontend
│       ├── package.json
│       ├── Dockerfile            # Multi-stage production build (standalone output)
│       ├── tsconfig.json
│       ├── next.config.ts
│       └── src/
│           ├── app/
│           │   ├── layout.tsx
│           │   ├── page.tsx                  # Main dashboard
│           │   ├── cycles/
│           │   ├── tasks/[id]/
│           │   ├── agents/[id]/              # Agent detail with live stream
│           │   ├── jobs/
│           │   ├── knowledge/
│           │   ├── review/                   # Human review queue
│           │   └── control/                  # Operator control panel (mode, cap, message)
│           ├── components/
│           │   ├── agent-stream.tsx           # Live structured event feed
│           │   ├── task-board.tsx
│           │   ├── cycle-overview.tsx
│           │   ├── review-panel.tsx           # Diff, rationale, approve/reject
│           │   ├── knowledge-browser.tsx
│           │   └── cost-metrics.tsx
│           ├── hooks/
│           │   └── use-sse.ts                # SSE subscription hook
│           └── lib/
│               └── api.ts                    # Backend API client
│
└── packages/
    └── shared/                   # Types and constants shared across apps
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── types.ts
            └── constants.ts
```

## Rationale

- **`agents/` at root** — prompts are data, not application code. Versioned in the repo so agents can modify their own role definitions. Consumed by the launcher service, not built as an app.
- **`knowledge/` at root** — static bootstrap knowledge seeded by humans. Dynamic knowledge lives in MongoDB. These files are the seed from which the knowledge base grows.
- **`packages/shared/`** — shared TypeScript types and constants. Prevents duplication between server and dashboard without introducing a heavy shared library.
- **`docker/` at root** — all container and infrastructure configuration in one place.

# Changelog

All notable changes to the Harness system.

---

## 2026-04-15 — Dashboard Redesign + Project Decoupling

A single session that transformed the harness from a "Zombie Farm build tool" into a generic, reusable AI engineering team framework. 12 commits, ~8000 lines touched.

### Dashboard Redesign (Phase 1-3)

**Phase 1** `b30c751` — Navigation cleanup + Settings drawer
- Deleted 10 dead routes: `/agents`, `/tasks`, `/tests`, `/analytics`, `/jobs`, `/review`, `/milestones` (old hardcoded), `/assets` (old hardcoded), `/knowledge`, `/control`
- Replaced 12-item hardcoded nav → 5 main items + 2 tool icons (🔔 Inbox + ⚙ Settings)
- New UI primitives: Dialog (centered modal), Sheet (side drawer) built on existing radix-ui
- Settings drawer (right-side Sheet) replaces standalone `/control` page, triggered by ⚙ or ⌘,
- Extracted `AgentDetail` and `TaskDetail` into reusable components for Phase 2 drawers
- `useInboxBadge` hook with graceful fallback
- SSE event list extended with `inbox:new`, `inbox:resolved`, `milestone:updated`

**Phase 2** `c0f4043` — Home Bento + Cycle Team View + Inbox
- Home rewritten as 12-col CSS Grid Bento with 10 live tiles, each with popup preview + maximize drill-down
- PopupProvider context + PopupPreview Dialog primitive + popup renderers for cycle/inbox/rooms
- Cycle detail rewritten as Team View: 6-slot horizontal pipeline (multi-instance roles show ×N badge, running pulse, failed red border, arrow connectors). TasksPanel with per-task test summary. TestsPanel with dynamic layer grouping (no L1-L4 hardcoding). EventsLog collapsible footer. Agent + Task drawers via Sheet + URL query params
- Inbox page: two-pane mail view, type tabs (All/Approvals/Plan Q&A/Plan Review/PR Gate/Drafts/Next-cycle), per-type resolve forms, j/k keyboard nav
- Backend `/api/inbox`: union query over Job/Spec/Task (no new collection). Single resolve endpoint dispatches to existing handlers. SSE broadcasts for live badge

**Phase 3** `962e7bd` — Dynamic Milestones + Assets
- MilestoneModel + `seed-milestones.ts` reading from yaml (later superseded by Phase G)
- 16 M0-M15 yaml files in `seed-data/milestones/` (later moved out in Phase B)
- Asset scanner (`asset-scanner.ts`): filesystem walk with PNG dimension reader, SHA256, symlink rejection, 30s LRU cache
- Routes: `/api/milestones` (list/detail/sync), `/api/assets` (list/file-stream/metadata/rescan)
- `/milestones` page: roadmap bar + detail modal with cycles/specs
- `/assets` page: grid with real previews (pixelated `<img>`, native `<audio>`, dynamic `@font-face`)
- Home bento MilestonesTile + AssetsTile wired to real data
- New `GAME_REPO_LOCAL_PATH` env var

### Project Decoupling (Phase A-G)

**Phase A** `0ce60b8` — Rename zombie-farm → harness
- Docker compose `name: harness`, Mongo DB `harness`, container name prefix `harness-`, label `harness=agent`
- Package namespace `@harness/*` (server, dashboard, shared)
- `AGENT_CONTAINER_LABEL = 'harness'` + `LEGACY_AGENT_CONTAINER_LABEL` for backward compat
- `findOrphanedContainers()` scans both new and legacy labels
- Dockerfile git config: `harness-agent` / `agent@harness.local`
- CLAUDE.md + README.md reframed as "Harness — generic AI team"

**Phase B** `b8d2595` — Move project content out
- `seed-data/milestones/` + `seed-data/assets/` + `knowledge/{boot,conventions,glossary}.md` moved to `migrations/zombie-farm-godot/.harness/` staging
- `seed-data/` directory deleted
- `rooms/10-game-rooms/` deleted (project feature rooms belong in game repo)
- Server code updated: `seed-milestones.ts` and `asset-scanner.ts` read only from `$PROJECT_REPO_LOCAL_PATH/.harness/`, no harness-local fallback

**Phase C** `74d871b` — Project config loader + empty state
- `project-config.ts`: reads `$PROJECT_REPO_LOCAL_PATH/.harness/project.yaml`, zod-validates, caches in-memory
- `GET /api/project` + `POST /api/project/reload` endpoints
- Cycle creation returns 409 (`no_project_loaded`) when no project configured
- Dashboard: project badge in top nav (green when loaded, red when not), Project card in Settings drawer with Reload button, `NoProjectEmptyState` component
- `PROJECT_REPO_LOCAL_PATH` env var (with `GAME_REPO_LOCAL_PATH` as deprecated alias)

**Phase D** `39cdcd7` — Generic agent prompts
- All 6 agent prompts rewritten as minimal generic stubs (~350 LOC total, down from ~1185 LOC)
- No Godot, GUT, GDScript, or zombie references in prompts
- Spawner `resolveAgentPromptPath()` prefers `$PROJECT_REPO_LOCAL_PATH/.harness/agents/<role>.md`, falls back to harness stubs
- Original Godot prompts staged in migration payload

**Phase G** `2d44ce8` `f056738` — `.harness/` rearchitecture
- **Prompt injection replaces override**: deleted `resolveAgentPromptPath()`. New `buildProjectContextSection()` appends project.yaml fields (engine, language, conventions, paths) to every agent prompt. Harness always owns prompts
- **Dual-source room scanning**: `seedRooms()` now scans `$PROJECT_REPO_LOCAL_PATH/.harness/rooms/` after harness rooms. Supports `_tree.yaml` or flat-scan mode. Project room ID convention: `p-` prefix
- **Milestone rearchitecture**: deleted `seed-milestones.ts` entirely. Milestones are Mongo-only, created via CRUD API (`POST/PATCH/DELETE /api/milestones`, `POST /milestones/:id/confirm`). `proposed` status for Orchestrator suggestions. `milestone_proposal` Inbox item type
- **Project init endpoint**: `POST /api/project/init` auto-detects engine from marker files (project.godot, Cargo.toml, package.json, go.mod, pyproject.toml), scaffolds `.harness/project.yaml` + `.harness/rooms/` + `prd/README.md`
- **`/setup` page**: two-tab onboarding flow (Create New / Connect Existing). Path input → auto-detect → scaffold → reload → redirect to Home
- **Milestones management UI**: "New Milestone" button + create form. Proposed milestones show dashed border + "Proposed by Orchestrator" badge + confirm/reject buttons
- **Migration payload slimmed**: deleted agents/, knowledge/, milestones/, assets-planned.json from staging. Payload is now just `project.yaml` + `rooms/` + `prd/README.md`
- **New techdesign doc**: [08-project-setup.md](basic-doc/techdesign/08-project-setup.md) — `.harness/` contract, `project.yaml` schema, setup flow, milestone lifecycle, Feature Rooms, prompt injection, first-cycle bootstrap, migration guide
- **project-config.ts schema simplified**: removed `paths.agents/knowledge/milestones/assets_registry`, added `conventions` + `prd_path`

### Commit-Sync: Spec Updates

`962e7bd` (amended) — Dashboard redesign specs recorded via commit-sync skill:
- 4 existing intent specs upgraded draft → active with anchors (dashboard epic, live-stream, review-panel/inbox, analytics/home-bento)
- 8 new specs created: 4 decisions (bento-popup, inbox-aggregation, dynamic-milestones, dynamic-assets) + 3 contracts (API inbox, milestones, assets) + 1 change record
- All 4 room.yaml files flipped lifecycle: planning → active
- 4 progress.yaml files populated with milestones + commit records
- 00-project-room/progress.yaml updated with epic completion

---

## 2026-04-08 — Harness Improvement Milestones M0-M7

Prior to the redesign session:

- **M0**: Room + Spec data foundation + SSE replay
- **M1**: Room-aware Context Builder with Spec hierarchy
- **M2**: Plan Review, Q&A flow, Curator upgrade to curate-specs
- **M3**: Dashboard Rooms page, Tests page rewrite, API client
- **M4**: Dashboard Q&A form, Plan Review UI, operationMode, Events Log
- **M5**: Retry backoff, container health checks, error classification
- **M6**: Discord webhook notifications for critical system events
- **M7**: Analytics, startup recovery, KnowledgeFile migration, cleanup

---

## 2026-04-04 — Initial Bootstrap (Phases 1-10)

Original 10-phase bootstrap of the harness system:
1. Project scaffold (npm workspaces, TypeScript, Docker)
2. Shared types & constants
3. Database layer (MongoDB, Mongoose models)
4. Agent definitions & knowledge
5. Core services (spawner, job queue, SSE, GitHub)
6. API routes (cycles, tasks, agents, jobs, control, events)
7. Dashboard (Next.js, dark theme, SSE hooks, all pages)
8. Integration & wiring
9. Testing & CI (Vitest, GitHub Actions)

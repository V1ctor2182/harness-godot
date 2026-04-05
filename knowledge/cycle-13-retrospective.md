# Cycle 13 Retrospective — SSE Fixes, Knowledge Sync, and Dashboard Improvements

**Date completed:** 2026-03-10
**Tasks:** TASK-059 through TASK-063 (5 tasks merged, all completed)
**Outcome:** 5 branches merged cleanly, tests grew from 253 to 254

## What Was Built

### TASK-059 — Cycle 12 retrospective knowledge file and migration (chore)

Created `knowledge/cycle-12-retrospective.md` documenting all five Cycle 12
tasks (TASK-054 through TASK-058). Created migration
`apps/server/src/migrations/005-cycle-12-retrospective.ts` to seed the
retrospective into MongoDB as a `retrospective` knowledge file via idempotent
upsert. Updated `docs/project-structure.md` to list the new knowledge and
migration files.

Files changed: `knowledge/cycle-12-retrospective.md`,
`apps/server/src/migrations/005-cycle-12-retrospective.ts`,
`docs/project-structure.md`

### TASK-060 — Fix stale SSE Event Reference knowledge file (bug, knowledge)

Corrected the `knowledge/sse-events.md` file which contained two stale claims:
it incorrectly stated `agent:error` was absent from the `SSEEventType` union
(it was added in Cycle 9), and it was missing documentation for the `job:failed`
event. Created migration `apps/server/src/migrations/005-fix-sse-events-knowledge.ts`
to sync the corrected on-disk content into the MongoDB knowledge copy, since
`seed-knowledge.ts` uses `$setOnInsert` and would not update existing documents.

Files changed: `knowledge/sse-events.md`,
`apps/server/src/migrations/005-fix-sse-events-knowledge.ts`

### TASK-061 — Emit task:status_changed when task transitions to in-progress (bug)

All other task status transitions already emitted `task:status_changed` SSE
events, but the `in-progress` transition when a coder agent was spawned was
missing the broadcast. Added the missing `broadcast('task:status_changed', ...)`
call in `apps/server/src/services/launcher/spawner.ts` immediately after the
task status is set to `in-progress`. Added a test asserting that
`task:status_changed` with `status: 'in-progress'` is broadcast when a coder
agent is spawned for a task.

Files changed: `apps/server/src/services/launcher/spawner.ts`,
`apps/server/tests/services/launcher/spawner.test.ts`

### TASK-062 — Handle job:failed SSE event and display failedReason on jobs page (bug, dashboard)

The jobs page only reacted to `job:requires_approval` SSE events, so the list
did not update when the stale-job detector marked a job as failed. Added
`job:failed` to the SSE event handler so the list re-fetches on job failure.
Also added `failedReason` to the `Job` interface and displayed it as subtext in
the Status cell so operators can see why a job failed without navigating away.

File changed: `apps/dashboard/src/app/jobs/page.tsx`

### TASK-063 — Add task progress summary and spending bar to home dashboard (feature, dashboard)

When an active cycle exists, the home dashboard now fetches its tasks and
displays a task progress summary (e.g. `2/5 tasks done`) that updates live on
`task:status_changed` SSE events. Added a colour-coded horizontal progress bar
to the Spending card when a spending cap is configured, giving operators
immediate visual feedback on budget consumption.

File changed: `apps/dashboard/src/app/page.tsx`

## Key Outcomes

- SSE `task:status_changed` event now fires for all task status transitions
  including `in-progress`, completing the event coverage
- Jobs page and home dashboard react to additional SSE events (`job:failed`,
  `task:status_changed`) for a more reactive operator experience
- Stale `agent:error` claim in the SSE Event Reference knowledge file corrected
  and synced to MongoDB; `job:failed` event documented
- Test count grew from 253 to 254
- All 5 task branches merged cleanly with no conflicts

# Cycle 15 Retrospective — Retrospective Migration, SSE Bug Fix, Tests, and Dashboard UX

**Date completed:** 2026-03-11
**Tasks:** TASK-069 through TASK-073 (5 tasks merged, all completed)
**Outcome:** 5 branches merged cleanly, tests grew from 488 to 496

## What Was Built

### TASK-069 — Cycle 14 retrospective knowledge file and migration (chore)

Created `knowledge/cycle-14-retrospective.md` documenting all five Cycle 14
tasks (TASK-064 through TASK-068). Created migration
`apps/server/src/migrations/007-cycle-14-retrospective.ts` to seed the
retrospective into MongoDB as a `retrospective` knowledge file via idempotent
upsert. Updated `docs/project-structure.md` to list the new knowledge and
migration files.

Files changed: `knowledge/cycle-14-retrospective.md`,
`apps/server/src/migrations/007-cycle-14-retrospective.ts`,
`docs/project-structure.md`

### TASK-070 — Fix home dashboard missing cycle:failed SSE handler (bug, dashboard)

The home dashboard Active Cycle card had no handler for `cycle:failed` SSE
events, so the card would remain stale when a cycle failed (showing the
previous active cycle until a manual reload). Added `cycle:failed` alongside
the existing `cycle:completed` handler to trigger a `listCycles()` re-fetch.
Also immediately clears `cycleTasks` on cycle end so the task progress summary
(e.g. `2/5 tasks done`) disappears without waiting for the API round-trip.

File changed: `apps/dashboard/src/app/page.tsx`

### TASK-071 — Unit tests for migration-runner.ts (test)

Added 191 lines of unit tests in `apps/server/tests/lib/migration-runner.test.ts`
covering all branching logic in the migration runner. Tests cover: early return
when migrations directory is missing, empty directory no-op, all-applied
migrations skip, single pending migration (`up()` called and recorded), multiple
files in sorted order, partial skip of already-applied migrations, `up()` error
propagation, and filtering of `.d.ts` and non-`.ts` files. All `fs`,
`MigrationModel`, and dynamic `import()` calls are mocked — no real filesystem
or database access. Test count grew from 488 to 496.

File created: `apps/server/tests/lib/migration-runner.test.ts`

### TASK-072 — Add Retries column to tasks list page (feature, dashboard)

Added a Retries column to the tasks page
(`apps/dashboard/src/app/tasks/page.tsx`) that shows a colored badge for tasks
that have been retried. The badge is yellow for `retryCount=1` and red for
`retryCount>=2`, and is hidden entirely when `retryCount` is `0` or `undefined`,
helping operators spot struggling tasks at a glance without cluttering the table.

File changed: `apps/dashboard/src/app/tasks/page.tsx`

### TASK-073 — Add expand/collapse acceptance criteria to cycle detail page (feature, dashboard)

Added an inline expand/collapse toggle to each task row in the cycle detail
page (`apps/dashboard/src/app/cycles/[id]/page.tsx`). Each task row now has a
chevron button that reveals the task's acceptance criteria as a bulleted list —
collapsed by default to keep the table compact. Tasks with no acceptance
criteria hide the toggle entirely. Previously operators had to navigate to each
individual task to read its criteria.

File changed: `apps/dashboard/src/app/cycles/[id]/page.tsx`

## Key Outcomes

- Home dashboard now reacts to `cycle:failed` SSE events, keeping the Active
  Cycle card accurate without manual refresh
- Migration runner now has full unit test coverage
- Tasks page shows retry counts so operators can identify struggling tasks
- Cycle detail page surfaces acceptance criteria inline, reducing navigation
  overhead during review
- All 5 task branches merged cleanly with no conflicts

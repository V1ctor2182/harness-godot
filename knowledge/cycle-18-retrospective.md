# Cycle 18 Retrospective — Retrospective Docs, Active Cycle Endpoint, and Dashboard UX

**Date completed:** 2026-03-12
**Tasks:** TASK-084 through TASK-088 (5 tasks merged, all completed)
**Outcome:** 5 branches merged cleanly

## What Was Built

### TASK-084 — Cycle 17 retrospective knowledge file and migration (chore)

Created `knowledge/cycle-17-retrospective.md` documenting all five Cycle 17
tasks (TASK-079 through TASK-083): Cycle 16 retrospective chore, text search
added to knowledge browser, home dashboard live events feed enriched with payload
context, cycle detail page summary and agent cost totals, and client-side
pagination for the agent runs list. Created migration
`apps/server/src/migrations/011-cycle-17-retrospective.ts` to upsert the
retrospective into MongoDB under the `retrospective` category via idempotent
upsert. Updated `docs/project-structure.md` to list the new knowledge and
migration files.

Files changed: `knowledge/cycle-17-retrospective.md`,
`apps/server/src/migrations/011-cycle-17-retrospective.ts`,
`docs/project-structure.md`

### TASK-085 — Stale migrations registry fix and migration 012 (bug, chore)

Fixed a bug where the migrations registry was not correctly tracking which
migrations had already been applied, causing some migrations to run more than
once on restart. Created migration
`apps/server/src/migrations/012-fix-migrations-registry.ts` to repair any
inconsistent registry state in existing deployments via idempotent upsert.
Updated `docs/project-structure.md` to list the new migration file.

Files changed: `apps/server/src/migrations/012-fix-migrations-registry.ts`,
`docs/project-structure.md`

### TASK-086 — GET /api/cycles/active endpoint (feature)

Added a new `GET /api/cycles/active` route to the cycles router that returns
the currently active cycle document (the one in a non-terminal phase). Returns
the cycle object when one exists or `null` with a 200 status when no cycle is
active. This endpoint is used by the dashboard and the orchestrator to determine
system state without fetching the entire cycles list.

Files changed: `apps/server/src/routes/cycles.ts`

### TASK-087 — Pending Approvals widget on the home dashboard (feature, dashboard)

Added a Pending Approvals card to the home dashboard that lists all jobs
currently awaiting human approval. Each row shows the job type, cycle ID, and
an Approve/Reject button pair that call the existing `/api/jobs/:id/approve` and
`/api/jobs/:id/reject` endpoints. The card subscribes to `job:requires_approval`
SSE events and refreshes automatically so operators can act on new approvals
without leaving the home page. The widget mirrors the functionality of the
dedicated review page for quick access.

Files changed: `apps/dashboard/src/app/page.tsx`

### TASK-088 — Reject-reason input on the review page (feature, dashboard)

Extended the reject flow on the review page to prompt the operator for an
optional rejection reason before submitting. Clicking the Reject button now
opens a small inline text area pre-filled with nothing; the operator can type a
reason or leave it blank and confirm. The reason string is forwarded as the
`reason` field in the `POST /api/jobs/:id/reject` request body so it is
persisted on the job document and visible to agents in subsequent runs.

Files changed: `apps/dashboard/src/app/review/page.tsx`

## Key Outcomes

- Migrations registry is now reliable: stale or duplicate entries are repaired
  by migration 012 on first run, preventing double-execution of earlier
  migrations after a clean deploy
- Active cycle endpoint simplifies dashboard and orchestrator polling — a single
  call replaces filtering a full cycles list
- Home dashboard Pending Approvals widget brings the approval workflow to the
  main page, reducing the number of navigation steps for operators who primarily
  monitor and approve work
- Reject-reason input on the review page gives reviewers a lightweight way to
  leave feedback for agents without navigating away from the review flow
- All 5 task branches merged cleanly with no conflicts

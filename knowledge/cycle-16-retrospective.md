# Cycle 16 Retrospective — Knowledge Base Documentation and API Improvements

**Date completed:** 2026-03-12
**Tasks:** TASK-074 through TASK-078 (5 tasks merged, all completed)
**Outcome:** 5 branches merged cleanly

## What Was Built

### TASK-074 — Cycle 15 retrospective knowledge file and migration (chore)

Created `knowledge/cycle-15-retrospective.md` documenting all five Cycle 15
tasks (TASK-069 through TASK-073): Cycle 14 retrospective chore, home dashboard
`cycle:failed` SSE fix, migration-runner unit tests, tasks page Retries column,
and cycle detail acceptance criteria expand/collapse. Created migration
`apps/server/src/migrations/008-cycle-15-retrospective.ts` to seed the
retrospective into MongoDB as a `retrospectives` knowledge file via idempotent
upsert. Updated `docs/project-structure.md` to list the new knowledge and
migration files.

Files changed: `knowledge/cycle-15-retrospective.md`,
`apps/server/src/migrations/008-cycle-15-retrospective.ts`,
`docs/project-structure.md`

### TASK-075 — Knowledge API documentation and migration (chore)

Created `knowledge/knowledge-api.md` documenting all four `/api/knowledge`
endpoints (GET /, GET /by-id, POST /, PATCH /by-id) with required fields,
valid categories, ID conventions, and snippet field usage. Created migration
`apps/server/src/migrations/009-knowledge-api-docs.ts` to upsert the document
into MongoDB under the `specs` category as `specs/knowledge-api.md`. Updated
`docs/project-structure.md` to list both new files.

Files changed: `knowledge/knowledge-api.md`,
`apps/server/src/migrations/009-knowledge-api-docs.ts`,
`docs/project-structure.md`

### TASK-076 — Knowledge API improvements — auto-snippet, full PATCH support, retrospectives category (feature)

Made `snippet` optional in the POST `/api/knowledge` request schema — when
omitted, the server auto-derives it from the first 150 non-blank characters of
`content`, eliminating a common agent error where the API returned an opaque 500
instead of auto-filling the field. Extended the PATCH `/api/knowledge/by-id`
schema to allow updating `content`, `title`, and `snippet` in addition to
`status`. Added `retrospectives` as a valid category to the Zod route schema,
the `KnowledgeCategory` shared type union, and the Mongoose enum. Added three
new tests: POST without snippet (auto-derived), PATCH with content, and POST
with category `retrospectives`.

Files changed: `apps/server/src/models/knowledge-file.ts`,
`apps/server/src/routes/knowledge.ts`,
`apps/server/tests/routes/knowledge.test.ts`,
`packages/shared/src/types.ts`

### TASK-077 — Review page: expandable acceptance criteria rows and job:failed SSE handler (feature, dashboard)

Added `acceptanceCriteria` field to the `Task` interface fetched on the review
page so criteria are available alongside task data when tasks enter the
`in-review` state. Added an expandable row toggle (chevron button plus click on
row) that reveals the task's acceptance criteria as a numbered list inline —
collapsed by default to keep the list compact. Added a `job:failed` SSE handler
that calls `fetchPendingJobs()` so stale approval requests that have timed out
are removed from the pending list without requiring a manual page reload.

Files changed: `apps/dashboard/src/app/review/page.tsx`

### TASK-078 — Status filter added to agents list page (feature, dashboard)

Added a Status dropdown filter alongside the existing Role and Cycle filters on
the agents list page. The filter offers values: all, running, starting,
completed, failed, timeout, killed. The selection is persisted in the URL query
string (`?status=…`) so the view is bookmarkable, applied client-side to the
runs array, and selecting `all` removes the param from the URL entirely. The
result count reflects all active filters combined.

Files changed: `apps/dashboard/src/app/agents/page.tsx`

## Key Outcomes

- Knowledge base now has a full API reference document (`knowledge-api.md`)
  seeded from migration 009, giving agents reliable documentation for
  interacting with the knowledge API
- Knowledge API is more robust: auto-snippet derivation eliminates confusing
  500 errors for missing snippets, full PATCH support allows agents to update
  document content and titles, and the `retrospectives` category is now a valid
  first-class value throughout the stack
- Review page surfaces acceptance criteria inline with expand/collapse, reducing
  navigation overhead during human review; stale `job:failed` events now clean
  up the pending approvals list automatically
- Agents list page gains a status filter, completing the trio of role, cycle,
  and status controls for narrowing agent run listings
- All 5 task branches merged cleanly with no conflicts

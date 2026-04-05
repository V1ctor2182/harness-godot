# Known Issues and Future Work

This document tracks acknowledged bugs, tech debt, and planned improvements that
are not yet scheduled in a cycle. Updated by the curator agent as patterns emerge.

**Last updated:** 2026-03-24 (Cycle 33)

## Recurring Patterns Flagged by Agents

### Retrospective chore is a recurring low-value task

Every cycle begins with a "Cycle N retrospective knowledge file and migration"
chore task. Cycle 21 (TASK-099) automated this: the server now auto-generates
retrospective knowledge files at cycle completion via `job-queue.ts`. Future
orchestrators should NOT plan a retrospective chore task unless something
specific needs custom documentation.

### Orchestrator requests GitHub issues/bugs but cannot access them

The orchestrator repeatedly asks for a "known bugs" or "GitHub issues" list but
has no live GitHub access. This document is the designated substitute. The
orchestrator prompt (updated in Cycle 21, TASK-101) now explicitly references
this file via cycle history analysis.

## Open Tech Debt

## Resolved (Cycle 23)

### Auto-approval list was empty ✓

The `autoApprovalCategories` field in the Control document schema previously
defaulted to `[]`. Fixed in Cycle 23: the schema default now includes all five
task categories: `["feature", "bug", "chore", "refactor", "test"]`.
New Control singletons are created with auto-approval enabled for all types.

## Resolved (Cycle 26)

### Retrospective auto-generation is unreliable ✓

The auto-generation logic added in Cycle 21 was not reliably seeding
retrospective knowledge files (cycles 21, 22, 23, and 25 were missing from the
`retrospectives` category in MongoDB). Fixed in Cycle 26: `generateCycleRetrospective`
in `job-queue.ts` was updated with idempotent upsert logic, a backfill migration
seeded the missing entries, and the function is now covered by tests in
`job-queue.test.ts`.

## Resolved (Cycle 28)

### Knowledge disk/DB sync ✓

Static files in `knowledge/` were not automatically synced to MongoDB when
updated on disk — agents had to PATCH the DB copy manually or via migration.
Resolved: `seed-knowledge.ts` has handled disk→DB sync since at least Cycle 27.
On startup it reads each `.md` file, compares content to the DB copy, and upserts
if content has changed (lines 114–125 of `seed-knowledge.ts`). No manual DB
PATCH is needed when updating knowledge files on disk.

## Resolved (Cycle 33)

### No structured cycle goal tracking ✓

`Cycle.goal` is set from the orchestrator output but there was no retrospective
linkage between goal and outcome. Resolved in Cycle 33: `CycleMetrics` now
includes `goalCoverage` (added in earlier cycles to measure task-to-goal
alignment) plus two new fields — `tasksRetried` and `tasksPassedFirstReview` —
that track review quality over time. Together these provide automated cycle
quality evaluation. The orchestrator context builder injects a cycle history
breakdown using these metrics so future orchestrators can reason about review
quality trends when planning.

#### Review quality tracking mechanism

`tasksRetried` counts tasks that required at least one retry (coder failed review
and was sent back). `tasksPassedFirstReview` counts tasks that were approved on
the first reviewer pass. These fields are computed by `computeCycleMetrics` in
`apps/server/src/services/job-queue.ts` and stored on the `Cycle.metrics`
document at cycle completion.

## Future Work Ideas

- Agent output quality metrics: track reviewer scores over time
- Auto-pruning of low-quality knowledge files (qualityScore < -2 for 3+ cycles)

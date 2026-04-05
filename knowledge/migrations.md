# Migrations

Migration files live in `apps/server/src/migrations/` and follow the naming convention `{NNN}-{slug}.ts`. Each file exports an `async up()` function.

Migrations are not run automatically — they must be triggered manually or by the migration runner.

## Migration Registry

| Number | File                                       | Description                                                                                                                                                                          |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 001    | `001-update-agent-container-setup.ts`      | Overwrites the `specs/agent-container-setup.md` knowledge document with the current on-disk file content                                                                             |
| 002    | `002-archive-stale-container-knowledge.ts` | Archives knowledge documents containing outdated claims that `gh` (GitHub CLI) is NOT installed — contradicted by the Dockerfile which explicitly installs `gh`                      |
| 003    | `003-cycle-9-retrospective.ts`             | Upserts the Cycle 9 retrospective into MongoDB and patches the SSE Event Reference knowledge document to add `cycle:completed` and `cycle:failed` event documentation                |
| 004    | `004-cycle-11-retrospective.ts`            | Upserts the Cycle 11 retrospective knowledge document into MongoDB under `retrospectives/cycle-11.md`                                                                                |
| 005    | `005-cycle-12-retrospective.ts`            | Upserts the Cycle 12 retrospective knowledge document into MongoDB under `retrospectives/cycle-12.md`                                                                                |
| 005    | `005-fix-sse-events-knowledge.ts`          | Patches the SSE Event Reference knowledge document in MongoDB to match the on-disk version (fixes stale content from `$setOnInsert`-only seeding; also documents `job:failed` event) |
| 006    | `006-cycle-13-retrospective.ts`            | Upserts the Cycle 13 retrospective knowledge document into MongoDB under `retrospectives/cycle-13-retrospective.md`                                                                  |
| 007    | `007-cycle-14-retrospective.ts`            | Upserts the Cycle 14 retrospective knowledge document into MongoDB under `retrospectives/cycle-14-retrospective.md`                                                                  |
| 008    | `008-cycle-15-retrospective.ts`            | Upserts the Cycle 15 retrospective knowledge document into MongoDB under `retrospectives/cycle-15-retrospective.md`                                                                  |
| 009    | `009-knowledge-api-docs.ts`                | Upserts the Knowledge API reference document into MongoDB under `specs/knowledge-api.md`                                                                                             |
| 010    | `010-cycle-16-retrospective.ts`            | Upserts the Cycle 16 retrospective knowledge document into MongoDB under `retrospective/cycle-16`                                                                                    |
| 011    | `011-cycle-17-retrospective.ts`            | Upserts the Cycle 17 retrospective knowledge document into MongoDB under `retrospective/cycle-17`                                                                                    |

> **Note:** Two files share the `005` prefix due to a naming conflict introduced during Cycle 12. This is a known issue — future migrations must use the next available number (see below).

## Next Available Number

**012**

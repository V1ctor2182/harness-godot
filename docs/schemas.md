# MongoDB Schemas

Seven collections, plus `Counter` and `Migration` utility collections. All interfaces below map directly to Mongoose model definitions.

**MongoDB runs as a standalone local instance.** No replica set, no change streams, no multi-document transactions. The job queue is purely polling-based (see [Job](#job)). This is the simplest viable setup for local development; replica sets can be introduced later if change streams or transactions prove necessary.

**Authentication** is intentionally deferred. During bootstrap, the server and dashboard run on localhost only. Auth will be added before any network-exposed deployment. **Known risk:** the `/api/control` endpoint can set `mode: 'killed'`, which triggers shutdown of all running containers. Until auth is added, this endpoint must not be exposed beyond localhost.

## Counter

Utility collection for generating sequential IDs. Used by `Cycle` and `Task`.

```typescript
interface Counter {
  _id: string; // Sequence name: 'cycle' | 'task'
  seq: number; // Current value
}
```

ID generation uses `findOneAndUpdate` with `$inc: { seq: 1 }` and `returnDocument: 'after'` to atomically claim the next value. For tasks, the returned value is zero-padded and formatted as `TASK-{number}` (e.g., `TASK-001`).

## Migration

Tracks which migration scripts have been applied. One document per script.

```typescript
interface Migration {
  _id: string; // Script name: '001-rename-field'
  appliedAt: Date;
}
```

See [Schema Migration Strategy](#schema-migration-strategy) for the rules governing when migration scripts are needed and how they run.

## Cycle

A bounded unit of work with a stated goal and a set of tasks.

```typescript
interface Cycle {
  _id: number; // Auto-incrementing: 1, 2, 3...
  goal: string; // Initially 'Awaiting orchestrator plan'; overwritten by apply-plan job with orchestrator's stated goal
  phase: 'plan' | 'implement' | 'review' | 'integrate' | 'retrospect';
  status: 'active' | 'completed' | 'failed';
  tasks: string[]; // Task IDs in this cycle
  startedAt: Date;
  completedAt?: Date;
  summary?: string; // Written during retrospect phase
  metrics?: {
    tasksCompleted: number;
    tasksFailed: number;
    totalCostUsd: number;
    totalDurationMs: number;
    goalCoverage?: number; // Fraction of goal keywords found in completed task titles (0.0–1.0)
    tasksRetried?: number; // Tasks where the coder AgentRun count > 1 (at least one reviewer rejection triggered a retry). Absent when no coder AgentRun data exists for the cycle.
    tasksPassedFirstReview?: number; // Tasks with status 'done' where coder ran exactly once (passed review on first attempt). Absent when no coder AgentRun data exists.
    tasksRetriedByReviewer?: number; // Count of tasks with lastRetryCause === 'review_rejection'. Absent when no tasks in the cycle have lastRetryCause set.
    tasksRetriedByCi?: number; // Count of tasks with lastRetryCause === 'ci_failure'. Absent when no tasks in the cycle have lastRetryCause set.
    tasksRetriedByPrBody?: number; // Count of tasks with lastRetryCause === 'pr_body_invalid'. Absent when no tasks in the cycle have lastRetryCause set.
  };
}
// Indexes: { status: 1 }
// Note: `metrics` is populated atomically when the cycle transitions to
// `completed` (at the end of the `retrospect` phase) or `failed` (when all
// tasks failed before reaching the integrate phase). `tasksCompleted` and
// `tasksFailed` are sourced from Task document counts; `totalCostUsd` and
// `totalDurationMs` are summed from AgentRun aggregates for the cycle.
// Both transitions call `computeCycleMetrics` (exported from job-queue.ts).
// `goalCoverage` measures how many of the cycle goal's extracted keywords
// appear (case-insensitive) in the concatenated titles of completed tasks.
// It defaults to 1.0 when no meaningful keywords can be extracted from the goal.
// `tasksRetried` and `tasksPassedFirstReview` are derived from AgentRun documents
// with role 'coder', grouped by taskId. `tasksRetried` counts tasks where the coder
// AgentRun count > 1 (at least one retry); `tasksPassedFirstReview` counts done tasks
// where the coder ran exactly once. Both fields are omitted (undefined) when no coder
// AgentRun documents exist for the cycle.
// `tasksRetriedByReviewer`, `tasksRetriedByCi`, and `tasksRetriedByPrBody` break down
// retried tasks by cause: `tasksRetriedByReviewer` counts tasks with
// lastRetryCause === 'review_rejection'; `tasksRetriedByCi` counts tasks with
// lastRetryCause === 'ci_failure'; `tasksRetriedByPrBody` counts tasks with
// lastRetryCause === 'pr_body_invalid'. All three are absent (undefined) when no tasks
// in the cycle have lastRetryCause set.
```

**Auto-incrementing IDs:** `Cycle._id` and `Task._id` use the `Counter` collection (see above) to generate sequential values.

Four phases instead of v1's seven. The removed phases (`design`, `validate`, `ship`) added ceremony without value — they either occurred naturally within `implement`/`review` or were no-ops.

## Task

A concrete unit of work assigned to an agent within a cycle.

```typescript
interface Task {
  _id: string; // Auto-generated: TASK-001, TASK-002...
  title: string;
  description: string;
  status: 'backlog' | 'ready' | 'in-progress' | 'in-review' | 'done' | 'blocked' | 'failed';
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'feature' | 'bug' | 'chore' | 'refactor' | 'test';
  cycleId: number;
  blockedBy: string[]; // Task IDs that must complete first
  branch?: string;
  prNumber?: number;
  prUrl?: string;
  assignedTo?: string; // AgentRun ID
  createdBy: string; // 'orchestrator' | 'human'
  acceptanceCriteria: string[];
  activityLog: Array<{
    timestamp: Date;
    action: string;
    agentRunId?: string;
  }>;
  ciStatus?: 'pending' | 'running' | 'passed' | 'failed';
  reviewVerdict?: 'approved' | 'changes-requested';
  retryCount: number;
  lastRetryCause?: 'ci_failure' | 'review_rejection' | 'no_pr'; // Set when a retry coder is scheduled; records why the task needed a retry
  lastRetryReviewIssues?: Array<{
    file: string;
    line?: number;
    severity: string;
    description: string;
  }>; // Set by job-queue when a reviewer returns changes-requested; contains only error-severity issues
  createdAt: Date;
  updatedAt: Date;
}
// Indexes: { status: 1, cycleId: 1 }, { cycleId: 1 }
```

## AgentRun

Metadata for a single agent execution — one Claude Code session in one Docker container.

```typescript
interface AgentRun {
  _id: string; // Format: {role}-{uuid}
  role: string; // Bootstrap roles: 'orchestrator', 'coder', 'reviewer'. Agents may introduce new roles.
  status: 'starting' | 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
  taskId?: string; // Null for orchestrator planning runs
  cycleId: number;
  containerId?: string;
  systemPrompt: string;
  taskPrompt: string;
  model: string;
  budgetUsd: number; // Cost cap
  costUsd?: number; // Actual cost (from stream-json result event)
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  branch?: string;
  prNumber?: number;
  eventCount: number; // Total events captured
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  timeoutAt: Date; // Hard deadline for container
  exitCode?: number;
  error?: string;
  contextFiles: string[]; // Knowledge base files provided
  contextFeedback?: {
    useful: string[];
    missing: string[];
    unnecessary: string[];
  };
  output?: {
    summary: string;
    filesChanged: string[];
    decisions: string[];
    reviewVerdict?: 'approved' | 'changes-requested'; // Reviewer runs only
    issues?: Array<{
      file: string;
      line?: number;
      severity: 'error' | 'warning' | 'info';
      description: string;
    }>; // Reviewer runs only
    suggestions?: string[]; // Reviewer runs only
  };
}
// Indexes: { status: 1 }, { cycleId: 1 }, { taskId: 1 }
```

## AgentEvent

The observability backbone. Complete turns captured from a running agent — tool calls, reasoning, and decisions.

```typescript
interface AgentEvent {
  _id: ObjectId;
  agentRunId: string;
  sequenceNum: number; // Monotonically increasing within a run
  timestamp: Date;
  type: 'text' | 'tool_use' | 'tool_result' | 'error' | 'completion' | 'system';
  data: TextEvent | ToolUseEvent | ToolResultEvent | ErrorEvent | CompletionEvent | SystemEvent;
}

interface TextEvent {
  content: string;
}

interface ToolUseEvent {
  toolName: string; // 'Bash', 'Edit', 'Read', 'Write', 'Grep', etc.
  toolInput: Record<string, unknown>;
  toolUseId: string; // Correlates with ToolResultEvent
}

interface ToolResultEvent {
  toolUseId: string;
  output: string; // Truncated to 10 KB max
  isError: boolean;
}

interface ErrorEvent {
  message: string;
  code?: string;
}

interface CompletionEvent {
  result: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

interface SystemEvent {
  message: string; // Container lifecycle: started, OOM warning, timeout, etc.
}
// Indexes: { agentRunId: 1, sequenceNum: 1 }, { agentRunId: 1, type: 1 }
// TTL index on timestamp (default 30 days)
```

**Storage notes:**

- Only complete messages (`assistant` and `user` turns) are persisted — not streaming deltas. A typical run produces tens to low hundreds of events, not thousands.
- `ToolResultEvent.output` is truncated to 10 KB to prevent bloat from large file reads.
- TTL index auto-purges old events; the parent `AgentRun` document (with summary and metrics) is retained permanently.
- During active streaming, events are bulk-inserted with `{ ordered: false }` for write throughput.
- Streaming deltas (`stream_event`) are broadcast via SSE to the dashboard for live rendering but are not written to MongoDB.

## Job

Work items in the polling job queue.

```typescript
interface Job {
  _id: ObjectId;
  type:
    | 'spawn'
    | 'wait-for-ci'
    | 'apply-plan'
    | 'advance-cycle'
    | 'curate-inbox'
    | 'next-cycle'
    | 'reload'
    | 'cleanup-prs';
  status: 'pending' | 'active' | 'completed' | 'failed';
  pool: 'agent' | 'infra';
  payload: Record<string, unknown>;
  requiresApproval: boolean;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: string; // 'human' | 'auto'
  retryCount: number;
  maxRetries: number; // Default: 3
  error?: string;
  failedReason?: string; // Set when status is 'failed' due to timeout
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}
// Indexes: { status: 1, pool: 1 }, { type: 1, status: 1 }
```

### Job Types

| Type            | Pool    | Description                                                                                                                                                                                                                                     |
| --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spawn`         | `agent` | Launch a Docker container for an agent run. Payload includes `taskId`, `role`, `cycleId`                                                                                                                                                        |
| `wait-for-ci`   | `infra` | Poll GitHub Actions for CI status on a task's PR. Completes when CI passes or fails                                                                                                                                                             |
| `apply-plan`    | `infra` | Validate and apply an orchestrator's plan output — create `Task` documents from the plan                                                                                                                                                        |
| `advance-cycle` | `infra` | Transition a cycle to its next phase (`plan` → `implement` → `review` → `integrate` → `retrospect`). Triggers phase-specific work (e.g., spawning coders on `implement`, spawning integrator on `integrate`)                                    |
| `curate-inbox`  | `agent` | Spawn a curation agent during `retrospect` to review knowledge inbox entries. Completes immediately (no agent spawned) if the inbox is empty                                                                                                    |
| `next-cycle`    | `infra` | Created after `retrospect` completes. Creates a new `Cycle` document (auto-incremented ID), sets its phase to `plan`, and creates a `spawn` job for the orchestrator. If `Control.mode` is `paused`, the job is held until the operator resumes |
| `reload`        | `infra` | Writes a trigger file to `/reload/trigger` to signal the reloader sidecar to rebuild and restart server + dashboard containers with fresh code. Created after the integrator completes (Docker only — in local dev, falls back to `git pull`)   |
| `cleanup-prs`   | `infra` | Closes stale open PRs from a completed cycle. Compares all PRs created by coders against the final merged PRs and closes any superseded ones. Created after the integrator completes                                                            |

**Queue strategy:** The job queue is purely polling-based — the launcher queries for `{ status: 'pending' }` jobs every `JOB_POLL_INTERVAL_MS` (default 5 seconds). Approval status changes (human approve/reject) are picked up on the next poll cycle. The 5-second latency is acceptable for interactive workflows during bootstrap; if it becomes a bottleneck, the poll interval can be reduced or a notification mechanism added.

## KnowledgeFile

Knowledge base entries — both human-seeded and agent-generated.

```typescript
interface KnowledgeFile {
  _id: string; // Relative path: 'skills/error-handling.md'
  category: 'skills' | 'decisions' | 'specs' | 'journal' | 'inbox' | 'pruned' | 'retrospective';
  title: string;
  snippet: string; // ~150 chars, used for context selection
  content: string;
  status: 'active' | 'processed' | 'archived';
  source: {
    type: 'human' | 'agent';
    agentRunId?: string;
    taskId?: string;
    cycleId?: number;
  };
  qualityScore?: number; // Derived from context feedback
  lastReferencedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
// Indexes: { category: 1, status: 1 }
```

## Knowledge Quality Feedback Loop

The `contextFeedback` field on `AgentRun` and the `qualityScore` field on `KnowledgeFile` are connected by a post-run aggregation step:

1. **Collection** — Every agent's system prompt instructs it to include `contextFeedback` in its structured output (see [Streaming — Agent Structured Output](./streaming.md#agent-structured-output)). The launcher extracts this from the `result.result` field of the final `result` event.
2. **Aggregation** — After an agent run completes, the launcher parses the structured output, writes `contextFeedback` and `output` to the `AgentRun` document, and updates `KnowledgeFile.qualityScore` for each referenced file (see [Quality Score Formula](#quality-score-formula)).
3. **Selection** — The `context-builder.ts` service uses `qualityScore` and `lastReferencedAt` to rank and select context files for future runs. Low-scoring files are deprioritized; files flagged as `missing` generate inbox entries for the knowledge curator.
4. **Curation** — A `curate-inbox` job runs once per cycle during the `retrospect` phase. The agent reviews all pending inbox entries: merging, archiving, or promoting them. If the inbox is empty, the job completes immediately (no agent spawned). Humans spot-check curation decisions during review. This fixed cadence prevents inbox buildup — curation keeps pace with the rate of knowledge generation since both are tied to cycles.

### Quality Score Formula

Each knowledge file maintains a `qualityScore` (float, default `0.0`) updated after every agent run that references it:

```
delta = 0
if file in contextFeedback.useful:      delta += 1.0
if file in contextFeedback.unnecessary:  delta -= 1.5
qualityScore = (qualityScore * 0.95) + delta
```

- **Decay (`0.95`)** — a file that stops being referenced gradually drifts toward zero, preventing stale-but-once-popular files from dominating rankings.
- **Asymmetric weighting (`-1.5` vs `+1.0`)** — it is harder to accumulate score through sheer reference volume; files must consistently be rated useful.
- **Floor** — `qualityScore` is clamped to `[-10, 100]` to prevent runaway scores in either direction.

### Staleness and Drift Detection

Agent feedback alone cannot detect a file whose _content_ is outdated — agents may rate a file as "useful" because its topic is relevant even if its details are wrong. Three mechanisms address this:

1. **Age flag.** Files not updated in 5+ cycles but still actively referenced are flagged for human review during the `retrospect` phase. The curation agent includes these in its report with the label `stale-but-referenced`.
2. **Contradiction detection.** During the `curate-inbox` job, the curation agent receives all `contextFeedback.missing` entries from the cycle alongside existing knowledge files. It identifies cases where a "missing" description overlaps with an existing file — meaning the agent needed the information but didn't find it useful in the provided file, suggesting the file is outdated. The curation agent flags these files as `stale-content` in its report. This leverages the LLM's reasoning over the content directly rather than relying on embedding similarity, and requires no additional infrastructure. If the knowledge base grows too large for a single agent context, embeddings can be introduced as a pre-filtering step.
3. **Human spot-checks.** The dashboard surfaces the top-5 highest-scored knowledge files each cycle. The human operator periodically verifies that high-scoring files are actually accurate, not just popular. This is a manual process during bootstrap; it can be automated later via a dedicated auditor agent.

## Schema Migration Strategy

MongoDB's flexible schema means existing documents are not broken by adding new fields — but it also means drift is silent. Rules for evolving schemas:

1. **Additive changes are free.** New optional fields can be added to Mongoose models at any time. Existing documents without the field return `undefined`, which code must handle (default values in the schema definition, not in application logic).
2. **Destructive changes require a migration script.** Renaming a field, changing a field's type, or removing a field that existing documents contain requires a numbered migration in `apps/server/src/migrations/` (e.g., `001-rename-field.ts`). Each script exports an `up()` function that performs the bulk update.
3. **Migrations run on server startup.** The server checks a `Migration` document (in a `migrations` collection) tracking which scripts have been applied. Unapplied scripts run in order before the server accepts requests.
4. **Agents must create migration scripts** when their code changes modify existing field semantics. The Reviewer agent checks for this — a PR that changes a Mongoose model without a corresponding migration script (when one is needed) is flagged.
5. **Index changes** are declared in Mongoose model definitions and synced on startup via `syncIndexes()`. Dropping an index is a migration (explicit script), not an automatic sync.

During bootstrap, the database is disposable — `mongosh erika --eval "db.dropDatabase()"` is a valid reset. Migration discipline matters once the system has accumulated knowledge worth preserving.

## Control

System-wide and scoped operational controls. Singleton document.

```typescript
interface Control {
  _id: 'singleton';
  mode: 'active' | 'paused' | 'killed';
  humanMessage?: string; // Operator directive visible to all agents
  spendingCapUsd?: number; // System-wide cumulative spending ceiling
  spentUsd: number; // Running total, updated after each agent run
  cycleOverrides: Record<
    number,
    {
      // Per-cycle controls, keyed by cycle ID
      paused?: boolean;
      humanMessage?: string;
    }
  >;
  autoApprovalCategories: string[]; // Task types that skip human gate (empty during bootstrap). See Architecture — Auto-Approval for enforcement rules
  updatedAt: Date;
}
```

**Scoping rules:**

- `mode: 'paused'` halts all new job processing; running agents finish their current turn but no new agents are spawned
- `mode: 'killed'` triggers graceful shutdown of all running containers
- `cycleOverrides` allows pausing or messaging a specific cycle without affecting the rest of the system. Note: MongoDB stores object keys as strings, so numeric cycle IDs become string keys (e.g., `{ "3": { paused: true } }`). Code must coerce when looking up by cycle ID
- Agent kills are handled directly by the `/api/control` endpoint — the route handler calls the launcher to send SIGTERM via Dockerode synchronously and updates `AgentRun.status` to `killed`. This is not poll-dependent and does not use an intermediary field on the Control document
- **Spending updates:** `Control.spentUsd` is incremented atomically via `$inc` immediately after writing `AgentRun.costUsd` in the COLLECT step — both updates happen in the same error-handling block. If the server crashes between these writes, the next startup reconciliation detects `AgentRun` documents with `costUsd` set but no corresponding `spentUsd` increment (by summing all `AgentRun.costUsd` values and comparing to `Control.spentUsd`), and corrects the total. This ensures the spending cap is never silently undercounted.
- **Spending circuit breaker:** Two thresholds are checked before every `spawn` job:
  - **Soft warning (80%):** When `spentUsd >= spendingCapUsd * 0.8`, the system emits a `system:spending_warning` SSE event and sets `mode: 'paused'`. The human can resume by setting `mode: 'active'` or raising the cap. Already-running agents finish their current run but no new agents are spawned.
  - **Hard cap (100%):** When `spentUsd >= spendingCapUsd`, the job is held with `requiresApproval: true`. The human must explicitly approve or raise the cap to continue.

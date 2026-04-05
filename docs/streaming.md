# Streaming Pipeline

Transforms Claude Code's structured JSON output into persisted events and real-time dashboard updates. Covers the capture flow, the `stream-json` wire format, event normalization, and SSE delivery.

## Agent Execution

Each agent runs inside a Docker container as:

```bash
claude -p \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions \
  --max-budget-usd "${MAX_BUDGET_USD}" \
  --system-prompt-file "${SYSTEM_PROMPT_FILE}" \
  --model "${MODEL:-claude-sonnet-4-6}" \
  < "${TASK_PROMPT_FILE}"
```

The task prompt is delivered via stdin from a file (see [Infrastructure — Entrypoint](./infrastructure.md#entrypoint)).

## Capture Flow

```
Container stdout (JSON lines)
        │
        │  Dockerode container.attach({ stream: true, stdout: true })
        │  (attached before container.start — zero-delay capture)
        ▼
Line splitter → JSON.parse → Event classifier
        │
    ┌───┴───┐
    ▼       ▼
MongoDB   SSE broadcast
(persist) (real-time to dashboard)
```

**Why `container.attach()` instead of `container.logs()`:** `attach()` connects to the live byte stream with no buffering delay. `logs()` is suitable for historical replay but introduces overhead. We use `attach()` for real-time capture and MongoDB for replay.

## Claude Code `stream-json` Output Schema

The `--output-format stream-json` flag emits NDJSON (one JSON object per line). Each line has a `type` field that determines its structure. With `--verbose --include-partial-messages`, there are five top-level message types:

### 1. System init — session start

```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "...",
  "tools": [...]
}
```

### 2. Assistant message — complete turn from the model

Emitted after each full model response (text, tool calls, or both):

```json
{
  "type": "assistant",
  "message": {
    "id": "msg_...",
    "type": "message",
    "role": "assistant",
    "model": "claude-sonnet-4-6",
    "content": [
      { "type": "text", "text": "Reading the config file..." },
      {
        "type": "tool_use",
        "id": "toolu_...",
        "name": "Read",
        "input": { "file_path": "/workspace/src/config.ts" }
      }
    ],
    "stop_reason": "tool_use",
    "usage": {
      "input_tokens": 25000,
      "cache_creation_input_tokens": 0,
      "cache_read_input_tokens": 12000,
      "output_tokens": 150
    }
  },
  "parent_tool_use_id": null,
  "session_id": "...",
  "uuid": "..."
}
```

### 3. User message — tool results

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [
      {
        "type": "tool_result",
        "tool_use_id": "toolu_...",
        "content": "..."
      }
    ]
  },
  "parent_tool_use_id": null,
  "session_id": "...",
  "uuid": "..."
}
```

### 4. Stream event — raw Claude API streaming deltas

Only emitted with `--include-partial-messages`. These wrap raw Claude API events:

```json
{
  "type": "stream_event",
  "event": {
    "type": "content_block_delta",
    "index": 0,
    "delta": { "type": "text_delta", "text": "Reading" }
  },
  "parent_tool_use_id": null,
  "session_id": "...",
  "uuid": "..."
}
```

Raw event types in the `event` field: `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, `message_stop`.

### 5. Result — final event with stats

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "session_id": "...",
  "result": "...",
  "cost_usd": 1.23,
  "num_turns": 5,
  "duration_ms": 180000,
  "duration_api_ms": 170000
}
```

## Agent Structured Output

Data flows from agents back to the server through the `result` event's `result` field. Every agent's system prompt instructs it to end its session with a JSON block containing structured output. The launcher extracts and parses this after the run completes.

### Expected format

```json
{
  "summary": "Implemented retry logic for failed jobs",
  "filesChanged": ["src/services/job-queue.ts"],
  "decisions": ["Used exponential backoff instead of fixed delay"],
  "contextFeedback": {
    "useful": ["knowledge/conventions.md"],
    "missing": ["knowledge/error-handling-patterns.md"],
    "unnecessary": ["knowledge/glossary.md"]
  },
  "branch": "task-012-retry-logic",
  "prNumber": 42
}
```

Not all fields are required for every role. The system prompt for each role defines which fields to include.

### Reviewer output

Reviewers include a `reviewVerdict` field (`"approved"` or `"changes-requested"`). The launcher uses this to determine whether to transition the task to `done`:

```json
{
  "summary": "Clean PR, all acceptance criteria met",
  "decisions": ["All tests pass", "Code follows conventions"],
  "contextFeedback": { "useful": [], "missing": [], "unnecessary": [] },
  "reviewVerdict": "approved"
}
```

### Orchestrator plan output

The orchestrator produces a plan rather than code changes. Its structured output contains a task list that the launcher validates and converts into `Task` documents:

```json
{
  "summary": "Cycle 3: Implement job queue and SSE broadcasting",
  "decisions": ["Prioritized job queue over dashboard because agents need dispatch first"],
  "contextFeedback": {
    "useful": ["knowledge/conventions.md"],
    "missing": [],
    "unnecessary": []
  },
  "plan": {
    "goal": "Implement job queue polling and SSE event broadcasting",
    "tasks": [
      {
        "title": "Implement polling job queue",
        "description": "Create job-queue.ts service that polls MongoDB for pending jobs...",
        "type": "feature",
        "priority": "critical",
        "acceptanceCriteria": [
          "Jobs are claimed atomically with findOneAndUpdate",
          "Slot pools (agent/infra) are respected"
        ],
        "blockedBy": []
      },
      {
        "title": "Implement SSE manager",
        "description": "Create sse-manager.ts that manages client connections and broadcasts events...",
        "type": "feature",
        "priority": "high",
        "acceptanceCriteria": [
          "Heartbeat every 30 seconds",
          "Last-Event-ID reconnection replays missed events"
        ],
        "blockedBy": []
      }
    ]
  }
}
```

The launcher validates the plan before creating tasks (see [Architecture — Plan Validation](./architecture.md#orchestrator-agent-vs-launcher-service)):

| Rule            | Rejection condition                                              |
| --------------- | ---------------------------------------------------------------- |
| Task count      | Fewer than 3 or more than 7                                      |
| Dependencies    | Circular references in `blockedBy`                               |
| References      | `blockedBy` contains IDs not in the plan                         |
| Required fields | Any task missing `title`, `description`, or `acceptanceCriteria` |

`blockedBy` values in the plan are positional indexes (0-based) referencing other tasks in the same plan array. The launcher converts these to `TASK-{id}` references when creating the `Task` documents.

### Extraction and Validation

1. The `result` event arrives with `result` as a string containing the agent's final output
2. The launcher attempts to parse the string as JSON. If direct parsing fails, it scans for a fenced JSON block (``` delimiters) and parses that
3. Parsed output is validated against a role-specific schema (see below)
4. Valid fields are written to `AgentRun.output` and `AgentRun.contextFeedback`
5. If parsing fails entirely, `AgentRun.output.summary` is set to the raw string and the run is tagged with `outputParseError: true` — the run is not considered failed, but the dashboard highlights it for human attention

### Validation rules

The launcher validates extracted fields structurally, not semantically:

| Field             | Type                                                             | Required for   |
| ----------------- | ---------------------------------------------------------------- | -------------- |
| `summary`         | string, non-empty                                                | all roles      |
| `filesChanged`    | string[]                                                         | `coder`        |
| `decisions`       | string[]                                                         | all roles      |
| `contextFeedback` | `{ useful: string[], missing: string[], unnecessary: string[] }` | all roles      |
| `branch`          | string                                                           | `coder`        |
| `prNumber`        | number                                                           | `coder`        |
| `plan`            | `{ goal: string, tasks: PlanTask[] }`                            | `orchestrator` |

Missing required fields for a role trigger a warning (logged + `outputValidationWarnings` array on `AgentRun`), but do not fail the run. This is deliberately lenient — agents may evolve their own prompts, and a strict schema would create a brittle coupling. The Reviewer agent is instructed to check that coder output includes all expected fields, providing a second line of defense that can adapt as conventions change.

**Coder runs without `branch`/`prNumber`:** If a coder run completes successfully but the structured output is missing `branch` or `prNumber`, the launcher cannot advance the task to `in-review` (there is no PR to review). In this case the task remains `in-progress`, a warning is logged, and the launcher creates a retry `spawn` job with the previous run's output injected as context — instructing the new agent that it must push a branch and open a PR. This is not a validation failure (the run itself succeeded), but the task's workflow cannot proceed without a PR.

If agents introduce new output fields, they are preserved in `AgentRun.output` as-is (MongoDB's flexible schema accommodates this). New fields become "official" when the launcher is updated to act on them.

This convention keeps agents decoupled from the server API — they never call backend endpoints directly. All communication flows through stdout and the stream capture pipeline.

## Event Normalization

A normalization layer in `stream-capture.ts` maps raw Claude Code events to our `AgentEvent` types:

| Raw Claude Code Message                           | Internal AgentEvent Type | Source             |
| ------------------------------------------------- | ------------------------ | ------------------ |
| `assistant` message with `text` content block     | `TextEvent`              | Complete turns     |
| `assistant` message with `tool_use` content block | `ToolUseEvent`           | Complete turns     |
| `user` message with `tool_result` content block   | `ToolResultEvent`        | Complete turns     |
| `result` with `is_error: true`                    | `ErrorEvent`             | Final event        |
| `result` with `subtype: "success"`                | `CompletionEvent`        | Final event        |
| Container lifecycle (start, OOM, timeout)         | `SystemEvent`            | Launcher-generated |

**Partial messages (`stream_event`) are broadcast via SSE for live dashboard rendering but are NOT persisted to MongoDB.** Only complete `assistant` and `user` messages are persisted as `AgentEvent` documents. This avoids writing thousands of single-token deltas per run while still providing a complete, replayable record of agent behavior.

This decoupling means a Claude Code output format change requires updating one file (`stream-capture.ts`), not the entire pipeline.

## SSE Protocol

Events are delivered to the dashboard using standard Server-Sent Events.

### Format

```
event: <type>
id: <monotonic-id>
data: <json-payload>

```

### Agent Events — `/api/agents/:agentId/stream`

Per-agent stream of real-time activity. Includes both persisted events (complete turns) and ephemeral streaming deltas:

```
event: agent:text_delta
id: 42
data: {"agentRunId":"coder-abc123","text":"Reading"}

event: agent:text
id: 43
data: {"agentRunId":"coder-abc123","content":"Reading the config file..."}

event: agent:tool_use
id: 44
data: {"agentRunId":"coder-abc123","toolName":"Read","toolInput":{"file_path":"/workspace/src/config.ts"}}

event: agent:tool_result
id: 45
data: {"agentRunId":"coder-abc123","toolUseId":"tu_123","output":"(truncated)","isError":false}

event: agent:completion
id: 46
data: {"agentRunId":"coder-abc123","costUsd":1.23,"inputTokens":50000,"outputTokens":12000,"durationMs":180000}
```

`agent:text_delta` events are ephemeral (derived from `stream_event` deltas, not persisted). All other agent events are persisted and replayable via `Last-Event-ID` reconnection.

### System Events — `/api/events/stream`

Global stream of lifecycle events:

```
event: cycle:phase_changed
data: {"cycleId":3,"phase":"implement","previousPhase":"plan"}

event: cycle:completed
data: {"cycleId":3}

event: cycle:failed
data: {"cycleId":3,"previousPhase":"review"}

event: cycle:completed
data: {"cycleId":3,"metrics":{}}

event: task:created
data: {"taskId":"TASK-012","cycleId":3,"title":"Implement feature X"}

event: task:status_changed
data: {"taskId":"TASK-012","status":"in-review","cycleId":3,"prNumber":42}

event: agent:started
data: {"agentRunId":"coder-abc123","role":"coder","taskId":"TASK-012"}

event: agent:completed
data: {"agentRunId":"coder-abc123","role":"coder","cycleId":3,"exitCode":0,"costUsd":1.23,"status":"completed"}

event: job:requires_approval
data: {"jobId":"abc","type":"apply-plan","summary":"Orchestrator proposes 4 tasks for cycle 3"}

event: job:failed
data: {"jobId":"64f8a...","type":"spawn","reason":"timeout — stale job detected"}

event: review:ready
data: {"taskId":"TASK-012","prNumber":42,"prUrl":"...","agentRunId":"coder-abc123"}

event: system:spending_warning
data: {"spentUsd":40.0,"spendingCapUsd":50.0,"percentUsed":80,"action":"paused"}
```

### Task and Cycle Events

#### `task:created`

Emitted after each task is created when an orchestrator plan is applied. Source: `job-queue.ts` (`handleApplyPlan`). Global — no `agentRunId` filter.

```json
{
  "taskId": "TASK-012",
  "cycleId": 3,
  "title": "Implement feature X"
}
```

- `taskId` is the newly created task's ID (e.g., `TASK-012`)
- `cycleId` is the cycle the task belongs to
- `title` is the task title from the orchestrator plan
- One event is emitted per task — a plan with 5 tasks emits 5 `task:created` events

### Job Events

#### `job:failed`

Emitted when a stale active job is automatically failed due to timeout. Source: `job-queue.ts` (`detectAndFailStaleJobs`). Global — no `agentRunId` filter.

```json
{
  "jobId": "64f8a...",
  "type": "spawn",
  "reason": "timeout — stale job detected"
}
```

- `type` is the job's type (e.g., `spawn`, `wait-for-ci`, `advance-cycle`)
- `reason` matches the `failedReason` field set on the job document

### Heartbeat

Both endpoints send a comment line every 30 seconds to keep connections alive:

```
: heartbeat
```

### Reconnection

Clients include the `Last-Event-ID` header on reconnect. The backend replays missed persisted events from MongoDB (complete turns, tool calls, completions — all stored with monotonic sequence numbers). Ephemeral `text_delta` events are not replayed; the client receives the complete `agent:text` event instead. This guarantees no loss of meaningful state across connection drops.

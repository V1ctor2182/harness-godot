# SSE Event Reference

The server broadcasts Server-Sent Events via `apps/server/src/services/sse-manager.ts`. Events are sent as `text/event-stream` with `event:`, `id:`, and `data:` fields.

## Filtering

Events are either **global** (sent to all SSE clients) or **agent-filtered** (sent only to clients subscribed to a specific `agentRunId`). The `broadcast()` function accepts an optional `filter` argument:

```ts
broadcast(eventType, data); // global
broadcast(eventType, data, { agentRunId }); // agent-filtered
```

A client with no filter receives all events. A client subscribed to a specific `agentRunId` receives global events plus agent-filtered events for that run only.

---

## Agent Lifecycle Events (Global)

### `agent:started`

Emitted when an agent container starts. Source: `spawner.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "role": "coder",
  "taskId": "TASK-007",
  "cycleId": 3
}
```

- `taskId` is absent for role-level agents (orchestrator, integrator, curator).

### `agent:completed`

Emitted when an agent container exits (success or failure). Source: `spawner.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "role": "coder",
  "cycleId": 3,
  "exitCode": 0,
  "costUsd": 0.142,
  "status": "completed"
}
```

- `status` is the final `AgentRunStatus`: `completed` | `failed` | `timeout`
- `costUsd` is `0` if no completion event was captured
- **No `durationMs` field** — fetch the full `AgentRun` document from the API if you need duration

---

## Agent Stream Events (Agent-Filtered)

These events are filtered by `agentRunId`. All include `agentRunId` as the first field.

### `agent:text`

A complete assistant text block. Persisted to MongoDB. Source: `stream-capture.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "content": "I'll start by reading the existing files..."
}
```

### `agent:text_delta`

Streaming text delta — ephemeral, never persisted. Source: `stream-capture.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "text": "I'll start"
}
```

- Field is `text` (not `delta` or `snapshot`)

### `agent:tool_use`

An assistant tool call block. Persisted. Source: `stream-capture.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "toolName": "Read",
  "toolInput": { "file_path": "/workspace/src/index.ts" },
  "toolUseId": "toolu_01XYZ"
}
```

### `agent:tool_result`

The result of a tool call. Persisted. Source: `stream-capture.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "toolUseId": "toolu_01XYZ",
  "output": "   1→import ...",
  "isError": false
}
```

- `output` is truncated to `TOOL_RESULT_MAX_BYTES` if too large

### `agent:error`

A Claude Code result event with `is_error: true`. Persisted. Source: `stream-capture.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "message": "Max tokens exceeded",
  "code": "max_tokens"
}
```

- `code` is optional (maps to `subtype` in the stream-json result)

### `agent:completion`

A successful Claude Code result event. Persisted. Source: `stream-capture.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "result": "{ \"summary\": \"...\", ... }",
  "costUsd": 0.142,
  "inputTokens": 45000,
  "outputTokens": 1200,
  "durationMs": 87432
}
```

- `result` is the raw output string (may contain a JSON block with structured output)

### `agent:system`

A system message from the agent session. Source: `stream-capture.ts` and `spawner.ts`.

```json
{
  "agentRunId": "coder-a1b2c3d4",
  "message": "Container started"
}
```

- When emitted via `emitSystemEvent()` (container start, etc.): **agent-filtered**
- When emitted from a `system` line in the stream-json: **global** (no filter applied)

---

## Task and Cycle Events (Global)

### `task:status_changed`

Emitted when a task's status changes. Source: `spawner.ts`.

```json
{
  "taskId": "TASK-007",
  "status": "in-review",
  "prNumber": 42
}
```

- `prNumber` is present only when status is `in-review` and a PR was created

### `cycle:phase_changed`

Emitted when a cycle advances to a new phase. Source: `job-queue.ts`.

```json
{
  "cycleId": 3,
  "phase": "implement",
  "previousPhase": "plan"
}
```

### `cycle:completed`

Emitted when a cycle finishes successfully (after the retrospect phase completes). Source: `job-queue.ts`.

```json
{
  "cycleId": 3,
  "metrics": {
    "tasksCompleted": 5,
    "tasksFailed": 0,
    "totalCostUsd": 1.24,
    "totalDurationMs": 3600000
  }
}
```

- `metrics` is the final `Cycle.metrics` object (populated at cycle completion)

### `cycle:failed`

Emitted when a cycle fails (all tasks failed before reaching the integrate phase). Source: `job-queue.ts`.

```json
{
  "cycleId": 3,
  "previousPhase": "implement"
}
```

- `previousPhase` is the phase the cycle was in when failure was detected

---

## Job Events (Global)

### `job:requires_approval`

Emitted when a job is created that requires human approval. Source: `job-queue.ts`.

```json
{
  "jobId": "64f8a...",
  "type": "apply-plan",
  "payload": { "agentRunId": "orchestrator-a1b2", "cycleId": 3 }
}
```

### `job:failed`

Emitted when a job times out and is marked as stale. Source: `job-queue.ts`.

```json
{
  "jobId": "64f8a...",
  "type": "spawn",
  "reason": "timeout — stale job detected"
}
```

---

## System Events (Global)

### `system:spending_warning`

Emitted when cumulative spending crosses the warning threshold. Source: `spawner.ts`.

```json
{
  "spentUsd": 4.25,
  "spendingCapUsd": 5.0,
  "percentUsed": 85,
  "action": "paused"
}
```

- `action` is `"paused"` when below the cap but above the threshold, `"hard_cap"` when at or above the cap

### `system:reload_triggered`

Emitted when a reload trigger file is written (Docker reload path). Source: `job-queue.ts`.

```json
{
  "cycleId": 3
}
```

---

## Notes

- `review:ready` appears in `SSEEventType` in `packages/shared/src/types.ts` but is **never emitted** by the server. It may be a planned event type.
- `agent:error` is present in the `SSEEventType` union (added in Cycle 9, `packages/shared/src/types.ts`). Dashboards should handle it normally.
- All agent-filtered events also reach global clients (those with no `agentRunId` filter). Only clients explicitly subscribed to a _different_ `agentRunId` are excluded.

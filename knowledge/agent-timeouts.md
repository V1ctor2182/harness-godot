# Agent Timeouts

## Overview

Each agent role has a maximum wall-clock timeout. If the agent container does not complete within this window, the spawner kills the container and marks the `AgentRun` as `timeout`.

## Timeout Values

Defined in `packages/shared/src/constants.ts`:

| Role           | Constant                  | Value                 |
| -------------- | ------------------------- | --------------------- |
| `orchestrator` | `ORCHESTRATOR_TIMEOUT_MS` | 1,200,000 ms (20 min) |
| `coder`        | `CODER_TIMEOUT_MS`        | 1,800,000 ms (30 min) |
| `reviewer`     | `REVIEWER_TIMEOUT_MS`     | 900,000 ms (15 min)   |
| `curator`      | `REVIEWER_TIMEOUT_MS`     | 900,000 ms (15 min)   |
| `integrator`   | `CODER_TIMEOUT_MS`        | 1,800,000 ms (30 min) |

The curator and integrator roles do not have their own named constants — they reuse reviewer and coder timeouts respectively. The rationale is documented in `constants.ts`:

```ts
curator: REVIEWER_TIMEOUT_MS,    // Same timeout as reviewer
integrator: CODER_TIMEOUT_MS,    // Same timeout as coder — merging + conflict resolution + tests
```

## Timeout Map

All five roles are listed in `ROLE_TIMEOUT_MS` in `packages/shared/src/constants.ts`:

```ts
export const ROLE_TIMEOUT_MS: Record<string, number> = {
  orchestrator: ORCHESTRATOR_TIMEOUT_MS,
  coder: CODER_TIMEOUT_MS,
  reviewer: REVIEWER_TIMEOUT_MS,
  curator: REVIEWER_TIMEOUT_MS,
  integrator: CODER_TIMEOUT_MS,
};
```

## Fallback Behavior

In `apps/server/src/services/launcher/spawner.ts`, the timeout is resolved as:

```ts
const timeoutMs = ROLE_TIMEOUT_MS[role] ?? config.coderTimeoutMs;
```

If a role string does not appear in `ROLE_TIMEOUT_MS` (e.g., an unrecognized future role), the spawner falls back to `config.coderTimeoutMs` (30 min). `config.coderTimeoutMs` is parsed from the `CODER_TIMEOUT_MS` env var, defaulting to the constant value.

## Not Per-Run Configurable

Timeouts are **hardcoded in `constants.ts`** and are **not configurable per-run via environment variables**. There is no env var like `ORCHESTRATOR_TIMEOUT_MS` that overrides the constant at runtime. The only adjustment possible is via `config.coderTimeoutMs` which acts as a fallback for unknown roles.

## Network Activity Timeout

Separate from the role timeout, there is also a **network inactivity kill threshold**:

```ts
export const NETWORK_TIMEOUT_MS = 300_000; // 5 min no-event kill threshold
```

This kills containers that produce no stream events for 5 consecutive minutes, regardless of the role timeout.

# Infrastructure

Docker agent image, container lifecycle, resource limits, environment variables, and local development setup.

## Dockerfile

```dockerfile
FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git \
    curl \
    jq \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Verify gh CLI is installed
RUN gh --version

RUN npm install -g @anthropic-ai/claude-code

RUN mkdir -p /workspace /context /output

RUN git config --global user.name "erika-agent" \
    && git config --global user.email "erika-agent@noreply"

WORKDIR /workspace

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

## Entrypoint

```bash
#!/bin/bash
set -euo pipefail

# Environment injected by launcher:
#   CLAUDE_CODE_OAUTH_TOKEN  — authentication
#   AGENT_ROLE               — orchestrator | coder | reviewer | integrator | curator
#   SYSTEM_PROMPT_FILE       — path to role-specific system prompt (in /context/)
#   TASK_PROMPT_FILE         — path to task instructions file (in /context/)
#   GITHUB_REPO_URL          — repository URL
#   GH_TOKEN                 — GitHub PAT for repo access
#   BASE_BRANCH              — branch to start from (default: master)
#   MAX_BUDGET_USD           — cost cap (default: 5)
#   MODEL                    — model (default: claude-sonnet-4-6)
#   SERVER_API_URL           — server API base URL (default: http://host.docker.internal:3001/api)

# --- GitHub CLI setup ---
# GH_TOKEN is injected by the launcher and automatically picked up by gh CLI.
# No `gh auth login` is needed — gh reads GH_TOKEN from the environment natively.
export GH_TOKEN

# --- Git setup ---
git config --global url."https://${GH_TOKEN}@github.com/".insteadOf "https://github.com/"
git clone --branch "${BASE_BRANCH:-master}" "${GITHUB_REPO_URL}" /workspace
cd /workspace

# --- Install dependencies ---
# Ensures dev tools (Prettier, tsc, test runners) are available without auto-download delays.
npm ci

# --- Launch agent ---
# Task prompt is read via stdin to avoid ARG_MAX limits on long prompts.
exec claude -p \
  --output-format stream-json \
  --verbose \
  --include-partial-messages \
  --dangerously-skip-permissions \
  --max-budget-usd "${MAX_BUDGET_USD:-5}" \
  --system-prompt-file "${SYSTEM_PROMPT_FILE}" \
  --model "${MODEL:-claude-sonnet-4-6}" \
  < "${TASK_PROMPT_FILE}"
```

## Available CLI Tools (Agent Container)

| Tool           | Purpose                                            |
| -------------- | -------------------------------------------------- |
| `claude`       | Claude Code CLI — the agent runner                 |
| `git`          | Version control                                    |
| `npm` / `node` | Node.js toolchain                                  |
| `curl`         | HTTP requests (e.g., REST API calls)               |
| `jq`           | JSON processing                                    |
| `gh`           | GitHub CLI — PR creation, review, CI status checks |

The `gh` CLI is installed from the official GitHub apt repository (`cli.github.com/packages`) and authenticated automatically via the `GH_TOKEN` environment variable. No `gh auth login` is needed.

**Prompt delivery:** Both the system prompt and task prompt are delivered as files injected into `/context/` during the INJECT step, avoiding OS `ARG_MAX` limits. The task prompt is piped via stdin; the system prompt uses `--system-prompt-file`.

**Git setup:** The entrypoint clones the repository into `/workspace`, which is empty at container start (created by the Dockerfile but never populated). Every agent starts with the full codebase. Agents create branches and open PRs as needed — the system prompt defines the git workflow per role. `GH_TOKEN` is embedded in the git URL rewrite so all subsequent git operations (push, fetch) authenticate automatically.

**npm install:** After cloning, the entrypoint runs `npm ci` to install all workspace dependencies from the lockfile. This ensures dev tools — Prettier, the TypeScript compiler, test runners — are present before the agent starts. Because `set -euo pipefail` is active, a failed `npm ci` aborts the container immediately rather than letting the agent run without tooling.

The `--verbose` flag is required alongside `--include-partial-messages` for streaming events to be emitted.

## Container Lifecycle

Nine steps, reduced from v1's seventeen. The simplification comes from trusting agents with full privileges — they handle their own cloning, branching, and PR creation.

```
1. PREPARE   — Build context payload (KB files, task spec, cycle state)
2. CREATE    — Create container from erika-agent image with env vars and `erika=agent` label
3. INJECT    — Copy context files into /context/ via Dockerode putArchive
4. ATTACH    — Attach to stdout stream before start
5. START     — Start container
6. STREAM    — Parse events, persist to MongoDB, broadcast via SSE
7. WAIT      — Await container exit with timeout enforcement
8. COLLECT   — Read exit code, extract completion event
9. CLEANUP   — Remove container
```

## Error Recovery

When a container fails mid-run (OOM, timeout, crash, network error), the launcher executes a recovery flow:

```
FAILURE DETECTED (exit code != 0 or timeout)
        │
        ▼
1. MARK    — Set AgentRun.status to 'failed' or 'timeout', record exit code and error
2. PERSIST — Flush any buffered events to MongoDB (partial run is still valuable for debugging)
3. CLEANUP — Remove the container
4. ASSESS  — Check Task.retryCount against Job.maxRetries (default: 3)
        │
    ┌───┴───┐
    ▼       ▼
  RETRY   ESCALATE
```

**Retry:** A new `spawn` job is created with the same task, incrementing `retryCount`. The new agent receives the previous run's error message and event summary as additional context, so it can avoid repeating the same failure.

**Escalate:** If retries are exhausted, the task is set to `failed` and a `SystemEvent` is emitted. The orchestrator is notified during the next cycle phase transition so it can replan, reassign, or drop the task.

**Specific failure modes:**

| Failure             | Detection                                | Response                                           |
| ------------------- | ---------------------------------------- | -------------------------------------------------- |
| OOM kill            | Exit code 137                            | Retry with increased memory limit (up to 8 GB cap) |
| Timeout             | `timeoutAt` exceeded                     | Retry with same timeout; if repeated, escalate     |
| Claude Code error   | Non-zero exit + `result.is_error`        | Retry with error context injected                  |
| Docker daemon error | `container.start()` or `attach()` throws | Retry after 30s backoff; escalate after 3 failures |
| Network partition   | No events received for 5 minutes         | Kill container, retry                              |

**Partially-persisted events** from a failed run are retained — they provide the audit trail for debugging what went wrong. The `AgentRun` document records the failure, and the dashboard surfaces failed runs with their event history for human inspection.

## Orphaned Container Recovery

If the server crashes while agents are running, Docker containers may be left without a listener. On startup, before accepting requests, the server performs a reconciliation pass:

1. **Scan** — Query Docker for all running containers with the `erika-agent` label
2. **Cross-reference** — For each container, look up the corresponding `AgentRun` document by `containerId`
3. **Classify and act:**
   - **No matching `AgentRun`** — container is fully orphaned. Kill and remove it.
   - **`AgentRun.status` is `running`** — the server crashed mid-stream. Mark the run as `failed` with error `"server restart: orphaned container"`, flush any buffered events, kill and remove the container. A retry `spawn` job is created if `retryCount < maxRetries`.
   - **`AgentRun.status` is already terminal** (`completed`, `failed`, `timeout`, `killed`) — container wasn't cleaned up. Remove it.

All agent containers are created with the label `erika=agent` to make this scan reliable. The reconciliation runs after database connection but before the job queue starts polling, ensuring no new agents are spawned until orphans are resolved.

## Resource Limits

| Resource | Limit                                                      | Rationale                                                      |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------- |
| Memory   | 4 GB                                                       | Headroom for Claude Code, Node.js, and git                     |
| CPU      | 1 core                                                     | Claude Code is I/O-bound (API calls), not CPU-bound            |
| Timeout  | 30 min (coder) / 20 min (orchestrator) / 15 min (reviewer) | Role-specific, configurable                                    |
| Network  | Unrestricted                                               | Required for repo operations, package installation, API access |
| Cost     | $5 default per run                                         | Enforced by `--max-budget-usd`, configurable per role          |

## Environment Variables

```bash
# Server
PORT=3001
MONGODB_URI=mongodb://localhost:27017/erika
NODE_ENV=development
LOG_LEVEL=info                     # Pino log level for the server (default: info)

# Authentication & repo
CLAUDE_CODE_OAUTH_TOKEN=           # Claude Code authentication token. Injected into agent containers
GH_TOKEN=                          # GitHub PAT — injected into containers for git auth
GITHUB_REPO_URL=                   # e.g. https://github.com/user/erika
BASE_BRANCH=master                 # Branch agents clone from (default: master)

# Agent defaults
DEFAULT_MODEL=claude-sonnet-4-6    # Sonnet for cost efficiency during bootstrap. Switch to Opus for higher-quality reasoning when the budget allows
CODER_TIMEOUT_MS=1800000           # 30 min
ORCHESTRATOR_TIMEOUT_MS=1200000    # 20 min
REVIEWER_TIMEOUT_MS=900000         # 15 min
DEFAULT_BUDGET_USD=5

# Job queue
CONCURRENT_AGENT_SLOTS=3
CONCURRENT_INFRA_SLOTS=8
JOB_POLL_INTERVAL_MS=5000

# SSE
SSE_HEARTBEAT_INTERVAL_MS=30000

# Retention
AGENT_EVENT_TTL_DAYS=30
JOB_RETENTION_DAYS=30

# Agent networking
SERVER_API_URL=http://host.docker.internal:3001/api  # API base URL injected into agent containers. host.docker.internal resolves via ExtraHosts: host-gateway on Linux

# Reload (set automatically by Docker Compose)
RELOAD_TRIGGER_PATH=/reload/trigger  # Path where reload trigger file is written (inside server container)

# Dashboard
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Server & Dashboard Dockerfiles

The server and dashboard each have their own multi-stage Dockerfiles for production deployment via Docker Compose. These are separate from the agent Dockerfile above.

### Server (`apps/server/Dockerfile`)

Three stages:

1. **deps** — Copies workspace `package.json` files + lockfile, runs `npm ci` for server + shared
2. **build** — Builds shared package (tsc), patches `packages/shared/package.json` to point `main` at `dist/index.js` (dev workflow uses `src/index.ts` with tsx), then builds server (tsc)
3. **runtime** — `node:22-slim` + `git` + `gh` CLI (for CI status checks, PR merges, and dry-run merge tests). Copies compiled output + `node_modules` + `agents/` + `knowledge/` (context-builder needs them at runtime). Creates `/reload` mount point for the reload trigger volume. Exposes port 3001.

### Dashboard (`apps/dashboard/Dockerfile`)

Three stages:

1. **deps** — Copies workspace `package.json` files + lockfile, runs `npm ci` for dashboard + shared
2. **build** — Builds shared package, then builds dashboard (`next build`). Requires `output: 'standalone'` in `next.config.ts`
3. **runtime** — `node:22-slim`, copies `.next/standalone` output + static assets. Exposes port 3000.

The `standalone` output mode bundles all dependencies into the output directory, producing a minimal runtime image.

## Reloader Sidecar

A lightweight container that watches for a reload trigger file and rebuilds/restarts the server and dashboard containers after code changes (e.g., after the integrator agent merges branches).

**Image:** `docker:27-cli` + `bash` + `git`

**Self-contained:** The reloader clones the repo from GitHub on first start and pulls updates on each trigger. It does not depend on a host filesystem bind mount — the only host dependency is the Docker socket. Secrets (`.env`) are mounted read-only from the project root.

**Mechanism:**

1. On first start, the reloader clones the repo into `/repo` using `GH_TOKEN` for authentication
2. The server writes a JSON trigger file to `/reload/trigger` (shared volume) when a `reload` job is processed
3. The reloader polls this path every 5 seconds
4. When detected: reads + deletes the trigger, runs `git pull --ff-only`, copies `.env` from the secrets mount, then runs `docker compose build server dashboard` + `docker compose up -d server dashboard`
5. Docker sends SIGTERM to the old containers; new containers start with fresh code

**Key detail:** `docker compose` runs inside the reloader container but the Docker daemon runs on the host. The Docker CLI sends the build context to the daemon over the socket, so builds work from the container's local clone — no host path needed.

**Environment variables:**

- `GH_TOKEN` — GitHub PAT for cloning/pulling the repo (required)
- `GITHUB_REPO_URL` — Repository URL (required)
- `BASE_BRANCH` — Branch to pull (default: `master`)
- `RELOAD_POLL_INTERVAL` — Poll frequency in seconds (default: `5`)

## Health Check

The `/api/health` endpoint returns system readiness. Used by Docker Compose healthchecks and the dashboard connection indicator.

```json
{
  "status": "ok",
  "checks": {
    "database": "connected",
    "docker": "connected"
  },
  "uptime": 12345
}
```

| Check      | Method                                 | Failure                                        |
| ---------- | -------------------------------------- | ---------------------------------------------- |
| `database` | `mongoose.connection.readyState === 1` | Server cannot manage cycles, tasks, or events  |
| `docker`   | `dockerode.ping()`                     | Server cannot spawn or manage agent containers |

Returns HTTP 200 when all checks pass, HTTP 503 with the failing check(s) otherwise. The job queue does not start polling until the health check passes on startup.

## CI Workflow

Automated checks run on GitHub Actions for every push to any branch and every pull request targeting `master`.

**Workflow:** `.github/workflows/ci.yml`

**Triggers:**

- `push` — any branch
- `pull_request` — targeting `master`

**Job:** Single job (`ci`) on `ubuntu-latest` with Node.js 22.

**Steps:**

| Step                 | Command                                | Purpose                                                  |
| -------------------- | -------------------------------------- | -------------------------------------------------------- |
| Install dependencies | `npm ci`                               | Install all workspace dependencies from lock file        |
| Lint                 | `npm run lint && npm run format:check` | ESLint + Prettier formatting check                       |
| Typecheck            | `npm run typecheck`                    | TypeScript strict-mode type checking across all packages |
| Test                 | `npm test`                             | Run all tests (vitest across all workspaces)             |

No caching is configured — kept simple for the bootstrap phase.

## Local Development

The entire stack runs locally via Docker Compose during bootstrap. Prerequisites: Docker Desktop and a Claude Code OAuth token.

```bash
# 1. Clone and install dependencies
git clone <repo-url> && cd erika
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — at minimum set CLAUDE_CODE_OAUTH_TOKEN and GH_TOKEN

# 3. Start the stack
docker compose up -d

# This starts:
#   - MongoDB (standalone local instance)
#   - Express server (apps/server)
#   - Next.js dashboard (apps/dashboard)
#   - Reloader sidecar (watches for reload triggers)

# 4. Verify
curl http://localhost:3001/api/health
```

The agent Docker image (`erika-agent`) is built separately and used on-demand by the launcher service when spawning agent containers. It is not part of the long-running compose stack.

**Startup sequence (after MongoDB connection):**

1. **Migrations** — The server scans `apps/server/src/migrations/` for numbered scripts (e.g., `001-rename-field.ts`), checks a `migrations` collection for which have already been applied, and runs unapplied scripts in order. Each script exports an `up()` function. After successful execution, the script name is recorded in the `migrations` collection. The server does not accept requests until all migrations have completed. See [Schemas — Schema Migration Strategy](./schemas.md#schema-migration-strategy) for the rules governing when migrations are needed.
2. **Knowledge seeding** — All `.md` files in the `knowledge/` directory are loaded into the `KnowledgeFile` MongoDB collection via `upsert` (insert if absent, skip if already present). This runs on every startup and is fully idempotent — existing documents are never overwritten.
3. **Control document** — `getOrCreateControl()` ensures the singleton control document exists before the job queue starts polling.

**MongoDB** runs as a standalone instance with no replica set configuration. This is the simplest setup for local development. If change streams or multi-document transactions are needed later, a single-node replica set can be configured by adding `--replSet rs0` and a one-time `rs.initiate()` call.

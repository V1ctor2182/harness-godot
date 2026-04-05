# Agent Container Setup

## Workspace Initialization

The agent container entrypoint (`docker/agent/entrypoint.sh`) runs in order:

1. Exports `GH_TOKEN` for the gh CLI (gh reads it from the environment automatically)
2. Configures git with `GH_TOKEN` authentication
3. Clones the repo from `GITHUB_REPO_URL` to `/workspace`
4. Runs `npm ci` to install all workspace dependencies
5. Launches `claude` with stream-json output

All dev tools (Prettier, tsc, test runners) are available after startup — no auto-download delays.

## Docker Network Topology

Agent containers are **not** part of the Docker Compose network. They are spawned dynamically by the server via the Docker socket (`/var/run/docker.sock`).

Containers connect back to the server using:

- `ExtraHosts: ['host.docker.internal:host-gateway']` — makes `host.docker.internal` resolve to the Docker host IP
- `SERVER_API_URL` env var — set to `http://host.docker.internal:3001/api`

The server (from `docker-compose.yml`) is bound to `127.0.0.1:3001` on the host. Agent containers reach it via `host.docker.internal:3001`.

## Available CLI Tools

- **`claude`** — Claude Code CLI (the agent runner)
- **`git`**, **`npm`**, **`node`** — standard toolchain
- **`curl`** — for HTTP requests (e.g., GitHub API)
- **`gh`** — GitHub CLI for PR creation, review, and status checks

### Using the gh CLI

`gh` is installed from the official GitHub apt repository (`cli.github.com/packages`) and authenticated automatically via the `GH_TOKEN` environment variable — no `gh auth login` is needed.

Common operations:

```bash
# Create a pull request
gh pr create --title "TASK-XXX: Title" --body "description"

# View PR details or diff
gh pr view 42
gh pr diff 42

# Check CI status
gh pr checks 42
```

## Environment Variables (Injected by Launcher)

| Variable                  | Description                                                    |
| ------------------------- | -------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | Auth token for Claude Code                                     |
| `AGENT_ROLE`              | Role: orchestrator, coder, reviewer, curator                   |
| `SYSTEM_PROMPT_FILE`      | Path to system prompt (`/context/system-prompt.md`)            |
| `TASK_PROMPT_FILE`        | Path to task prompt (`/context/task-prompt.md`)                |
| `GITHUB_REPO_URL`         | Repo to clone                                                  |
| `GH_TOKEN`                | GitHub PAT (used by both git URL rewrite and gh CLI)           |
| `BASE_BRANCH`             | Branch to clone (default: master)                              |
| `MAX_BUDGET_USD`          | Cost cap (default: 5)                                          |
| `MODEL`                   | Claude model to use                                            |
| `SERVER_API_URL`          | API base URL (default: `http://host.docker.internal:3001/api`) |

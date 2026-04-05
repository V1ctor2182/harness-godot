# Erika

Self-improving agentic development team. Autonomous agents write code, that code improves the agents, better agents write better code — a continuous bootstrapping loop.

## How It Works

The system organizes work into **cycles** — bounded units with a stated goal and 3-7 tasks. Each cycle moves through four phases: `plan → implement → review → retrospect`. Agents run as Claude Code sessions in isolated Docker containers with full privileges. Guardrails come from process (CI, agent review, human gate), not capability restrictions.

**Agent pool:** Orchestrator (plans cycles), Coder (writes code), Reviewer (evaluates quality). Additional roles can be introduced by the agents themselves.

**Human oversight:** Every change is human-reviewed during bootstrap. The system earns autonomy incrementally.

## Documentation

- [docs/architecture.md](./docs/architecture.md) — Vision, principles, agent roles, development cycle, evaluation layers, technology decisions, v1 lessons
- [docs/project-structure.md](./docs/project-structure.md) — Monorepo directory tree and rationale
- [docs/schemas.md](./docs/schemas.md) — MongoDB collections, indexes, counter pattern, knowledge feedback loop
- [docs/streaming.md](./docs/streaming.md) — Claude Code stream-json schema, capture pipeline, event normalization, SSE protocol
- [docs/infrastructure.md](./docs/infrastructure.md) — Docker image, container lifecycle, error recovery, resource limits, environment variables, local development

## Quick Start

```bash
git clone <repo-url> && cd erika
npm install
cp .env.example .env    # Set CLAUDE_CODE_OAUTH_TOKEN and GH_TOKEN
docker compose up -d
curl http://localhost:3001/api/health
```

## Stack

TypeScript, Node.js, Express, Next.js, MongoDB, Docker, Claude Code CLI.

See [CLAUDE.md](./CLAUDE.md) for agent instructions and project conventions.

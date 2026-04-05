# Erika System Overview

Erika is a self-improving agentic development team. Autonomous agents write code that builds and improves the system itself.

## How It Works

Work is organized into **cycles** — bounded units with a stated goal and 3-7 tasks. Each cycle moves through five phases: `plan → implement → review → integrate → retrospect`.

### Agents

- **Orchestrator** — plans cycles, decomposes goals into tasks
- **Coder** — implements tasks, creates branches and PRs
- **Reviewer** — evaluates code quality and correctness
- **Integrator** — merges all task branches, resolves conflicts, verifies tests

Agents run as Claude Code sessions in isolated Docker containers with full privileges. Guardrails come from process (CI, agent review, human gate), not capability restrictions.

### Evaluation Layers

1. **CI** — automated tests, linting, type-checking (binary pass/fail)
2. **Reviewer agent** — code quality, readability, architectural coherence
3. **Human gate** — every change reviewed during bootstrap

### Key Infrastructure

- **Launcher service** — dispatches agents, manages job queue, tracks progress
- **Job queue** — polling-based (5s interval), two slot pools (agent/infra)
- **SSE streaming** — real-time agent events to the dashboard
- **MongoDB** — all persistent state (cycles, tasks, runs, events, knowledge)

## The Self-Improvement Loop

Agents modify their own codebase: code, prompts, knowledge, and configuration. Better code → better agents → better code. The system earns autonomy incrementally through demonstrated reliability.

# Agent 系统

> 6 个专业 agent 在隔离 Docker 容器中可靠执行，具备自动错误恢复能力。

## Inherited Specs
- TypeScript strict mode, Node.js 22, ES modules
- Monorepo: apps/server (Express), apps/dashboard (Next.js), packages/shared
- Agent prompts versioned in agents/ directory
- All containers labeled zombie-farm=agent
- Godot 4.6.1 locked across all environments

## Decisions
_No decisions recorded yet._

## Constraints
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Context
The Agent System is the parent room for all six specialized agents (Orchestrator, Coder, Tester, Reviewer, Integrator, Curator) plus infrastructure concerns (container lifecycle, spawner, stream capture). Each agent runs in an isolated Docker container with full permissions inside the container boundary. System prompts are passed via file, and output is captured as NDJSON stream-json format.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

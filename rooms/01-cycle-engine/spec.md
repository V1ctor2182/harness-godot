# Cycle 引擎

> 管理 bounded work units (cycles)，驱动 plan→implement→review→integrate→retrospect 五阶段流转。

## Inherited Specs
- TypeScript strict mode, Node.js 22, ES modules
- Monorepo: apps/server (Express), apps/dashboard (Next.js), packages/shared
- Agent prompts versioned in agents/ directory
- All containers labeled zombie-farm=agent
- Godot 4.6.1 locked across all environments

## Decisions
_No decisions recorded yet._

## Constraints
- Cycle 包含 3-7 个 tasks
- All tasks failed → cycle marked failed, no integrator spawned, human must unblock
- Phase transitions are atomic — advance-cycle job handles one transition
- Cycle._id is auto-incrementing integer
- Task._id format: TASK-{padded number}

## Context
The Cycle Engine manages bounded work units called cycles that drive the five-phase workflow: plan, implement, review, integrate, and retrospect. It handles task lifecycle transitions (backlog→ready→in-progress→in-review→done/failed), phase transitions, and cycle failure paths. When all tasks in a cycle fail, the cycle is marked failed and requires human intervention.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

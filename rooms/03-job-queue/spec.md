# 任务队列

> Polling-based work queue with dual slot pools (3 agent / 2 infra)。Approval gates 控制 human review，stale job detection 防止任务卡死。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- Polling interval: 5 seconds
- Dual slot pools: 3 concurrent agent, 2 concurrent infra
- Job status: pending→active→completed/failed
- Protected paths (agents/, prd/, docker/, rooms/_tree.yaml) always require approval
- Stale job detection: infra 10min, agent based on role timeout

## Context
The job queue is the central work distribution mechanism for Ludus. It manages concurrent agent and infrastructure jobs through separate slot pools, enforces approval gates for protected paths, and detects stale jobs to prevent tasks from getting stuck.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

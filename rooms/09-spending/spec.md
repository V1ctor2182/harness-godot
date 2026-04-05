# 成本控制

> Per-run 成本追踪、budget caps 强制执行、circuit breaker 防止 runaway agent spending。80% soft warning auto-pause，100% hard cap block spawns。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- Control.spentUsd atomically incremented after each AgentRun
- Per-run budget: $5 default (CLI --max-budget-usd)
- Soft warning at 80%: emit system:spending_warning SSE, pause mode
- Hard cap at 100%: hold spawn jobs, require approval
- Reconciliation on startup: sum all AgentRun.costUsd vs Control.spentUsd

## Context
The spending module provides per-run cost tracking, budget cap enforcement, and circuit breaker protection against runaway agent spending. It implements a two-tier warning system with soft pause at 80% and hard block at 100%, plus startup reconciliation to ensure accuracy.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

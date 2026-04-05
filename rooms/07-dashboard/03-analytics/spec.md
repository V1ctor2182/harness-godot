# 数据分析

> Cycle metrics、spending charts、milestone progress 和 test results 聚合视图。Goal coverage 计算、retry breakdown、first-pass review rate。

## Inherited Specs
- Next.js App Router with SSR
- SSE for real-time updates (not WebSocket)
- Reconnection logic with event replay (last 100 events)
- Heartbeat every 30 seconds

## Decisions
_No decisions recorded yet._

## Constraints
- Per-cycle metrics: tasksCompleted, tasksFailed, totalCostUsd, totalDurationMs
- Goal coverage: keyword matching against completed tasks
- Retry breakdown by cause: reviewer, CI, PR body
- First-pass review rate tracking
- Spending: current vs cap with 80% warning threshold

## Context
The analytics feature provides aggregated views of cycle metrics, spending charts, milestone progress, and test results. It calculates goal coverage, breaks down retries by cause, tracks first-pass review rates, and monitors spending against budget caps.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

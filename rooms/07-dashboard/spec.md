# 控制面板

> Next.js 实时可观测面板，让 human reviewer 高效做决策。展示 cycle progress、agent reasoning、test results、spending metrics。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- Next.js App Router with SSR
- SSE for real-time updates (not WebSocket)
- Reconnection logic with event replay (last 100 events)
- Heartbeat every 30 seconds

## Context
The dashboard is a Next.js real-time observability panel that enables human reviewers to make efficient decisions. It displays cycle progress, agent reasoning, test results, and spending metrics, using SSE for real-time updates with reconnection and event replay support.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

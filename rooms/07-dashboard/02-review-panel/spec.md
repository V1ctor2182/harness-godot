# 审查面板

> Structured PR diff + agent reasoning 并排展示，支持 approve/reject/request-changes 操作。展示 coder 的 context feedback 和 reviewer 的 severity-graded issues。

## Inherited Specs
- Next.js App Router with SSR
- SSE for real-time updates (not WebSocket)
- Reconnection logic with event replay (last 100 events)
- Heartbeat every 30 seconds

## Decisions
_No decisions recorded yet._

## Constraints
- PR diff + agent rationale side-by-side
- Approve/reject/request-changes actions
- Protected paths highlighted (agents/, prd/, docker/)
- Auto-approval eligibility shown (task type vs protected paths)

## Context
The review panel provides a structured side-by-side view of PR diffs and agent reasoning, enabling human reviewers to approve, reject, or request changes. It highlights protected paths and shows auto-approval eligibility based on task type and path sensitivity.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

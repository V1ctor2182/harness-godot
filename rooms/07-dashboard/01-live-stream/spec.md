# 实时流

> SSE 驱动的 agent 实时思考过程展示。Global event stream 和 per-agent filtered stream，tool calls 和 reasoning steps 结构化渲染。

## Inherited Specs
- Next.js App Router with SSR
- SSE for real-time updates (not WebSocket)
- Reconnection logic with event replay (last 100 events)
- Heartbeat every 30 seconds

## Decisions
_No decisions recorded yet._

## Constraints
- Global stream: /api/events (all events)
- Per-agent stream: /api/events?agentRunId={id}
- Replay: last 100 events for new subscribers
- Event types rendered: text, tool_use, tool_result, error, completion, system
- useSSE() and useAgentSSE() hooks

## Context
The live stream feature provides SSE-driven real-time display of agent thinking processes. It supports both global and per-agent filtered streams, with structured rendering of tool calls and reasoning steps, and replay capability for late-joining subscribers.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

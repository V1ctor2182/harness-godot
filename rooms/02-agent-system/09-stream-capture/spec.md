# 流式输出捕获

> 捕获 Claude Code 的 NDJSON stream-json 输出，解析事件类型，检测 rate limit，持久化到 MongoDB。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- 只持久化 complete turns，不存 streaming deltas
- ToolResultEvent output 截断到 10KB 防止 bloat
- 检测 'hit your limit' 和 'rate limit' 文本标记 rateLimited
- TTL index 30 天后自动清理 events

## Context
The Stream Capture module captures Claude Code's NDJSON stream-json output and parses event types (text, tool_use, tool_result, error, completion, system). It detects rate limit conditions by scanning for specific text markers and persists complete turns to MongoDB's AgentEvent collection. Tool result outputs are truncated to 10KB to prevent storage bloat, and a TTL index automatically cleans up events after 30 days.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

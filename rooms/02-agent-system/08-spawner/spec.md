# Agent 调度器

> Agent dispatch、follow-up job 创建、retry 策略。处理 OOM、timeout、network partition 错误恢复。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- OOM (exit 137): retry with increased memory
- Timeout: retry with same timeout, escalate after repeated
- Network partition: kill container after 5 min no events
- Parse structured output from agent completion event
- Persist TestResult and Screenshot from tester output

## Context
The Spawner handles agent dispatch, follow-up job creation, and retry strategies. It manages error recovery for OOM (exit 137), timeout, and network partition scenarios. On agent completion, it parses structured output from the completion event and persists relevant data like TestResult and Screenshot from tester output. Follow-up jobs (e.g., tester after coder) are created based on the agent's output.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

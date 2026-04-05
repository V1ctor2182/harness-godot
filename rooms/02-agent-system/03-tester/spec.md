# Tester Agent

> 执行 L2 integration、L3 visual、L4 PRD compliance 测试。Quick-fail 原则：低层失败跳过高层。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- Quick-fail: L1 fail→skip L2/L3/L4, L2 fail→skip L3
- L4 (PRD compliance) 与 L2 并行执行
- 输出 TestResult with pass/fail counts, performance data, PRD violations
- Screenshots captured during L3 with AI analysis
- GUT timeout: 3 min, integration test timeout: 2 min, visual test timeout: 5 min

## Context
The Tester Agent executes multi-level testing: L2 integration tests, L3 visual tests, and L4 PRD compliance checks. It follows a quick-fail principle where lower-level failures skip higher-level tests. L4 PRD compliance runs in parallel with L2. When tests fail, the agent creates fix tasks for the next iteration. Screenshots are captured during L3 visual testing and analyzed by AI.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

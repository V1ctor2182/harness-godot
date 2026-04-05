# Orchestrator Agent

> 读取 milestone docs、PRD sections、Feature Room specs 和 retrospectives，生成 3-7 task plans with dependencies。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- Plan 必须包含 3-7 tasks
- 每个 task 必须有 title, description, acceptanceCriteria (min 2)
- tasks 之间用 blockedBy 声明依赖，最小化文件 overlap
- Plan output 格式为 JSON，包含 goal, tasks[], prdRefs[]

## Context
The Orchestrator Agent is the planning brain of each cycle. It reads milestone documents, PRD sections, Feature Room specs, and retrospectives to generate structured task plans. The output is a JSON plan containing 3-7 tasks with dependencies declared via blockedBy, which is then validated by the plan-validator before execution begins.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

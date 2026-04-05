# 计划校验

> 在 plan 执行前进行结构化校验，拦截不合法 plan 防止浪费 agent run。包括 task count、circular deps、field validation、.tscn 互斥检查、pre-merge conflict detection。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- Task count: 3-7
- Circular dependency detection in blockedBy graph
- Required fields: title, description, acceptanceCriteria (min 2)
- Task type must be: feature, bug, chore, refactor, test
- .tscn 和 data/global/ 文件互斥检查 (validateFileMutex)
- Validation failure → job failed, human notified, orchestrator can replan
- Pre-merge: git merge --no-commit --no-ff dry-run

## Context
Plan validation intercepts invalid plans before execution, preventing wasted agent runs. It performs structural validation including task count limits, circular dependency detection, field completeness checks, file mutex enforcement, and pre-merge conflict detection.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

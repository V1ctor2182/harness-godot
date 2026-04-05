# Integrator Agent

> 按拓扑依赖顺序合并 approved PRs。Dry-run conflict detection、merge conflict resolution、regression test 验证。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- 合并顺序: 按 blockedBy 拓扑排序
- 合并前 dry-run: git merge --no-commit --no-ff
- Conflict 时 task re-queue with fresh spawn（不是 failure）
- .tscn (Godot scene) 文件冲突需特殊处理
- 20%+ tasks 冲突重试 → retrospect 阶段 flag process issue

## Context
The Integrator Agent merges approved pull requests in topological dependency order based on blockedBy declarations. It performs dry-run conflict detection before actual merges and handles .tscn (Godot scene) file conflicts with special logic. When conflicts occur, tasks are re-queued with fresh spawns rather than marked as failures. If more than 20% of tasks require conflict retries, the retrospect phase flags a process issue.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

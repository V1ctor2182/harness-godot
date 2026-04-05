# Curator Agent

> 从 cycle 完成后的 PR diffs 中提取 knowledge sediment。写入 Feature Room specs。

## Inherited Specs
- 每个 agent 运行在独立 Docker 容器中
- System prompts 通过 --system-prompt-file 传入，不用 inline CLI args
- Agent 输出格式: stream-json NDJSON
- Container 内 agent 有完全权限，安全边界在 container level

## Decisions
_No decisions recorded yet._

## Constraints
- Retrospect 阶段执行，inbox 为空时不 spawn
- Knowledge 标记 cycle identifier: M{N}-C{N}
- 只处理 L1 (observation) 和 L2 (proposal) entries
- 写入 rooms/ 目录的 spec files

## Context
The Curator Agent runs during the retrospect phase to extract knowledge sediment from completed cycle PR diffs. It processes L1 (observation) and L2 (proposal) knowledge inbox entries and writes them into Feature Room spec files in the rooms/ directory. Each knowledge entry is tagged with a cycle identifier (M{N}-C{N}). The curator is not spawned when the knowledge inbox is empty.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

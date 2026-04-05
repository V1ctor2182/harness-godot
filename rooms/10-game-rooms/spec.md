# 游戏 Feature Rooms

> Meta layer — agents 在 cycle 中产生的 Zombie Farm game design knowledge。Curator 写入 feature specs (decisions, constraints, context)，Orchestrator 和 Coder 读取作为 context。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- Room specs 由 Curator agent 写入，不由 human 直接编辑
- Decisions 标记 cycle identifier M{N}-C{N}
- rooms/_tree.yaml 是 protected path，修改需 human approval
- Coder 实现时读取 room specs 作为 context
- Cross-room dependencies tracked in _tree.yaml

## Context
The game rooms serve as the meta layer where agents produce Zombie Farm game design knowledge during cycles. The Curator agent writes feature specs (decisions, constraints, context), while the Orchestrator and Coder agents read them as context for implementation.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

# 知识系统

> 持久化 institutional memory，通过 quality score feedback loop 驱动上下文选择。Categories: skills, decisions, specs, journal, inbox, pruned, retrospectives。

## Inherited Specs
None (top-level)

## Decisions
_No decisions recorded yet._

## Constraints
- Quality score formula: delta = (useful: +1.0) + (unnecessary: -1.5), score = score*0.95 + delta, clamped [-10, 100]
- Staleness: 5+ cycles 未更新但仍被引用 → flag
- Knowledge files seeded from knowledge/ directory on startup
- Files in knowledge/ upserted (not duplicated)

## Context
The knowledge system provides persistent institutional memory for the harness. It stores categorized knowledge files (skills, decisions, specs, journal, inbox, pruned, retrospectives) and uses a quality score feedback loop to rank and select the most relevant context for each agent run.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

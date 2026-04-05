# 知识策展

> Cycle retrospect 阶段处理 knowledge inbox，提取 spec sediment 写入 Feature Rooms。Staleness detection 和 contradiction 检测。

## Inherited Specs
- Quality score formula: delta = (useful: +1.0) + (unnecessary: -1.5), score = score*0.95 + delta, clamped [-10, 100]
- Staleness: 5+ cycles 未更新但仍被引用 → flag
- Knowledge files seeded from knowledge/ directory on startup
- Files in knowledge/ upserted (not duplicated)

## Decisions
_No decisions recorded yet._

## Constraints
- curate-inbox job: inbox 为空时不 spawn agent
- Curator processes L1 (observation) and L2 (proposal) entries
- Contradiction detection: missing feedback overlaps existing file → stale-content flag
- Dashboard surfaces top-5 highest-scored files each cycle for human spot-check

## Context
The curation module processes the knowledge inbox during cycle retrospectives. It extracts spec sediment into Feature Rooms, detects staleness and contradictions, and surfaces high-value files for human review.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

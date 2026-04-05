# 上下文构建器

> 为每次 agent run 组装最相关的 knowledge files。按 qualityScore 和 lastReferencedAt 排名，注入到容器 /home/agent/context/。处理 retry context（previous error, review issues, files changed）。

## Inherited Specs
- Quality score formula: delta = (useful: +1.0) + (unnecessary: -1.5), score = score*0.95 + delta, clamped [-10, 100]
- Staleness: 5+ cycles 未更新但仍被引用 → flag
- Knowledge files seeded from knowledge/ directory on startup
- Files in knowledge/ upserted (not duplicated)

## Decisions
_No decisions recorded yet._

## Constraints
- Ranking: qualityScore > lastReferencedAt > explicit prdRefs
- Retry context includes: previous error, run summary, review issues, suggestions, files changed
- Files injected as .md via Dockerode putArchive
- Post-run: parse contextFeedback, update quality scores, create inbox entries for missing
- findRepoRoot 检测 .git 和 project.godot
- extractKeywords 支持 snake_case 拆分 (.replace(/_/g, ' '))

## Context
The context builder assembles the most relevant knowledge files for each agent run. It ranks files by quality score and recency, injects them into the Docker container, and processes feedback after each run to update quality scores and flag missing knowledge.

## Interface
_To be defined as implementation progresses._

## Data Schema
_To be defined as implementation progresses._

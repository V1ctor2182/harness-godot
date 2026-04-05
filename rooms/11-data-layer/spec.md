# 数据层

> MongoDB 数据库层 — 11 个 collections 支撑整个系统的状态持久化、事件审计和知识管理。

## Inherited Specs
- TypeScript strict mode, Node.js 22, ES modules
- MongoDB standalone (no replica set)

## Decisions
_No decisions recorded yet._

## Constraints
- MongoDB standalone, no replica set, no change streams
- Connection: `MONGODB_URI` env var or default `mongodb://localhost:27017/zombie-farm`
- Cycle._id auto-incrementing integer via Counter collection
- Task._id format: `TASK-{padded number}` via Counter collection
- AgentEvent TTL: 30 days auto-purge (configurable via `AGENT_EVENT_TTL_DAYS`)
- Control is singleton document (`_id: 'singleton'`)
- AgentRun.output schema `strict: false` — allows agent-introduced fields
- ToolResultEvent output truncated to 10KB to prevent bloat
- Migrations run on server startup before accepting requests
- Additive schema changes don't require migrations; destructive changes do
- Knowledge files upserted on startup from `knowledge/` directory (no duplicates)

## Context
11 Mongoose models define the complete data schema:

| Collection | _id 格式 | 用途 |
|---|---|---|
| cycles | auto-increment int | Cycle 状态机 |
| tasks | TASK-{N} | Task 生命周期 |
| agentruns | {role}-{uuid} | Agent 执行元数据 |
| agentevents | ObjectId | Agent 事件流 (TTL 30d) |
| jobs | ObjectId | Polling job queue |
| knowledgefiles | relative path | 知识库 + quality scores |
| controls | 'singleton' | System mode + spending |
| testresults | ObjectId | L1-L4 测试结果 |
| screenshots | ObjectId | 测试截图 + AI analysis |
| counters | 'cycle' / 'task' | ID 自增序列 |
| migrations | script name | Schema 版本追踪 |

Quality score formula: `score = score * 0.95 + delta` where useful=+1.0, unnecessary=-1.5, clamped [-10, 100].

## Interface
- Models: `apps/server/src/models/*.ts`
- Migrations: `apps/server/src/migrations/`
- Config: `apps/server/src/config.ts`

## Data Schema
See individual model files for complete Mongoose schema definitions.

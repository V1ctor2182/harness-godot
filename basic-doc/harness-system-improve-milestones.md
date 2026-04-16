# Harness System Improvement Milestones (M0–M7)

## Context

Tech design 文档 (01-07) 描述了系统的最终形态，但当前代码存在多个 gap。本文档定义 8 个 milestone，按依赖顺序逐步增删改代码，使其达到 tech design 的最终形态。每个 milestone 可独立部署和验证，不破坏现有运行系统。

**当前状态**: 已完成 19 个 cycle，核心引擎正常运行。主要缺失：Room+Spec 知识系统、Plan Review/Q&A 流程、Dashboard Rooms 页面、重试韧性增强、Discord 通知。

---

## Gap 总览

| # | Gap | 当前 | 目标 (Tech Design) |
|---|-----|------|-------------------|
| 1 | 知识系统 | 扁平 `KnowledgeFile` 模型 | Room + Spec 层级系统 (03-knowledge.md) |
| 2 | Plan Review & Q&A | 无人类问答、无 LLM 审查 | 两个人类介入点 (02-execution.md E1) |
| 3 | Dashboard Rooms | 无 Room 管理页面 | Room tree + Spec 管理 (06-dashboard.md D4) |
| 4 | Control 页面增强 | 仅 mode (active/paused/killed) | 新增 operationMode (auto/supervised/manual) + 事件日志 |
| 5 | 重试韧性 | 无退避、无健康检查 | 指数退避 + 容器健康检查 (04-failure-modes.md) |
| 6 | Discord 通知 | 未实现 | Webhook 通知关键事件 (07-known-issues.md I14) |
| 7 | SSE 增强 | 基础广播，无重放 | 重连重放 100 条 + conflict_requeued 事件 |
| 8 | Analytics & 清理 | 基础分析 | Spec 变更历史 + 启动恢复透明 + 遗留迁移 |
| 9 | Tests Route | Dashboard 通过 AgentRun.output 间接获取 | 独立 GET /api/tests + Dashboard 直连 |

**Scope 外 (Future)**: Agent pool 动态扩容 (I13)、Container 网络隔离、Circuit breaker

---

## M0: Room + Spec 数据基础 + SSE 重放

**目标**: 创建 Room/Spec MongoDB 模型、TypeScript 类型、seedRooms 启动逻辑、CRUD API 路由、Tests 路由、SSE 重连重放。纯数据层 + 基础设施工作，不影响现有运行系统。

**依赖**: 无
**规模**: 大

### 新增类型 — `packages/shared/src/types.ts`

在 `KnowledgeFile` 接口之后新增 Room + Spec 类型:

```typescript
export type RoomType = 'project' | 'epic' | 'feature';
export type RoomLifecycle = 'planning' | 'active' | 'stable' | 'archived';

export interface Room {
  _id: string;           // e.g. "02-03-tester"
  name: string;          // e.g. "Tester Agent"
  parent: string | null; // parent room _id
  type: RoomType;
  owner: string;         // "backend" | "frontend" | "fullstack"
  lifecycle: RoomLifecycle;
  depends_on: string[];
  contributors: string[];
  path: string;          // disk path relative to repo root
  createdAt: Date;
  updatedAt: Date;
}

export type SpecType = 'intent' | 'decision' | 'constraint' | 'contract' | 'convention' | 'change' | 'context';
export type SpecState = 'draft' | 'active' | 'archived';

export interface SpecProvenance {
  source_type: 'human' | 'prd_extraction' | 'codebase_extraction' | 'agent_sediment' | 'curator_review';
  confidence: number;       // 0-1
  source_ref?: string;
  agentRunId?: string;
  cycleId?: number;
  cycle_tag?: string;
}

export interface SpecRelation {
  target: string;
  type: 'depends_on' | 'conflicts_with' | 'supersedes' | 'relates_to';
}

export interface SpecAnchor {
  file: string;
  symbol?: string;
  line_range?: string;
}

export interface Spec {
  _id: string;           // e.g. "intent-00-project-room-001"
  roomId: string;
  type: SpecType;
  state: SpecState;
  title: string;
  summary: string;
  detail: string;
  provenance: SpecProvenance;
  qualityScore: number;  // -10 ~ 100
  lastReferencedAt?: Date;
  relations: SpecRelation[];
  anchors: SpecAnchor[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}
```

**注意**: M0 **不** 修改 `JobType` union 和 `Job` interface。`curate-specs` 和 `notBefore` 分别在 M2 和 M5 加入，避免在没有 handler 的情况下引入 type。

在 `SSEEventType` union 中新增 `'task:conflict_requeued'`。

### YAML → Spec 映射表

现有 spec YAML 是嵌套结构，Spec interface 是扁平的。seedRooms() 需要如下映射:

| YAML 字段 | Spec interface 字段 | 说明 |
|-----------|---------------------|------|
| `spec_id` | `_id` | 直接使用 |
| `type` | `type` | 直接使用 |
| `state` | `state` | 直接使用 |
| `intent.summary` | `summary` | 从嵌套 intent 对象取出 |
| `intent.detail` | `detail` | 从嵌套 intent 对象取出 |
| `intent.summary` | `title` | 同 summary 作为 title |
| `constraints[]` | (不映射到 Spec 字段) | 每个 constraint 可独立生成 constraint 类型 Spec |
| `indexing.tags` | `tags` | 从 indexing 子对象取出 |
| `indexing.priority` | (暂不使用) | 可选存入 Spec.provenance 或忽略 |
| `indexing.domain` | (暂不使用) | 可选存入 tags |
| `provenance` | `provenance` | 字段名 1:1，子字段对应 |
| `relations` | `relations` | 直接映射 |
| `anchors` | `anchors` | 直接映射 |

**edge case**: 如果 `constraints[]` 非空 (如 `rooms/00-project-room/specs/intent-*.yaml` 中的 constraints)，seedRooms 应将每个 constraint 生成独立的 `constraint` 类型 Spec (auto-generated ID: `constraint-{roomId}-{NNN}`)。

### 新建文件

#### `apps/server/src/models/room.ts`

Mongoose schema 对应 Room interface：
- `_id: String` (手动 ID，如 `"02-03-tester"`)
- 索引: `{ parent: 1 }`, `{ lifecycle: 1 }`

#### `apps/server/src/models/spec.ts`

Mongoose schema 对应 Spec interface：
- `_id: String` (手动 ID，如 `"intent-00-project-room-001"`)
- provenance / relations / anchors 作为 embedded subdocuments
- 索引: `{ roomId: 1, type: 1, state: 1 }`, `{ qualityScore: -1 }`, `{ tags: 1 }`

#### `apps/server/src/lib/seed-rooms.ts`

`seedRooms()` 函数：
1. 解析 `rooms/00-project-room/_tree.yaml` (用 `yaml` npm 包)
2. 递归遍历树，对每个节点 (parentId 从遍历上下文推导):
   - 读取 `rooms/{node.path}/room.yaml` 获取额外字段 (contributors, depends_on 等)
   - Upsert Room 文档到 MongoDB (match `_id`，更新 name/parent/type/owner/lifecycle/path)
3. 扫描 `rooms/{node.path}/specs/*.yaml`，解析每个 spec YAML
   - 按上面的映射表转换嵌套 YAML → 扁平 Spec interface
   - `roomId` 从当前遍历的 node.id 获取
   - Upsert Spec 文档到 MongoDB (match `_id` = `spec_id`)
4. 返回 `{ roomsUpserted, specsUpserted }`
5. 目录或文件不存在时 graceful skip (log warn)

#### `apps/server/src/routes/rooms.ts`

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | /api/rooms | 列表，可选 filter: parent, lifecycle, type |
| GET | /api/rooms/tree | 全量树结构 (**注册在 /:id 之前**) |
| GET | /api/rooms/:id | 单个 room + child rooms + spec 计数 |
| POST | /api/rooms | 创建 room |
| PATCH | /api/rooms/:id | 更新 room 元数据 |

#### `apps/server/src/routes/specs.ts`

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | /api/specs | 列表，filter: roomId, type, state, tags |
| GET | /api/specs/:id | 单个 spec |
| POST | /api/specs | 创建 spec |
| PATCH | /api/specs/:id | 更新 spec (state 转换、内容编辑) |
| POST | /api/specs/archive-stale | 批量归档过时 spec (lastReferencedAt 超过 N cycles) |

#### `apps/server/src/routes/tests.ts`

`GET /api/tests` — 直接查询 TestResult 集合，filter: taskId, cycleId, layer。Sort: createdAt DESC, limit 100。

### 修改文件

| 文件 | 变更 |
|------|------|
| `apps/server/src/app.ts` | import + 注册 rooms, specs, tests 路由 |
| `apps/server/src/index.ts` | 启动时调用 `seedRooms()` (在 seedKnowledge 之后) |
| `packages/shared/src/constants.ts` | 添加 `SPEC_TYPE_PRIORITY` 排序常量数组 |
| `apps/server/src/services/sse-manager.ts` | 新增环形缓冲区 (100 条) + replay on reconnect (见下) |

#### SSE 重连重放 — `apps/server/src/services/sse-manager.ts`

这是 Dashboard 体验基础 (刷新页面后不丢失实时状态)，放在 M0 而非 M5:

```typescript
interface ReplayEntry { id: string; eventType: string; data: string; }
const replayBuffer: ReplayEntry[] = [];
const MAX_REPLAY = 100;
```

- `broadcast()` 中 push 到 buffer (满时 shift 驱逐最旧)
- `addClient()` 中如有 `lastEventId` 则重放该 ID 之后的事件；无 lastEventId 则重放全部

### 验证

- 服务启动无错误，日志显示 "Rooms seeded" + 正确的 room/spec 数量 (26 rooms + 各 room 下的 intent specs)
- `GET /api/rooms` 返回 26 个 harness rooms
- `GET /api/rooms/tree` 返回层级树 (00-project-room → children)
- `GET /api/specs?roomId=00-project-room` 返回该 room 的 specs
- intent YAML 中的 `constraints[]` 也被转化为独立 constraint Spec
- `POST /api/specs` 创建新 spec，`PATCH /api/specs/:id` 修改 state
- `GET /api/tests` 返回 TestResult (如果 DB 有数据)
- SSE 新 client 连接 → 收到最近 N 条事件重放
- 现有所有 endpoint 正常工作

---

## M1: Room-Aware Context Builder

**目标**: 改造 Context Builder 的知识选择逻辑，从 Room+Spec 层级系统选择知识注入 agent context。保留 KnowledgeFile 回退，M7 再移除。

**依赖**: M0
**规模**: 大

### 修改文件

#### `apps/server/src/services/launcher/context-builder.ts` — 知识选择改造

**保留不变的部分** (按功能区域，不按行号):
- 系统 prompt 加载 (`AGENTS_DIR` 常量, `promptPath` 读取)
- Task context 构建 (cycle/control/task/blockedBy 信息注入)
- Retry context 注入 (reviewIssues, suggestions, decisions, filesChanged)
- Integrator 分支列表 (topological sort)
- Orchestrator 特殊上下文 (auto-approval categories, recent cycle summaries, task breakdown)
- `extractKeywords()` 函数 — **保留并复用** (用于 Room 名称匹配)
- `applyKeywordBoost()` 函数 — **保留**，适配为对 Spec[] 使用

**替换**: 静态 bootstrap files 注入 + 动态 KnowledgeFile 查询 → Room-aware spec 选择

新增函数 `selectRoomSpecs(params: { role, taskId?, task?, cycleId })`:

**Step 1 — 确定相关 Room**:
- 始终包含 `'00-project-room'`
- 根据 agent role 包含对应 harness room (e.g. role=`tester` → room=`02-03-tester`，role=`coder` → room=`02-02-coder`)
- 从 task title/description 提取关键词 (复用 `extractKeywords()`) → 匹配 Room `name` 和 `_id`
- Task 有 `prdRefs` (GodotPlanTask) → 映射到 `10-game-rooms` 下的子 room
- `GodotPlanTask.featureRooms` 字段 → 直接包含

**Step 2 — 收集 Spec + 继承**:
- 每个相关 room: `SpecModel.find({ roomId, state: 'active' })`
- 沿 parent 链向上走: 收集祖先的 `constraint` 和 `convention` 类型 spec (继承语义)
- 按 `_id` 去重

**Step 3 — 排序 + 截断**:
- 按 `SPEC_TYPE_PRIORITY` 排序: constraint > decision > convention > context > intent
- 同类型内: 用 `applyKeywordBoost()` (task 关键词匹配 spec title/summary)，再按 qualityScore DESC
- ~8000 token 预算 (估算: `detail.length / 4`)
- Constraint 类型始终保留，低优先级类型按预算截断

**Step 4 — 注入 task prompt**:
- 格式: `\n---\n# [${spec.type}] ${spec.title}\n${spec.detail}\n`
- 注入的 spec ID 记录到 `knowledgeFiles` 数组 (字段名保持向后兼容)

**兼容性回退**: 如果 `SpecModel.countDocuments()` === 0 (首次运行 / 尚未 seed)，回退到现有 `knowledge/` 目录磁盘读取 + KnowledgeFileModel 查询。**此回退将在 M7 明确移除。**

#### `processContextFeedback()` 更新

在 `ContextFeedback` 接口中新增可选字段 (向后兼容):
```typescript
useful_specs?: string[];      // Spec IDs
unnecessary_specs?: string[]; // Spec IDs
```

更新函数逻辑:
- 如果 `useful_specs` / `unnecessary_specs` 存在 → 更新对应 Spec 的 qualityScore (同现有 delta 常量)
- `missing` → 在最匹配的 Room 中创建 draft spec (替代创建 inbox KnowledgeFile)
- 现有 `useful` / `unnecessary` (KnowledgeFile IDs) 逻辑保留，M7 移除

#### `apps/server/src/models/agent-run.ts` — 上下文快照

AgentRun schema 新增可选字段:
```typescript
contextSnapshot: {
  specIds: [String],
  roomIds: [String],
  tokenCount: Number,
  truncated: [String],  // spec IDs truncated by token budget
}
```

#### `apps/server/src/routes/agents.ts` — 暴露 contextSnapshot

`GET /api/agents/:id` 响应已经返回完整 AgentRun 文档 (含所有字段)。由于 Mongoose schema 是 `strict: false`，新增的 `contextSnapshot` 字段会自动包含在响应中，无需额外代码。仅需确认前端 AgentRun 类型定义也包含此字段。

### 验证

- 手动触发 orchestrator spawn → task prompt 包含 Room 来源的 spec (格式: `# [constraint] ...`)
- DB 中 `agentRun.contextSnapshot.specIds` 记录了注入的 spec ID
- `GET /api/agents/:id` 响应包含 contextSnapshot
- Spec 集合为空时回退到 `knowledge/` 目录文件 (向后兼容)
- 运行完整 cycle 无报错

---

## M2: Plan Review、Q&A 流程、Curator 升级

**目标**: 实现 plan 阶段的两个人类介入点 (Q&A + Plan Review)，将 Curator 从 `curate-inbox` 升级为 `curate-specs`。

**依赖**: M0, M1
**规模**: 大

### 类型变更 — `packages/shared/src/types.ts`

```typescript
// OrchestratorPlan 新增 questions 字段
export interface PlanQuestion {
  id: string;
  question: string;
  options: Array<{ id: string; label: string }>;
  default?: string;
}

export interface OrchestratorPlan {
  goal: string;
  tasks: PlanTask[];
  questions?: PlanQuestion[];  // 新增
}
```

`JobType` union 新增: `'plan-qa'` | `'plan-review'` | `'plan-approval'` | `'curate-specs'`

**注**: 现有 `JobType` 中有 `'spawn-curator'` (类型定义中存在但代码未使用) 和 `'curate-inbox'` (代码中使用)。关系澄清:
- `spawn-curator`: **移除** (仅存在于类型定义，代码从未使用 — grep 确认)
- `curate-inbox`: **保留** (M2 期间向后兼容别名，M7 移除)
- `curate-specs`: **新增** (M2 的真正 handler)
- `handleAdvanceCycle` 中 `createJob('curate-inbox', ...)` 改为 `createJob('curate-specs', ...)`

### Plan Q&A 流程

#### `apps/server/src/services/launcher/spawner.ts` — Orchestrator 输出处理

在 orchestrator 完成后解析 `output.plan` 时:
1. 检查 `output.plan.questions` 是否非空且 length > 0
2. **如果有问题** → 创建 `plan-qa` job (`requiresApproval: true`, pool: `'infra'`, payload: `{ cycleId, agentRunId, questions }`)
3. 不进入 plan validation，等待人类回答后 replan
4. **如果无问题** → 正常进入 plan validation + review 流程

#### `apps/server/src/routes/jobs.ts` — 新增回答端点

`POST /api/jobs/:id/answer`:
- Body: `{ answers: Record<string, string>, feedback?: string }`
- 验证: job 存在、`type === 'plan-qa'`、`approvalStatus === 'pending'`
- 保存 answers 到 `job.payload.humanAnswers`
- 标记 job 为 `approvalStatus: 'approved'` + `status: 'completed'`
- 创建新的 `spawn` job for orchestrator, `payload.retryContext.humanAnswers = answers` (**不**增加 retryCount)

### Plan Review 流程

#### `apps/server/src/services/job-queue.ts` — handleApplyPlan 改造

当前流程: `validatePlan()` → 直接创建 tasks → advance-cycle

新流程 (在 `validatePlan()` 通过后):

1. **spawn plan-review reviewer**: 创建 `spawn` job，`payload: { role: 'reviewer', subRole: 'plan-review', cycleId, agentRunId }`
   - Reviewer 获取 plan JSON + 相关 Room specs → 输出 verdict

2. **Reviewer verdict 处理** (在 reviewer 完成后的 follow-up 逻辑中):
   - **approved** → 创建 `plan-approval` job (`requiresApproval: true`, pool: `'infra'`, payload: `{ cycleId, agentRunId, planSummary }`)
   - **changes-requested** (reviewCount === 0) → 重新 spawn orchestrator + reviewer feedback in retryContext (计为 retry)
   - **changes-requested** (reviewCount >= 1) → 强制创建 `plan-approval` job，附 reviewer 反馈让人类决定

3. **plan-approval handler** — 新增 `case 'plan-approval':` in processJob switch:
   - 当 job 被 approve → 调用 `handleApplyPlan()` 的后半段 (创建 tasks + advance-cycle)
   - 当 job 被 reject → 重新 spawn orchestrator + human feedback in retryContext (计为 retry，max 1)

#### `apps/server/src/models/job.ts` — type enum 更新

添加: `'plan-qa'`, `'plan-review'`, `'plan-approval'`, `'curate-specs'`

### Curator 升级

#### `apps/server/src/services/job-queue.ts`

- 新增 `case 'curate-specs':` → `handleCurateSpecs(payload)` (同时 `case 'curate-inbox':` alias 到同一函数)
- `handleAdvanceCycle` 中将 `createJob('curate-inbox', ...)` 改为 `createJob('curate-specs', ...)`
- `detectAndFailStaleJobs` 中将 `job.type === 'curate-inbox'` 改为 `job.type === 'curate-inbox' || job.type === 'curate-specs'`

`handleCurateSpecs()` 逻辑:
1. Spawn curator agent (同现有 handleCurateInbox)
2. Curator agent 输出包含 spec sediments (structured output 中新增 `specSediments[]` 字段)
3. 每个 sediment 经置信度路由:
   - `confidence >= 0.75` → `state: 'active'`
   - `0.50 <= confidence < 0.75` → `state: 'draft'`
   - `confidence < 0.50` → 丢弃 (log discard reason)
4. 创建 Spec 文档 (通过 SpecModel.create)
5. 更新对应 Room 的 `updatedAt`

#### `agents/curator.md` — 更新 Curator 系统 prompt

指导 Curator 输出 Spec 格式的 sediment:
- 每个 sediment 需包含: `roomId`, `type` (decision/constraint/context), `confidence` (0-1), `title`, `summary`, `detail`
- 说明置信度规则

### 验证

- 创建 cycle，orchestrator 输出含 questions → `plan-qa` job 创建成功，`requiresApproval: true`
- `POST /api/jobs/:id/answer` → orchestrator 带答案重新 spawn (retryCount 不增加)
- 无 questions 的 plan → validator → plan-review reviewer → `plan-approval` job (requiresApproval)
- `plan-approval` approve → tasks 创建 + advance-cycle
- `plan-approval` reject → orchestrator replan (max 1 retry)
- Reviewer reject (第一次) → orchestrator replan
- Reviewer reject (第二次) → 强制人类审批
- `curate-specs` job → Spec 文档创建，confidence 0.8 → active, 0.6 → draft
- 旧的 `curate-inbox` job type 仍能被处理 (向后兼容)

---

## M3: Dashboard Rooms & Spec 管理 + Tests 页面更新

**目标**: 构建 Dashboard 的 Rooms 页面——树形导航、Spec 详情面板、筛选、Spec 管理操作。同时更新 Tests 页面使用新的 `/api/tests` 端点。

**依赖**: M0
**规模**: 中

### 变更

#### `apps/dashboard/src/lib/api.ts` — API 客户端

新增 Room/Spec/Test API 函数:
```typescript
// Rooms
listRooms: (params?) => request('/rooms', { params }),
getRoomTree: () => request('/rooms/tree'),
getRoom: (id) => request(`/rooms/${id}`),

// Specs
listSpecs: (params?) => request('/specs', { params }),
getSpec: (id) => request(`/specs/${id}`),
createSpec: (data) => request('/specs', { method: 'POST', body: data }),
updateSpec: (id, data) => request(`/specs/${id}`, { method: 'PATCH', body: data }),
archiveStaleSpecs: (roomId) => request('/specs/archive-stale', { method: 'POST', body: { roomId } }),

// Tests (新增)
listTests: (params?) => request('/tests', { params }),
```

新增对应 TypeScript 接口: `RoomTreeNode`, `Room`, `Spec`, `CreateSpecPayload` (从 `@harness/shared` re-export 或在 dashboard 侧定义)。

#### 新建 `apps/dashboard/src/app/rooms/page.tsx`

Server component → 获取 room tree → 渲染 RoomsClient。

#### 新建 `apps/dashboard/src/app/rooms/rooms-client.tsx`

**双栏布局**:

**左栏 — Room 树**:
- 可展开/折叠的层级树
- 每个节点显示: room name + spec count badge
- 点击选中 room

**右栏 — Room 详情 + Spec 列表**:
- Room header: name, lifecycle badge, type badge, spec 数量 (N total, M draft)
- Filter bar: All / constraint / decision / convention / context / intent 按钮 + "仅 draft" toggle
- Spec 列表: type badge, title, state badge (draft 显示 ⚠), qualityScore, provenance info
- Spec 操作: [Activate] (draft→active), [Archive], [Edit] (inline 编辑)
- [+ New Spec] 按钮 → 表单 (roomId 预填)
- [Archive All Stale] 批量操作

#### `apps/dashboard/src/app/layout.tsx` — 导航更新

navItems 数组新增:
```typescript
{ href: '/rooms', label: 'Rooms', icon: FolderTree }
```

**同时**在文件顶部的 lucide-react import 中添加 `FolderTree`。

#### `apps/dashboard/src/app/tests/page.tsx` — 改用 Tests API

当前实现: 通过 `api.listAgentRuns({ role: 'tester' })` + `api.listAgentRuns({ role: 'coder' })` 间接从 `AgentRun.output.testResults` 提取测试结果。

**改为**: 直接调用 `api.listTests()` 查询 TestResult 集合。简化数据获取逻辑:
- 移除双重 AgentRun 查询
- 直接渲染 TestResult 列表 (layer, status, totalTests, passed, failed, failures)
- 保留现有的 UI 布局和样式

### 验证

- 导航到 `/rooms`
- Room 树显示 26 个 harness rooms (层级结构: 00-project-room → 01-cycle-engine, 02-agent-system → 02-01-orchestrator...)
- 点击 room → 右栏显示其 specs
- 类型筛选正常
- Draft spec 显示 ⚠ 图标
- [Activate] / [Archive] / [+ New Spec] / [Archive All Stale] 操作正常
- `/tests` 页面直接显示 TestResult 数据 (不再依赖 AgentRun.output)

---

## M4: Dashboard Q&A、Plan Review UI、Control 增强

**目标**: Jobs 页面添加 Q&A 表单和 Plan Review UI，升级 Control 页面 (新增 operationMode，独立于现有 mode)。

**依赖**: M2 (后端 Q&A/Plan Review 必须先就绪)
**规模**: 中

### 变更

#### `apps/dashboard/src/app/jobs/page.tsx` — Q&A 表单

当 `job.type === 'plan-qa'` 时:
- 渲染问题列表 + radio button 选项
- `default` 选项预选
- 可选的自由文本 feedback 字段
- [Submit Answers] 按钮 → `POST /api/jobs/:id/answer`
- 提交后显示 "Replanning..." 状态

#### `apps/dashboard/src/app/jobs/page.tsx` — Plan Review UI

当 `job.type === 'plan-approval'` 且 `requiresApproval === true` 时:
- 显示 plan 摘要 (从 job.payload.planSummary 获取: task 列表含 title, type, 依赖关系)
- 如有 reviewer feedback (job.payload.reviewerFeedback)，高亮显示
- 可选 feedback 文本框
- [Approve Plan] → `POST /api/jobs/:id/approve`
- [Request Changes] → `POST /api/jobs/:id/reject` (附 feedback 作为 reason)

#### `apps/dashboard/src/app/control/control-panel.tsx` — 增强

**两个独立维度 (不是替换)**:

1. **System Mode** (现有): `active | paused | killed` — 系统运行状态
   - 保持不变

2. **Operation Mode** (新增): `auto | supervised | manual` — 人类参与度
   - `auto`: job 的 `requiresApproval` 被忽略，所有操作自动执行
   - `supervised`: 仅 auto-approval categories 内的 job 自动执行，其他需人类批准 (默认)
   - `manual`: 所有 job 需人类批准
   - UI: 独立的下拉/radio group，在 System Mode 下方

3. **Recent Events Log** (新增区段):
   - 订阅 SSE 事件，显示最近 20 条
   - 每条: timestamp, event type badge, 简述
   - 使用现有 `useGlobalSSE` hook

#### 类型和模型更新

**`packages/shared/src/types.ts`**:
```typescript
export type OperationMode = 'auto' | 'supervised' | 'manual';

// Control 接口新增 (与 mode 独立共存)
export interface Control {
  // ... 现有字段 ...
  operationMode?: OperationMode;  // 新增，默认 'supervised'
}
```

**`apps/server/src/models/control.ts`**: schema 新增 `operationMode: { type: String, enum: ['auto', 'supervised', 'manual'], default: 'supervised' }`。

**`apps/server/src/services/job-queue.ts`**: 在 `pollJobs()` 中，根据 `control.operationMode` 调整 approval 过滤逻辑:
- `auto`: 忽略 `requiresApproval`，所有 pending job 可被 claim
- `supervised`: 现有逻辑 (requiresApproval=true 需 approvalStatus=approved)
- `manual`: 所有 job 都需 approval

**`apps/dashboard/src/lib/api.ts`**: 新增 `answerJob(id, answers, feedback?)` 函数。

### 验证

- Orchestrator 输出含 questions → Jobs 页面出现 Q&A 表单
- 提交答案 → orchestrator 重新 spawn
- `plan-approval` job 显示 plan 摘要 + Approve/Reject 按钮
- Control 页面显示 **两个** 独立下拉: System Mode + Operation Mode
- Operation Mode 设为 `auto` → job 不再等待 approval
- Recent events log 实时显示 SSE 事件

---

## M5: 重试韧性 & 容器健康检查

**目标**: 添加指数退避重试 (Job.notBefore)、容器 WAIT 阶段健康检查、错误分类。

**依赖**: 无 (独立基础设施改进)
**规模**: 中

### 变更

#### `packages/shared/src/types.ts` — Job.notBefore

`Job` interface 新增: `notBefore?: Date`

#### `apps/server/src/models/job.ts` — schema 更新

schema 新增: `notBefore: { type: Date }`

#### `packages/shared/src/constants.ts` — 退避常量

```typescript
// 2 档退避 (DEFAULT_MAX_RETRIES=1，第 3 档永远不会触发)
export const RETRY_BACKOFF_MS = [30_000, 120_000]; // 30s, 2min
```

#### `apps/server/src/services/job-queue.ts` — 指数退避

**pollJobs()** 中 pending job 查询:

将现有的 `{ status: 'pending', pool, $or: [requiresApproval...] }` 改为 `$and` 结构:
```typescript
{
  status: 'pending',
  pool,
  $and: [
    { $or: [{ requiresApproval: false }, { requiresApproval: true, approvalStatus: 'approved' }] },
    { $or: [{ notBefore: { $exists: false } }, { notBefore: null }, { notBefore: { $lte: new Date() } }] },
  ],
}
```

**retry 逻辑** (processJob catch block): 设置 notBefore:
```typescript
import { RETRY_BACKOFF_MS } from '@harness/shared';
const delay = RETRY_BACKOFF_MS[Math.min(job.retryCount, RETRY_BACKOFF_MS.length - 1)];
// $set 中新增 notBefore
{ $set: { status: 'pending', error, notBefore: new Date(Date.now() + delay) }, $inc: { retryCount: 1 } }
```

#### `apps/server/src/services/launcher/container.ts` — 容器健康检查

在 `waitForContainer()` 中新增 30s 间隔 docker inspect 检查:
- 每 30s 调用 `container.inspect()` 检查 `.State.Status`
- 如果非 `running` (exited/dead/removing) → clearInterval + 提前 resolve (使 waitForContainer 返回)
- 捕获容器在 Docker stream 之外静默死亡的情况

#### `apps/server/src/services/launcher/stream-capture.ts` — 错误分类

解析 agent completion output 时识别 `error_type` 字段:
- `'permanent'` → 不重试，标记 task 为 `blocked`
- `'transient'` → 正常重试
- 缺失/`'unknown'` → 正常重试 (现有行为不变)

**`packages/shared/src/types.ts`**: `AgentStructuredOutput` 新增 `errorType?: 'permanent' | 'transient' | 'unknown'`

#### SSE 新增事件

`apps/server/src/services/launcher/spawner.ts`: Integrator 检测 merge conflict 并 requeue task 时广播:
```typescript
broadcast('task:conflict_requeued', { taskId, conflictFiles, attempt });
```

### 验证

- 故意让 job 失败 → 验证 DB 中 job.notBefore 在未来 (30s 后)
- poll loop 跳过 notBefore 在未来的 job → job 在 30s 后才被重新 claim
- 中途 kill 容器 → 健康检查在 30s 内检测到死亡
- Agent 输出 `errorType: 'permanent'` → task 标记为 blocked，不重试
- merge conflict 时 `task:conflict_requeued` 事件出现在 SSE 流中

---

## M6: Discord Webhook 通知

**目标**: 实现关键系统事件的 Discord webhook 通知。

**依赖**: 无 (独立)
**规模**: 小 (~50 行 TypeScript)

### 变更

#### 新建 `apps/server/src/services/notifier.ts`

```typescript
// 核心函数
async function sendDiscord(content: string): Promise<void>
// DISCORD_WEBHOOK_URL 为空 → graceful no-op
// 失败只 log 不 throw (best-effort)

// 通知接口
notifyJobRequiresApproval(jobType: string, jobId: string): Promise<void>
notifySpendingWarning(percent: number): Promise<void>
notifyRateLimited(): Promise<void>
notifyCycleCompleted(cycleId: number): Promise<void>
notifyCycleFailed(cycleId: number): Promise<void>
notifyPlanQuestions(cycleId: number): Promise<void>
```

#### `apps/server/src/config.ts`

新增: `discordWebhookUrl: env('DISCORD_WEBHOOK_URL', '')`

#### `.env.example`

新增: `DISCORD_WEBHOOK_URL=` (空默认值)

#### Hook 到各个服务

| 文件 | 触发点 | 调用 |
|------|--------|------|
| `job-queue.ts` | 创建 `requiresApproval: true` 的 job 后 | `notifyJobRequiresApproval()` |
| `job-queue.ts` | `cycle:completed` 广播后 | `notifyCycleCompleted()` |
| `job-queue.ts` | `cycle:failed` 广播后 | `notifyCycleFailed()` |
| `stream-capture.ts` | 检测到 rate limit 并暂停后 | `notifyRateLimited()` |
| `spawner.ts` | `system:spending_warning` 广播后 | `notifySpendingWarning()` |
| `job-queue.ts` | 创建 `plan-qa` job 后 (M2 就绪时) | `notifyPlanQuestions()` |

### 验证

- 设置 `DISCORD_WEBHOOK_URL` → 创建需审批的 job → Discord 收到消息
- `DISCORD_WEBHOOK_URL` 为空 → 无错误、无消息
- 触发 spending warning → Discord 收到消息

---

## M7: Analytics、遗留迁移、清理

**目标**: 增强 analytics、启动恢复透明、KnowledgeFile → Spec 迁移、移除 Context Builder 的 KnowledgeFile 回退、清理废弃代码。

**依赖**: M0-M2 (Room+Spec 系统完全就绪，Curator 已能产出 Spec)
**规模**: 中

### 变更

#### `apps/server/src/routes/analytics.ts` — 增强

新增端点:
- `GET /api/analytics/specs` — 每 cycle 的 spec 创建/修改/归档数量 (join `Spec.provenance.cycleId`)
- `GET /api/analytics/spending-by-task` — 每 task 的 `AgentRun.costUsd` 汇总

增强现有 `GET /api/analytics/tasks`:
- 新增 `successRate` (done / total) 和 `avgCostPerTask` 字段

#### `apps/server/src/index.ts` — 启动恢复透明

新增模块级变量:
```typescript
let startupReady = false;
let lastRecovery: { orphansFound: number; jobsFailed: number; roomsSeeded: number } | null = null;
```

Recovery 阶段各步骤完成后更新 `lastRecovery`，全部完成后 `startupReady = true`。

Export `getStartupStatus()` 供 health route 使用。

#### `apps/server/src/routes/health.ts` — 暴露启动状态

响应中新增:
```json
{
  "startupReady": true,
  "lastRecovery": { "orphansFound": 0, "jobsFailed": 1, "roomsSeeded": 26 }
}
```

#### 新建 `apps/server/src/migrations/018-migrate-knowledge-to-specs.ts`

迁移逻辑:
1. 读取所有 `status: 'active'` 的 KnowledgeFile
2. 映射到目标 Room:
   - `boot.md` → `00-project-room`, type=`context`
   - `conventions.md` → `00-project-room`, type=`convention`
   - `glossary.md` → `00-project-room`, type=`context`
   - `decisions` 类别 → 按 title 关键词匹配 room, type=`decision`
   - `specs` 类别 → 按 title 关键词匹配 room, type 由内容推断
   - `inbox` 类别 → 最匹配 room 的 `draft` spec
   - `retrospectives` 类别 → **跳过** (journal 条目，非 spec)
   - **Fallback**: 关键词匹配不到任何 room → 归入 `00-project-room`
3. 创建对应 Spec 文档 (`provenance.source_type: 'codebase_extraction'`)
4. **不删除** KnowledgeFile (软迁移)
5. 标记已迁移的 KnowledgeFile 为 `status: 'archived'`
6. 幂等: 如果 Spec `_id` 已存在则 skip

#### 清理废弃代码

| 文件 | 变更 |
|------|------|
| `packages/shared/src/types.ts` | 从 JobType 移除 `'curate-inbox'` 和 `'spawn-curator'` 和 `'spawn-reflect'` (代码中均未使用) |
| `apps/server/src/services/job-queue.ts` | 移除 `case 'curate-inbox':` 别名 (只保留 `case 'curate-specs':`) |
| `apps/server/src/services/launcher/context-builder.ts` | **移除 KnowledgeFile 回退**: 删除 STATIC_KNOWLEDGE_IDS, 删除 `knowledge/` 目录磁盘读取, 删除 KnowledgeFileModel 动态查询, 删除 `applyKeywordBoost` 对 KnowledgeFile 的使用 (保留对 Spec 的使用) |
| `apps/server/src/services/launcher/context-builder.ts` | `processContextFeedback()` 移除 KnowledgeFile 相关逻辑 (仅保留 Spec 逻辑) |
| `apps/server/src/routes/knowledge.ts` | 添加 deprecation warning header + 保留 GET 只读 (不删除路由，防止 Dashboard 旧代码报错) |

### 验证

- 运行 migration 018 → KnowledgeFile 迁移为 Spec，关键词无匹配的归入 `00-project-room`
- `GET /api/analytics/specs` 返回 spec 变更历史
- `GET /api/health` 包含 `startupReady: true` 和 `lastRecovery`
- Context builder **不再**查询 KnowledgeFileModel 或读取 `knowledge/` 目录
- Spec 集合为空时 context builder **不再回退** (此时 task prompt 中无知识注入，而非报错)
- 服务启动无 `curate-inbox` 相关错误

---

## 执行顺序总结

```
M0 (数据基础+SSE重放) ──┬──→ M1 (Context Builder) ──→ M2 (Plan Review + Curator) ──→ M7 (迁移+清理)
                        │                                      │
                        ├──→ M3 (Dashboard Rooms+Tests) ───────┤
                        │                                      ↓
                        │                              M4 (Dashboard Q&A + Control)
                        │
M6 (Discord 通知) ← 无依赖
M5 (重试韧性) ← 无依赖
```

**推荐执行路径**: M0 → M6 (快速 win, 并行) → M3 (并行, 快速可见成果验证 M0 数据层) → M1 → M2 → M5 (并行, 不阻塞下游) → M4 → M7

**理由**: M3 只依赖 M0 且是纯前端，先出 Rooms 页面能尽早验证 M0 的数据层是否正确。M5 不阻塞任何下游，推后不影响关键路径。

**关键路径**: M0 → M1 → M2 → M7

| Milestone | Scope | 依赖 | 主要风险 |
|-----------|-------|------|---------|
| M0: 数据基础+SSE重放 | 大 | 无 | YAML 嵌套→扁平映射边界情况 |
| M1: Context Builder | 大 | M0 | Token 预算估算准确性、Room 匹配质量 |
| M2: Plan Review + Curator | 大 | M0, M1 | 复杂状态机 (Q&A → validate → review → approve，3 个新 job type) |
| M3: Dashboard Rooms+Tests | 中 | M0 | 大量 room 时的树渲染性能 |
| M4: Dashboard Q&A + Control | 中 | M2 | operationMode 与现有 mode 的 UI 共存 |
| M5: 重试韧性 | 中 | 无 | poll loop 的 $and/$or 查询重构 |
| M6: Discord 通知 | 小 | 无 | 无 |
| M7: 迁移 + 清理 | 中 | M0-M2 | KnowledgeFile → Spec 映射启发式 (fallback: 00-project-room) |

---

## 关键文件索引

| 文件 | 涉及 Milestone |
|------|---------------|
| `packages/shared/src/types.ts` | M0, M1, M2, M4, M5 |
| `packages/shared/src/constants.ts` | M0, M5 |
| `apps/server/src/models/room.ts` (新) | M0 |
| `apps/server/src/models/spec.ts` (新) | M0 |
| `apps/server/src/models/job.ts` | M2, M5 |
| `apps/server/src/models/control.ts` | M4 |
| `apps/server/src/models/agent-run.ts` | M1 |
| `apps/server/src/lib/seed-rooms.ts` (新) | M0 |
| `apps/server/src/services/launcher/context-builder.ts` | M1, M7 |
| `apps/server/src/services/job-queue.ts` | M2, M4, M5 |
| `apps/server/src/services/launcher/spawner.ts` | M2, M5 |
| `apps/server/src/services/launcher/container.ts` | M5 |
| `apps/server/src/services/launcher/stream-capture.ts` | M5 |
| `apps/server/src/services/sse-manager.ts` | M0 |
| `apps/server/src/services/notifier.ts` (新) | M6 |
| `apps/server/src/routes/rooms.ts` (新) | M0 |
| `apps/server/src/routes/specs.ts` (新) | M0 |
| `apps/server/src/routes/tests.ts` (新) | M0 |
| `apps/server/src/routes/jobs.ts` | M2 |
| `apps/server/src/routes/analytics.ts` | M7 |
| `apps/server/src/routes/health.ts` | M7 |
| `apps/server/src/app.ts` | M0 |
| `apps/server/src/index.ts` | M0, M7 |
| `apps/server/src/config.ts` | M6 |
| `apps/server/src/migrations/018-*.ts` (新) | M7 |
| `apps/dashboard/src/lib/api.ts` | M3, M4 |
| `apps/dashboard/src/app/rooms/` (新) | M3 |
| `apps/dashboard/src/app/tests/page.tsx` | M3 |
| `apps/dashboard/src/app/jobs/page.tsx` | M4 |
| `apps/dashboard/src/app/control/control-panel.tsx` | M4 |
| `apps/dashboard/src/app/layout.tsx` | M3 |
| `agents/curator.md` | M2 |
| `rooms/00-project-room/_tree.yaml` | M0 (数据源) |

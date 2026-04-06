# Knowledge — 知识系统

Room + Spec 层级知识系统：结构、生命周期、Schemas、API。

## K1. Room + Spec 结构

```
  ┌─────────────────────────────────────────────────────────────┐
  │              KNOWLEDGE SYSTEM (hierarchical)                  │
  └─────────────────────────────────────────────────────────────┘

  两个 MongoDB collections，知识按功能域组织:

  Room collection (harness 26 + game ~20)
  ┌───────────────────────────────────────────────────────────┐
  │  { _id: "02-agent-system",                                │
  │    name: "Agent 系统",                                    │
  │    parent: "00-project-room",                             │
  │    type: "epic",                                          │
  │    lifecycle: "active",                                   │
  │    depends_on: [] }                                       │
  │                                                           │
  │  { _id: "02-03-tester",                                   │
  │    name: "Tester Agent",                                  │
  │    parent: "02-agent-system",   ← 层级关系               │
  │    type: "feature",                                       │
  │    lifecycle: "active",                                   │
  │    depends_on: ["05-testing-pipeline"] }                   │
  │                                                           │
  │  ... 树形结构，子 Room 自动继承父 Room 的 constraints      │
  └───────────────────────────────────────────────────────────┘

  Spec collection (每个 Room 多个 typed specs)
  ┌───────────────────────────────────────────────────────────┐
  │  { _id: "constraint-02-03-001",                           │
  │    roomId: "02-03-tester",      ← 归属于 Tester Room     │
  │    type: "constraint",          ← 7 种之一               │
  │    state: "active",                                       │
  │    title: "Quick-fail 原则",                              │
  │    summary: "L1 fail 则跳过 L2/L3/L4",                   │
  │    detail: "测试层级...",                                  │
  │    provenance: {                 ← 完整溯源               │
  │      source_type: "agent_sediment",                       │
  │      confidence: 0.85,                                    │
  │      cycle_tag: "M2-C5",                                  │
  │      agentRunId: "curator-abc" },                         │
  │    qualityScore: 78,                                      │
  │    anchors: [{                   ← 绑定到代码             │
  │      file: "agents/tester.md",                            │
  │      symbol: "quick-fail-rule" }],                        │
  │    tags: ["tester", "L1", "L2"] }                         │
  └───────────────────────────────────────────────────────────┘

  7 种 Spec Types:
  ┌────────────────┬──────────────────────────────────────────┐
  │ intent         │ 为什么做这件事                            │
  │ decision       │ 为什么选 A 不选 B                         │
  │ constraint     │ 不能做什么 / 边界条件                      │
  │ contract       │ 组件之间的接口约定                         │
  │ convention     │ 团队怎么做事                              │
  │ change         │ 一次具体变更的记录                         │
  │ context        │ 背景信息                                  │
  └────────────────┴──────────────────────────────────────────┘
```

## K2. Knowledge 生命周期

```
  ┌─────────────────────────────────────────────────────────────┐
  │           KNOWLEDGE LIFECYCLE                                │
  └─────────────────────────────────────────────────────────────┘

  ┌─── WRITE PATH (知识产生) ──────────────────────────────────┐
  │                                                             │
  │  Cycle 完成                                                 │
  │       │                                                     │
  │       ▼                                                     │
  │  ┌──────────────┐     读取 PR diffs     ┌───────────────┐  │
  │  │   Curator    │────────────────────►  │  提取 sediment │  │
  │  │   Agent      │                       │               │  │
  │  └──────────────┘                       │  decision:    │  │
  │                                         │   "选 A 不选 B"│  │
  │                                         │  constraint:  │  │
  │                                         │   "FPS ≥ 30"  │  │
  │                                         │  context:     │  │
  │                                         │   "Godot bug" │  │
  │                                         └───────┬───────┘  │
  │                                                 │          │
  │                              confidence routing │          │
  │                         ┌───────────────────────┤          │
  │                         │                       │          │
  │                    ≥ 0.75                   0.50-0.74      │
  │                    auto-active              draft           │
  │                         │                       │          │
  │                         ▼                       ▼          │
  │                  ┌─────────────────────────────────────┐   │
  │                  │  POST /api/specs                    │   │
  │                  │  { roomId, type, state, provenance }│   │
  │                  └─────────────────────────────────────┘   │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

  ┌─── READ PATH (知识消费) ────────────────────────────────────┐
  │                                                             │
  │  Agent 即将启动                                              │
  │       │                                                     │
  │       ▼                                                     │
  │  Step 1: 定位相关 Rooms                                     │
  │  ┌──────────────────────────────────────────────────┐      │
  │  │ Task keywords / prdRefs → match Room names/tags  │      │
  │  │ Always include: 00-project-room (global specs)   │      │
  │  └──────────────────────┬───────────────────────────┘      │
  │                         ▼                                   │
  │  Step 2: 收集 Specs + 继承                                  │
  │  ┌──────────────────────────────────────────────────┐      │
  │  │ Relevant Room → active specs                     │      │
  │  │ Walk up parent chain → collect constraints/convs │      │
  │  │                                                  │      │
  │  │ Example: Task 关于 Tester                        │      │
  │  │   02-03-tester specs (direct)                    │      │
  │  │ + 02-agent-system constraints (inherited)        │      │
  │  │ + 00-project-room conventions (inherited)        │      │
  │  └──────────────────────┬───────────────────────────┘      │
  │                         ▼                                   │
  │  Step 3: 按 type 排序注入                                   │
  │  ┌──────────────────────────────────────────────────┐      │
  │  │ Priority:                                        │      │
  │  │   1. constraints  (必须遵守)                      │      │
  │  │   2. decisions    (已做选择，不重复决策)            │      │
  │  │   3. conventions  (团队约定)                      │      │
  │  │   4. context      (背景参考)                      │      │
  │  │   5. intent       (功能目标)                      │      │
  │  │ Within each type: qualityScore DESC              │      │
  │  │ Token budget: ~8000 tokens for specs             │      │
  │  └──────────────────────────────────────────────────┘      │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

  ┌─── FEEDBACK PATH (质量演化) ────────────────────────────────┐
  │                                                             │
  │  Agent 完成后 emit contextFeedback:                         │
  │  {                                                          │
  │    useful_specs:      ["constraint-02-03-001", ...]         │
  │    unnecessary_specs: ["context-08-infra-003", ...]         │
  │    missing:           ["how to handle .tscn conflicts"]     │
  │  }                                                          │
  │       │                                                     │
  │       ▼                                                     │
  │  ┌──────────────────────────────────────────────────┐      │
  │  │ useful     → spec.qualityScore += 1.0            │      │
  │  │ unnecessary→ spec.qualityScore -= 1.5            │      │
  │  │ decay      → score = score * 0.95 + delta        │      │
  │  │ clamp      → [-10, 100]                          │      │
  │  │                                                  │      │
  │  │ score ≤ -10 → spec.state = archived              │      │
  │  │ missing    → create draft spec in best Room      │      │
  │  └──────────────────────────────────────────────────┘      │
  │                                                             │
  │  Staleness Detection:                                       │
  │  ┌──────────────────────────────────────────────────┐      │
  │  │ Spec not updated in 5+ cycles but referenced    │      │
  │  │   → flag as stale                               │      │
  │  │ "missing" overlaps existing spec content         │      │
  │  │   → flag as stale-content, suggest update       │      │
  │  │ Anchor file deleted/renamed                     │      │
  │  │   → flag as orphaned anchor                     │      │
  │  └──────────────────────────────────────────────────┘      │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

  完整循环:
  Curator 写入 Specs → Context Builder 选择注入 → Agent 消费 →
  Agent 反馈质量 → qualityScore 更新 → 下次选择更精准 →
  Curator 提取新 sediment → ...
```

## K3. MongoDB Schemas

### Room Collection

```typescript
{
  _id: String,              // "02-03-tester"
  name: String,             // "Tester Agent"
  parent: String | null,    // "02-agent-system"
  type: 'project' | 'epic' | 'feature',
  owner: 'backend' | 'frontend' | 'fullstack',
  lifecycle: 'planning' | 'active' | 'stable' | 'archived',
  depends_on: String[],     // Room IDs
  contributors: String[],   // Agent roles that write to this room
  path: String,             // "rooms/02-agent-system/03-tester"
  created_at: Date,
  updated_at: Date,
}

Index: { parent: 1 }
Index: { lifecycle: 1 }
```

### Spec Collection

```typescript
{
  _id: String,              // "intent-02-03-tester-001"
  roomId: String,           // → Room._id
  type: 'intent' | 'decision' | 'constraint' | 'contract'
      | 'convention' | 'change' | 'context',
  state: 'draft' | 'active' | 'archived',

  // 内容
  title: String,
  summary: String,          // 一句话摘要
  detail: String,           // 完整内容

  // 溯源
  provenance: {
    source_type: 'human' | 'prd_extraction' | 'codebase_extraction'
              | 'agent_sediment' | 'curator_review',
    confidence: Number,     // 0.0 - 1.0
    source_ref: String,     // "harness-system codebase" 或 "cycle-5/PR#42"
    agentRunId: String?,
    cycleId: Number?,
    cycle_tag: String?,     // "M2-C5"
  },

  // Feedback loop
  qualityScore: Number,     // -10 ~ 100
  lastReferencedAt: Date,

  // 关系
  relations: [{
    target: String,         // Spec ID 或 Room ID
    type: 'depends_on' | 'conflicts_with' | 'supersedes' | 'relates_to',
  }],

  // 代码锚定
  anchors: [{
    file: String,           // "apps/server/src/services/launcher/spawner.ts"
    symbol: String?,        // "tester-follow-up"
    line_range: String?,    // "526-625"
  }],

  tags: String[],
  created_at: Date,
  updated_at: Date,
}

Index: { roomId: 1, type: 1, state: 1 }
Index: { qualityScore: -1 }
Index: { tags: 1 }
```

## K4. Context Builder — Room-Aware Selection

```
  ┌─────────────────────────────────────────────────────────────┐
  │         CONTEXT BUILDER — Room-Aware Selection               │
  └─────────────────────────────────────────────────────────────┘

  Step 1: 确定相关 Rooms
  ┌───────────────────────────────────────────────────┐
  │ Task has prdRefs? → map to Rooms                  │
  │ Task title/desc keywords? → match Room names/tags │
  │ Always include: 00-project-room (global specs)    │
  └──────────────────────┬────────────────────────────┘
                         ▼
  Step 2: 收集 Specs (with 继承)
  ┌───────────────────────────────────────────────────┐
  │ For each relevant Room:                           │
  │   Collect active specs from Room                  │
  │   Walk up to parent → collect constraints/convs   │
  │   (inheritance: child gets parent constraints)    │
  └──────────────────────┬────────────────────────────┘
                         ▼
  Step 3: 排序注入
  ┌───────────────────────────────────────────────────┐
  │ Priority order:                                   │
  │   1. constraints (必须遵守)                        │
  │   2. decisions (已做选择，避免重复决策)              │
  │   3. conventions (团队约定)                        │
  │   4. context (背景参考)                            │
  │   5. intent (功能目标)                             │
  │ Within each type: qualityScore DESC               │
  │ Token budget: ~8000 tokens for specs              │
  └───────────────────────────────────────────────────┘

  Example:
  ┌────────────────────────────────────────────────────┐
  │ Task: "fix tester quick-fail"                      │
  │                                                    │
  │ → match Room: 02-03-tester                         │
  │                                                    │
  │ Injected specs:                                    │
  │ ┌─ constraints ────────────────────────────────┐   │
  │ │ [MUST] Quick-fail: L1 fail → skip L2/L3/L4  │   │
  │ │ [MUST] GUT timeout: 3 min                    │   │
  │ │ [MUST] Container memory: 4GB                 │   │
  │ ├─ decisions ──────────────────────────────────┤   │
  │ │ L4 与 L2 并行执行 (M2-C7)                    │   │
  │ ├─ conventions ────────────────────────────────┤   │
  │ │ GDScript 静态类型 (:= 和 -> void)            │   │
  │ │ Agent 输出格式: stream-json NDJSON           │   │
  │ ├─ context ────────────────────────────────────┤   │
  │ │ Godot bug: headless import 偶尔 hang         │   │
  │ └──────────────────────────────────────────────┘   │
  └────────────────────────────────────────────────────┘

  容量规划:
  ┌──────────────────────────────────────────────────────────────┐
  │ 当前规模: ~46 rooms × 平均 5 specs = ~230 specs             │
  │ Token budget: ~8000 tokens for specs injection               │
  │                                                              │
  │ 增长预估:                                                     │
  │  200 rooms × 10 specs = 2000 specs                          │
  │  查询: roomId + type + state 复合索引，O(1) 查找             │
  │  继承链: 最深 3 层 (project → epic → feature)，每层 1 query  │
  │  总 DB 查询: ~4-6 次 per agent spawn，≤50ms                  │
  │                                                              │
  │ 截断策略:                                                     │
  │  收集的 specs 总 token 超过 budget 时:                       │
  │  1. constraints 全部保留 (必须遵守)                           │
  │  2. decisions 按 qualityScore DESC 截断                      │
  │  3. conventions/context/intent 按 score 填满剩余空间          │
  │  无缓存 — 每次 spawn 重新查询 DB (数据可能 cycle 间变化)     │
  │                                                              │
  │ 瓶颈:                                                        │
  │  不是 DB 查询 (足够快)，而是 agent 上下文窗口。              │
  │  8000 token budget 约 30-40 条 spec，超出需更激进的截断。    │
  └──────────────────────────────────────────────────────────────┘
```

## K5. Curator — Spec 写入流程

```
  ┌─────────────────────────────────────────────────────────────┐
  │            CURATOR — Spec Sediment Extraction                 │
  └─────────────────────────────────────────────────────────────┘

  Cycle 完成
       │
       ▼
  ┌──────────────────┐
  │  Curator Agent   │  读取 cycle 的所有 PR diffs
  │  (retrospect)    │
  └────────┬─────────┘
           │
           ▼
  Phase 1: 提取 knowledge sediment
  ┌──────────────────────────────────────────────┐
  │ For each meaningful change:                  │
  │                                              │
  │   Identify target Room (from file path       │
  │   or _tree.yaml ownership mapping)           │
  │       │                                      │
  │       ├─► decision spec                      │
  │       │   "选了 A 因为 X，没选 B 因为 Y"       │
  │       │                                      │
  │       ├─► constraint spec                    │
  │       │   "FPS 不能低于 30 in farm scene"     │
  │       │                                      │
  │       └─► context spec                       │
  │           "这个 workaround 是因为 Godot bug"  │
  │                                              │
  │   POST /api/specs { roomId, type, ... }      │
  └──────────────────────────────────────────────┘
           │
           ▼
  Phase 2: Confidence routing
  ┌──────────────────────────────────────────────┐
  │ confidence ≥ 0.75 → state: active (自动生效) │
  │ confidence ≥ 0.50 → state: draft (需确认)    │
  │ confidence < 0.50 → 丢弃                     │
  └──────────────────────────────────────────────┘
           │
           ▼
  Phase 3: 更新 Room metadata
  ┌──────────────────────────────────────────────┐
  │ PATCH /api/rooms/:id                         │
  │   last_cycle = current cycleId               │
  │   lifecycle upgrade if enough active specs   │
  └──────────────────────────────────────────────┘
```

## K6. API Routes

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    API ENDPOINTS                              │
  └─────────────────────────────────────────────────────────────┘

  Rooms:
  GET    /api/rooms              List rooms (filter: parent, lifecycle, type)
  GET    /api/rooms/:id          Get room + child rooms + spec counts
  GET    /api/rooms/tree         Full tree
  POST   /api/rooms              Create room
  PATCH  /api/rooms/:id          Update room metadata
  DELETE /api/rooms/:id          Archive room (检查 child specs)

  Specs:
  GET    /api/specs              List specs (filter: roomId, type, state, tags)
  GET    /api/specs/:id          Get single spec
  POST   /api/specs              Create spec (Curator 调用)
  PATCH  /api/specs/:id          Update spec (state transitions, content edits)
  DELETE /api/specs/:id          Archive spec
```

## K7. Seeding（启动时同步）

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    SEED ON STARTUP                           │
  └─────────────────────────────────────────────────────────────┘

  Server startup
       │
       └─► seedRooms()
           │
           ├── 读取 rooms/00-project-room/_tree.yaml
           │   解析完整 Room 树
           │
           ├── For each Room in tree:
           │   ├── Upsert Room document to MongoDB
           │   └── 读取 rooms/{path}/specs/*.yaml
           │       └── Upsert Spec documents to MongoDB
           │
           ├── 两个 repo 都走同样流程:
           │   harness-system/rooms/ (26 rooms)
           │   zombie-farm-godot/rooms/ (~20 rooms)
           │
           └── 返回 { roomsUpserted, specsUpserted, unchanged }
```

## K8. Dashboard — Room Tree View

```
  ┌──────────────────────────────────────────────┐
  │ Room Tree                │  Spec Detail       │
  │                          │                    │
  │ ▼ 00 项目总控            │  Room: 02-03-tester│
  │   ▼ 02 Agent 系统        │  Lifecycle: active │
  │     01 Orchestrator      │  Specs: 5          │
  │     02 Coder             │                    │
  │     ► 03 Tester ←        │  ┌──────────────┐  │
  │     04 Reviewer          │  │ [intent]  2  │  │
  │     05 Integrator        │  │ [decision]1  │  │
  │     06 Curator           │  │ [constraint]2│  │
  │     07 Container         │  └──────────────┘  │
  │     08 Spawner           │                    │
  │     09 Stream            │  constraint-001:   │
  │   03 任务队列             │  "Quick-fail:     │
  │   ▼ 04 知识系统           │   L1 fail →       │
  │     01 上下文构建器       │   skip L2/L3/L4"  │
  │     02 策展              │  score: 78         │
  │   05 测试管线             │  M2-C5 | 0.85     │
  │   ...                    │                    │
  └──────────────────────────────────────────────┘
```

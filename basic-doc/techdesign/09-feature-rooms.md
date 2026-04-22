# 09 — Feature Room 详细设计

Feature Room 是 harness 知识系统的核心载体。03-knowledge.md 给出了 Room+Spec 结构总览；本文档补全所有运行时细节：知识怎么产生、怎么流动、怎么消亡、怎么跨项目。

## R1. Room 是什么

Room 是一个**功能域的知识容器**。它不是代码目录，不是文件夹——它是"关于某个模块/功能，我们团队到目前为止知道的所有事"的集合。

```
Room = {
  身份:   id, name, parent, type (epic/feature)
  状态:   lifecycle (planning → active → stable → archived)
  内容:   N 条 Spec (typed knowledge entries)
  关系:   depends_on[], parent → child 继承链
}
```

Room 来自两个地方：
- **harness-system/rooms/** — 描述 harness 自身的架构（cycle engine, agent system, dashboard...）
- **game-repo/.harness/rooms/** — 描述目标项目的功能域（farming, combat, mutation...）

两者在 server 启动时由 `seedRooms()` 合并到同一个 Mongo Room collection 里。

## R2. Spec 的 7 种类型

每条 Spec 是一个"知识原子"——不可再拆分的单条知识。

```
┌─────────────┬─────────────────────────────────────────────────────────┐
│ Type        │ 回答的问题                           │ 例子               │
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ intent      │ 这个 Room 要做什么？                  │ "Tester 执行多层    │
│             │                                      │  测试并报告结果"    │
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ decision    │ 为什么选 A 不选 B？                   │ "用 signal bus      │
│             │                                      │  而不是直接引用"    │
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ constraint  │ 不能做什么？边界在哪？                │ "FPS 不能低于 30"   │
│             │                                      │ "最多 8 个地块"     │
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ contract    │ 组件之间的接口长什么样？              │ "GET /api/inbox     │
│             │                                      │  returns InboxItem[]"│
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ convention  │ 我们怎么做事？                        │ "snake_case 命名"   │
│             │                                      │ "signal 用过去时"   │
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ change      │ 这次改了什么？                        │ "Phase 1-3 dashboard│
│             │                                      │  redesign record"   │
├─────────────┼──────────────────────────────────────┼────────────────────┤
│ context     │ 需要知道的背景？                      │ "headless import    │
│             │                                      │  偶尔 hang 120s"    │
└─────────────┴──────────────────────────────────────┴────────────────────┘
```

## R3. 知识的完整生命周期

```
         ┌──────────────────── WRITE ────────────────────────┐
         │                                                    │
         │  来源 1: Curator agent (cycle retrospect 阶段)       │
         │    读 PR diffs → 提取 sediment → SpecModel.create  │
         │    confidence ≥ 0.75 → state: active (自动生效)     │
         │    confidence 0.50-0.74 → state: draft (Inbox 确认) │
         │    confidence < 0.50 → 丢弃                        │
         │                                                    │
         │  来源 2: contextFeedback.missing (每次 agent run)    │
         │    Agent 报告 "缺少关于 X 的信息"                    │
         │    → processContextFeedback() 自动创建 draft spec   │
         │    → confidence: 0.30, type: context                │
         │    → 先查重（title 相似度匹配），不重复则创建         │
         │    → 出现在 Inbox (draft_spec)，等人或 Curator 填充  │
         │    → 不会被注入到 agent prompt (draft 不注入)         │
         │                                                    │
         │  来源 3: 人工 (dashboard Rooms 页面)                  │
         │    手动创建 spec → state: active                     │
         │                                                    │
         │  来源 4: seedRooms() (server 启动时)                  │
         │    从 yaml 文件 upsert → 保留 DB 中的 runtime 字段  │
         │    (qualityScore, lastReferencedAt 等不被覆盖)       │
         │                                                    │
         └────────────────────────────────────────────────────┘

         ┌──────────────────── READ ─────────────────────────┐
         │                                                    │
         │  消费者: Context Builder (每次 agent spawn)           │
         │                                                    │
         │  Step 1: 定位 Rooms                                 │
         │    Task 关键词 → 匹配 Room name/tags                │
         │    始终包含 00-project-room (全局 constraints)       │
         │                                                    │
         │  Step 2: 收集 Specs + 继承                          │
         │    当前 Room 的 active specs                         │
         │    + 父 Room 的 constraints + conventions (向上走)  │
         │    例: 02-03-tester specs                           │
         │        + 02-agent-system constraints                │
         │        + 00-project-room conventions                │
         │                                                    │
         │  Step 3: 排序 + 截断                                │
         │    Priority: constraint > decision > convention     │
         │              > context > intent                     │
         │    同 type 内: qualityScore DESC                     │
         │    Token budget: ~8000 tokens                       │
         │    constraints 全保留，其他按 score 填满             │
         │                                                    │
         │  Step 4: 注入到 task prompt                          │
         │    格式化为 markdown 段落，插入 agent 的 task prompt │
         │    只注入 state: active 的 spec (draft 不注入)       │
         │                                                    │
         └────────────────────────────────────────────────────┘

         ┌──────────────────── EVOLVE ───────────────────────┐
         │                                                    │
         │  质量反馈 (每次 agent run 完成后):                    │
         │                                                    │
         │  Agent 输出 contextFeedback:                        │
         │  {                                                  │
         │    useful_specs: ["spec-id-1", ...],                │
         │    unnecessary_specs: ["spec-id-2", ...],           │
         │    missing: ["需要关于 X 的信息"]                    │
         │  }                                                  │
         │                                                    │
         │  processContextFeedback() 处理:                     │
         │    useful     → qualityScore += 1.0                 │
         │    unnecessary → qualityScore -= 1.5                │
         │    每次更新:  score = score * 0.95 + delta (衰减)   │
         │    clamp:     [-10, 100]                            │
         │                                                    │
         │  自动状态转换:                                       │
         │    score ≤ -10 → state: archived (自动归档)          │
         │    久未引用 (5+ cycles) → 标记 stale                │
         │    anchor 文件被删 → 标记 orphaned anchor            │
         │    missing 与已有 spec 重叠 → 标记 stale-content    │
         │                                                    │
         │  Per-cycle 全局衰减 (handleAdvanceCycle):            │
         │    所有 active specs: qualityScore *= 0.95           │
         │    score 降到 -10 → 自动 archived                   │
         │    → 不用的知识自然沉底消亡                          │
         │                                                    │
         └────────────────────────────────────────────────────┘
```

## R4. 双源 seedRooms() 详细流程

```
Server 启动
    │
    ├── 1. 扫描 harness-system/rooms/
    │       读 rooms/00-project-room/_tree.yaml
    │       递归处理每个节点:
    │         upsert Room → Mongo
    │         读 rooms/{path}/specs/*.yaml → upsert Spec → Mongo
    │       结果: harness 内部 rooms 同步完成
    │
    └── 2. 扫描 $PROJECT_REPO_LOCAL_PATH/.harness/rooms/
            │
            ├── 有 _tree.yaml?
            │     是 → 解析树，和 step 1 完全相同的处理逻辑
            │     → 项目 rooms 合并进同一个 Mongo collection
            │
            └── 无 _tree.yaml?
                  → flat scan: 每个含 room.yaml 的子目录
                  → 生成 synthetic 顶级 Room (id 加 p- 前缀)
                  → 处理其 specs/ 子目录

注意:
  - 两次扫描写同一个 Mongo collection，用 upsert (不删除)
  - yaml 里的静态字段 (name, type, lifecycle) 每次覆盖
  - runtime 字段 (qualityScore, lastReferencedAt) 用 $setOnInsert 保护
  - 项目 Room ID 建议用 p- 前缀避免和 harness rooms 冲突
  - 如果 PROJECT_REPO_LOCAL_PATH 未设置，step 2 跳过
```

## R5. Yaml 文件结构 (磁盘)

```
rooms/07-dashboard/                   ← harness room 示例
├── room.yaml                         ← Room 元数据
│     room:
│       id: "07-dashboard"
│       name: "控制面板"
│       parent: "00-project-room"
│       lifecycle: active
│       owner: frontend
│
├── progress.yaml                     ← 开发进度 (commit 历史、milestones)
│     lifecycle: active
│     completion: 70
│     milestones:
│       - id: dashboard-redesign-phase-1
│         status: completed
│     commits:
│       - hash: "b30c751"
│         date: "2026-04-14"
│
├── spec.md                           ← Human Projection (可读概览)
│
├── specs/                            ← Spec yaml 文件
│   ├── intent-07-dashboard.yaml      ← 这个 Room 要做什么
│   ├── decision-bento-popup.yaml     ← 为什么用 Bento + popup
│   ├── contract-api-inbox.yaml       ← /api/inbox 接口契约
│   └── change-2026-04-15-*.yaml      ← 变更记录
│
└── 01-live-stream/                   ← 子 Room
    ├── room.yaml
    ├── specs/
    │   └── intent-07-01-live-stream.yaml
    └── progress.yaml
```

## R6. Spec Yaml 格式

```yaml
spec_id: "decision-07-dashboard-bento-popup-001"
type: decision                         # 7 种之一
state: active                          # draft | active | archived

# 内容
decision:                              # 或 intent: / constraint: / contract: / ...
  summary: "Home is a 12-column Bento grid with popup-preview"
  detail: |
    Design decision for Home page layout:
    - 12-column CSS Grid, auto-rows-[120px]
    - Each bento tile with [Open ↗] (popup) and [⛶] (maximize)
    ...

# 约束 (可选)
constraints:
  - "At most 1 popup open at a time"

# 索引
indexing:
  type: decision
  priority: high
  layer: epic                          # epic | feature | detail
  domain: "dashboard"
  tags: [bento, popup, dialog, home]

# 溯源
provenance:
  source_type: codebase_extraction     # human | prd_extraction | agent_sediment | ...
  confidence: 0.95                     # 0.0 - 1.0
  source_ref: "c0f4043 Phase 2"
  cycle_tag: "dashboard-redesign"      # 可选，用于按 cycle 聚合

# 关系 (可选)
relations:
  - target: "intent-07-dashboard-001"
    type: "depends_on"                 # depends_on | conflicts_with | supersedes | relates_to

# 代码锚定 (可选)
anchors:
  - file: "apps/dashboard/src/app/page.tsx"
    symbol: "BentoTile"
  - file: "apps/dashboard/src/components/popup-preview.tsx"
```

## R7. Quality Score 机制详解

Quality Score 是让知识**自然淘汰**的核心机制。不需要人手动清理——没用的知识会自己沉底消亡。

```
初始值: 0

每次 agent run 完成:
  useful_specs 中提到 → +1.0
  unnecessary_specs 中提到 → -1.5
  衰减: score = score * 0.95 + delta

每个 cycle 完成 (handleAdvanceCycle):
  所有 active specs: score *= 0.95 (全局衰减)

边界:
  score ≤ -10 → 自动 archived (永远不再注入)
  score = 100 → 上限 (持续有用的知识稳定在高分)

Context Builder 使用:
  同 type 内按 score DESC 排序
  高分的先占 token budget，低分的被截断

效果:
  频繁被 agent 标为 useful → 分数上升 → 更容易被注入 → 正反馈
  从不被引用 → 0.95 衰减每 cycle 扣 5% → 约 60 cycles 后自动归档
  被标为 unnecessary → 快速下降 → 10 次就可能触发归档
```

## R8. Draft Spec 的两种来源

Draft spec 出现在 Inbox，但它们的来源和语义不同：

```
┌──────────────────┬─────────────────────────────┬────────────────────────┐
│ 来源             │ Curator sediment            │ contextFeedback.missing│
├──────────────────┼─────────────────────────────┼────────────────────────┤
│ 创建时机         │ Cycle retrospect 阶段       │ 每次 agent run 完成    │
│ Confidence       │ 0.50-0.74                   │ 0.30 (固定)            │
│ 内容质量         │ 高 (Curator 读了 diff)       │ 低 (只有一句话描述)     │
│ Spec type        │ decision/constraint/context  │ 永远是 context         │
│ 期望操作         │ 人确认 → Activate           │ 人或 Curator 补内容     │
│ Inbox type       │ draft_spec                  │ draft_spec             │
│ 会被注入吗       │ 否 (draft 不注入)            │ 否                     │
│ 下一步           │ Activate → 下次注入         │ 填 detail → Activate   │
└──────────────────┴─────────────────────────────┴────────────────────────┘
```

## R9. 项目 Feature Room vs Ludus Room

```
┌────────────────────────┬──────────────────────────────────────────┐
│ Ludus Rooms          │ Project Feature Rooms                    │
│ (harness-system/rooms/)│ (game-repo/.harness/rooms/)              │
├────────────────────────┼──────────────────────────────────────────┤
│ 描述 harness 架构本身  │ 描述目标游戏的功能域                      │
│                        │                                          │
│ 01-cycle-engine        │ p-farming (种植系统)                     │
│ 02-agent-system        │ p-combat (战斗系统)                      │
│ 03-job-queue           │ p-mutation (突变系统)                    │
│ 04-knowledge-system    │ p-economy (经济系统)                     │
│ 07-dashboard           │ ...                                     │
│ ...                    │                                          │
│                        │                                          │
│ 数字 ID (01-xx)        │ p- 前缀 ID (p-domain)                   │
│ 随 harness 版本化      │ 随游戏代码版本化                          │
│ 人工维护               │ Curator agent 自动写入 + 人工调整         │
│ 稳定 (harness 架构不常变)│ 活跃 (每个 cycle 可能有新 spec)         │
└────────────────────────┴──────────────────────────────────────────┘
```

## R10. 当前 Ludus Room 结构 (截至 2026-04-19)

```
00-project-room                 [project] 全局 conventions + .harness/ contract
├── 01-cycle-engine             [epic]    Cycle 状态机 + Task 生命周期
├── 02-agent-system             [epic]    6 agent 容器化执行
│   ├── 01-orchestrator         [feature] 任务规划
│   ├── 02-coder                [feature] 代码实现
│   ├── 03-tester               [feature] 多层测试
│   ├── 04-reviewer             [feature] PR 审查
│   ├── 05-integrator           [feature] 分支合并
│   ├── 06-curator              [feature] 知识提取
│   ├── 07-container            [feature] Docker 生命周期
│   ├── 08-spawner              [feature] Agent 调度
│   └── 09-stream-capture       [feature] NDJSON 流捕获
├── 03-job-queue                [epic]    双池 polling 任务队列
├── 04-knowledge-system         [epic]    Room+Spec 知识系统
│   ├── 01-context-builder      [feature] Spec 选择 + prompt 注入
│   └── 02-curation             [feature] 知识策展 + 质量反馈
├── 05-testing-pipeline         [epic]    动态测试层管线
├── 06-plan-validation          [feature] 任务计划校验
├── 07-dashboard                [epic]    观测面板
│   ├── 01-live-stream          [feature] SSE 实时流 + Team Pipeline
│   ├── 02-review-panel         [feature] Inbox 统一审批
│   ├── 03-analytics            [feature] Home Bento 分析
│   ├── 04-milestones           [feature] Milestone 管理 UI
│   └── 05-project-setup        [feature] 项目初始化 + /setup 页面
├── 08-infrastructure           [epic]    Docker + CI + 健康检查
├── 09-spending                 [feature] 成本追踪 + 预算熔断
└── 11-data-layer               [epic]    13 个 Mongo collections

共 26 rooms, 全部 lifecycle: active
共 32+ intent specs, 全部 state: active
```

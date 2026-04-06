# Dashboard — 前端设计

页面结构 (D1)、人工干预 (D2)、数据流 (D3)、Rooms 页面 (D4)、Control 页面 (D5)、Plan 交互 (D6)、通知 (D7)。

## D1. 页面结构

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    DASHBOARD (Next.js :3000)                  │
  └─────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │ 页面              │ 功能                                     │
  ├───────────────────┼──────────────────────────────────────────┤
  │ Home              │ 系统状态总览 (active cycle, spending,    │
  │                   │ agent 数, queue depth)                   │
  │                   │                                          │
  │ Cycles            │ Cycle 列表 + 详情                        │
  │                   │ 创建新 cycle (指定 milestone + goal)     │
  │                   │                                          │
  │ Tasks             │ Task 列表 + 详情 (含 agent runs 历史)   │
  │                   │                                          │
  │ Agents            │ Agent run 列表 + 实时 stream 查看        │
  │                   │ SSE 订阅单个 agent 的 NDJSON 输出        │
  │                   │                                          │
  │ Tests             │ TestResult 列表 (L1-L4)                  │
  │                   │ Screenshot AI analysis 查看              │
  │                   │                                          │
  │ Milestones        │ M0-M15 进度追踪                          │
  │                   │                                          │
  │ Jobs              │ Job queue 状态 + 审批操作                │
  │                   │                                          │
  │ Rooms             │ Room 树形浏览 + Spec 详情                │
  │                   │                                          │
  │ Review            │ Human review panel (PR 审批)             │
  │                   │                                          │
  │ Analytics         │ Spending / Task 成功率 / Review 质量     │
  │                   │                                          │
  │ Control           │ 系统模式 + 预算 + 审批策略               │
  └───────────────────┴──────────────────────────────────────────┘
```

## D2. 人工干预操作

```
  ┌─────────────────────────────────────────────────────────────┐
  │              HUMAN INTERVENTION — 场景 × 页面 × 操作         │
  └─────────────────────────────────────────────────────────────┘

  所有需要人工介入的场景及对应的 Dashboard 操作:

  ┌──────────────────────────────────────────────────────────────┐
  │ 场景                      │ 页面     │ 操作                  │
  ├───────────────────────────┼──────────┼───────────────────────┤
  │ Job 审批                  │ Jobs     │ Approve / Reject      │
  │ (requiresApproval=true)   │          │ 可附 reason           │
  │                           │          │                       │
  │ Plan review reject ×2     │ Jobs     │ 升级为审批 job        │
  │ (Orchestrator 用完重试)   │          │ Approve / Reject      │
  │                           │          │                       │
  │ PR Human Gate             │ Review   │ 查看 PR diff          │
  │ (涉及 protected paths)   │          │ Approve / Reject      │
  │                           │          │                       │
  │ 失败后 next-cycle         │ Jobs     │ Approve 继续          │
  │ (所有 tasks failed)       │          │ Reject 停止           │
  │                           │          │                       │
  │ Draft spec 确认           │ Rooms    │ 查看 spec 内容        │
  │ (Curator conf 0.50-0.74) │          │ Activate / Archive    │
  │                           │          │                       │
  │ 系统暂停/恢复             │ Control  │ Pause / Resume / Kill │
  │ (rate limit / spending)   │          │ 调整 spendingCapUsd   │
  │                           │          │                       │
  │ Spec 管理                 │ Rooms    │ 查看/编辑/归档 spec   │
  │ (override Curator 决策)   │          │ 创建人工 spec         │
  └───────────────────────────┴──────────┴───────────────────────┘
```

## D3. 数据流

```
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Dashboard                     Server (:3001)                │
  │  ┌──────────────┐         ┌──────────────────┐              │
  │  │  Next.js     │  REST   │  Express API     │              │
  │  │  App Router  │◄───────►│                  │              │
  │  │              │  fetch   │  /api/cycles     │              │
  │  │  useSSE()    │         │  /api/tasks      │              │
  │  │  hook        │◄────────│  /api/agents     │              │
  │  │              │  SSE    │  /api/jobs       │              │
  │  └──────────────┘         │  /api/rooms      │              │
  │                           │  /api/specs      │              │
  │  读: REST GET 轮询        │  /api/control    │              │
  │  写: REST POST/PATCH      │  /api/events(SSE)│              │
  │  实时: SSE 订阅           └──────────────────┘              │
  │                                                              │
  │  SSE 事件驱动 UI 更新:                                       │
  │  • agent:started       → Agents 页面刷新                    │
  │  • agent:completed     → Tasks 状态更新                     │
  │  • cycle:completed     → Cycles 页面刷新                    │
  │  • task:status_changed → Tasks 列表更新                     │
  │  • job:requires_approval → Jobs 页面弹通知                  │
  │  • system:spending_warning → Control 页面告警               │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

## D4. Rooms 页面

```
  ┌──────────────────────────────────────────────────────────────┐
  │ ┌─ Room Tree ──────────┐  ┌─ Spec Panel ─────────────────┐ │
  │ │                       │  │                               │ │
  │ │ ▼ 00 项目总控         │  │  Room: 02-03-tester           │ │
  │ │   ▼ 02 Agent 系统     │  │  Lifecycle: active            │ │
  │ │     01 Orchestrator   │  │  Specs: 5 (2 draft)           │ │
  │ │     02 Coder          │  │                               │ │
  │ │     ► 03 Tester ←     │  │  ┌─ Filter ──────────────┐   │ │
  │ │     04 Reviewer       │  │  │ [All] [constraint]     │   │ │
  │ │     05 Integrator     │  │  │ [decision] [convention]│   │ │
  │ │     06 Curator        │  │  │ [draft only]           │   │ │
  │ │   03 任务队列          │  │  └────────────────────────┘   │ │
  │ │   04 知识系统          │  │                               │ │
  │ │                       │  │  constraint-001 (active)      │ │
  │ │ ▼ 03 Farm             │  │   "Quick-fail: L1 fail →     │ │
  │ │   01 Planting         │  │    skip L2/L3/L4"             │ │
  │ │   02 Grid             │  │   score: 78 | M2-C5 | 0.85   │ │
  │ │ ▼ 04 Zombie           │  │   [Edit] [Archive]           │ │
  │ │   01 Growth           │  │                               │ │
  │ │   03 Mutation         │  │  decision-002 ⚠ draft         │ │
  │ │                       │  │   "L4 与 L2 并行执行"          │ │
  │ │                       │  │   score: 0 | M8-C1 | 0.62    │ │
  │ │                       │  │   [Activate] [Archive]        │ │
  │ │                       │  │                               │ │
  │ │                       │  │  [+ New Spec]                 │ │
  │ └───────────────────────┘  └───────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────┘

  Draft spec 操作:
  ┌──────────────────────────────────────────────────────────────┐
  │ Curator 写入 confidence 0.50-0.74 的 spec → state: draft    │
  │                                                              │
  │ Dashboard Rooms 页面:                                        │
  │  • draft specs 带 ⚠ 标记，排在列表顶部                      │
  │  • 点击查看完整内容 + provenance (哪个 cycle, confidence)    │
  │  • [Activate] → PATCH /api/specs/:id { state: "active" }   │
  │  • [Archive]  → PATCH /api/specs/:id { state: "archived" } │
  │  • [Edit]     → 修改 title/detail 后 Activate              │
  └──────────────────────────────────────────────────────────────┘
```

## D5. Control 页面

```
  ┌──────────────────────────────────────────────────────────────┐
  │  System Control                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ Mode: [Running ▼]     ← dropdown: running/paused/killed│  │
  │  │                                                        │  │
  │  │ Spending: $142.50 / $500.00  ████████░░░░░░  28.5%     │  │
  │  │ Cap: [$500.00  ] [Update]                              │  │
  │  │                                                        │  │
  │  │ Auto-approval: [✓ spawn] [✓ test] [✓ review] [□ plan] │  │
  │  │                                                        │  │
  │  │ Message to agents: [________________________] [Send]   │  │
  │  └────────────────────────────────────────────────────────┘  │
  │                                                              │
  │  Recent Events:                                              │
  │  ┌────────────────────────────────────────────────────────┐  │
  │  │ 14:23  system:spending_warning  28.5% of cap           │  │
  │  │ 14:20  agent:completed  curator-M8C1  $1.20            │  │
  │  │ 14:15  cycle:completed  M8-C1  5/5 tasks merged        │  │
  │  └────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────┘
```

## D6. Plan 交互 — Orchestrator ↔ Human 协商

```
  ┌─────────────────────────────────────────────────────────────┐
  │              PLAN NEGOTIATION — 两个不同的人工介入点          │
  └─────────────────────────────────────────────────────────────┘

  PLAN 阶段有两个人工介入点，发生在不同时机：

  ┌──────────────────────────────────────────────────────────┐
  │ 1. Questions 协商 (plan 生成前，不算 retry)              │
  │    Orchestrator 不确定 → 问你 → 你回答 → 生成 plan      │
  │                                                          │
  │ 2. Human Plan Review (plan 审查后，reject 算 retry)      │
  │    validator + reviewer 都过了 → 你最终确认               │
  └──────────────────────────────────────────────────────────┘

  ══ 介入点 1: Questions 协商 ════════════════════════════════

  Orchestrator 在规划时可能需要人工澄清:
  • milestone goal 不够具体 → 需确认 scope
  • 多种拆分方式 → 需人工选择偏好
  • 技术方案有 trade-off → 需人工决策

  Dashboard Q&A 页面:

  ┌──────────────────────────────────────────────────────────┐
  │ Cycle M8-C1 — Orchestrator 有问题                       │
  │                                                          │
  │ ┌─ Questions ─────────────────────────────────────────┐  │
  │ │                                                      │  │
  │ │ Q1: 突变系统要支持多层突变吗？还是只做单层？         │  │
  │ │   ○ 单层突变 (scope 小, 1 cycle)  ← recommended     │  │
  │ │   ● 多层突变 (scope 大, 2 cycles)                    │  │
  │ │                                                      │  │
  │ │ Q2: 突变 UI 是本 cycle 做还是下个 cycle？            │  │
  │ │   ○ 本 cycle 一起做                                  │  │
  │ │   ● 下个 cycle 单独做  ← recommended                 │  │
  │ │                                                      │  │
  │ └──────────────────────────────────────────────────────┘  │
  │                                                          │
  │ ┌─ 额外反馈 (可选) ──────────────────────────────────┐  │
  │ │ [突变概率公式参考 PRD 03b，不要自己编____________]   │  │
  │ └──────────────────────────────────────────────────────┘  │
  │                                                          │
  │ [Submit Answers]                                         │
  └──────────────────────────────────────────────────────────┘

  → POST /api/jobs/:id/answer { answers, feedback }
  → Orchestrator 带你的 answers 重新生成 plan
  → 正常流程，不算 retry

  无 questions 时跳过这一步，直接进 validator。

  ══ 介入点 2: Human Plan Review ═════════════════════════════

  validator + reviewer 都通过后，人工最终确认:

  ┌──────────────────────────────────────────────────────────┐
  │ Cycle M8-C1 — Plan Review                               │
  │                                                          │
  │ ┌─ Plan (3 tasks) ───────────────────────────────────┐  │
  │ │ Task 1: 突变数据模型和公式                          │  │
  │ │ Task 2: 突变触发逻辑                                │  │
  │ │ Task 3: 突变单元测试                                │  │
  │ └─────────────────────────────────────────────────────┘  │
  │                                                          │
  │ ┌─ 反馈 (可选) ──────────────────────────────────────┐  │
  │ │ [________________________________]                   │  │
  │ └──────────────────────────────────────────────────────┘  │
  │                                                          │
  │ [Approve Plan]  [Request Changes]                        │
  └──────────────────────────────────────────────────────────┘

  [Approve]         → apply-plan → IMPLEMENT
  [Request Changes] → replan (消耗 1 次 retry, 附你的反馈)
                      再次 reject → 人工干预 (不再自动 replan)

  ══ 数据模型 ════════════════════════════════════════════════

  Plan JSON:
  ┌──────────────────────────────────────────────────────────┐
  │ {                                                        │
  │   tasks: [...],                                          │
  │   questions: [                    // 可选，可为空         │
  │     {                                                    │
  │       id: string,                 // "q1"                │
  │       question: string,           // 问题描述            │
  │       options: [                  // 选项列表            │
  │         { id: string, label: string }                    │
  │       ],                                                 │
  │       default: string             // 推荐选项 id         │
  │     }                                                    │
  │   ]                                                      │
  │ }                                                        │
  │                                                          │
  │ Human Answers (POST /api/jobs/:id/answer):               │
  │ {                                                        │
  │   answers: { "q1": "b", "q2": "a" },                    │
  │   feedback: "突变概率参考 PRD 03b"                       │
  │ }                                                        │
  │ → 注入 Orchestrator task prompt → 重新生成 plan          │
  └──────────────────────────────────────────────────────────┘
```

## D7. 通知机制 (Future Feature)

```
  ┌─────────────────────────────────────────────────────────────┐
  │              NOTIFICATION DESIGN                              │
  │              后续实现 — 当前 pending job 无主动通知            │
  └─────────────────────────────────────────────────────────────┘

  ══ 系统关机/crash 时的行为 ══════════════════════════════════

  ┌──────────────────────────────────────────────────────────┐
  │ Docker Desktop 停止:                                     │
  │  • 所有容器 killed                                       │
  │  • MongoDB 数据在 volume 中持久化                        │
  │  • pending approval jobs → 不受影响，留在 DB             │
  │                                                          │
  │ 重新 docker compose up:                                  │
  │  • orphan recovery 清理中断的 jobs/containers            │
  │  • 正在跑的 agent → lost → orphan recovery 创建 retry   │
  │  • pending approval jobs → 还在，Dashboard 上能看到      │
  │  • 系统从断点恢复，不丢数据                              │
  │                                                          │
  │ 唯一损失: 正在执行的 agent run 的 cost (已花但无输出)    │
  └──────────────────────────────────────────────────────────┘

  ══ Discord Webhook 通知 ════════════════════════════════════

  ┌──────────────────────────────────────────────────────────┐
  │ 触发时机:                                                │
  │  • job:requires_approval → "⏳ Job 需要审批: {type}"    │
  │  • system:spending_warning → "💰 Spending 达到 80%"     │
  │  • rate limit detected → "⚠️ Rate limited, 系统暂停"   │
  │  • cycle:completed → "✅ Cycle M8-C1 完成"              │
  │  • cycle failed → "❌ Cycle M8-C1 失败"                 │
  │  • plan questions → "❓ Orchestrator 有问题要你确认"     │
  │                                                          │
  │ 配置:                                                    │
  │  DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...│
  │  .env 中配置，空则不发                                   │
  │                                                          │
  │ 实现: Server 端 SSE 事件 listener                        │
  │  监听关键事件 → POST webhook → Discord channel           │
  └──────────────────────────────────────────────────────────┘

  ══ Approval Timeout (可选) ═════════════════════════════════

  ┌──────────────────────────────────────────────────────────┐
  │ 低风险 job (非 protected paths):                         │
  │  pending > 30 min → auto-approve                         │
  │  通知: "⏰ Job auto-approved after 30min timeout"        │
  │                                                          │
  │ 高风险 job (protected paths / plan review):              │
  │  pending > 30 min → 只发通知提醒，不 auto-approve        │
  │  通知: "⏰ Job 等待审批已 30min: {type}"                 │
  │                                                          │
  │ 配置:                                                    │
  │  APPROVAL_TIMEOUT_MS=1800000  (30min, 0=禁用)           │
  │  AUTO_APPROVE_LOW_RISK=true/false                        │
  └──────────────────────────────────────────────────────────┘
```

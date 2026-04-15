# Dashboard — 前端设计

Home Bento (D0)、Preview Popup 交互 (D0a)、页面目录 (D1)、Cycles 列表 (D1a)、Cycle Team 视图 (D1b)、人工干预 (D2)、数据流 (D3)、Rooms 页面 (D4)、Settings 面板 (D5)、Plan 交互 (D6)、通知 (D7)、Assets 预览 (D8)、Inbox 邮件视图 (D9)、Milestones 页面 (D10)。

> **设计原则**: Dashboard 是观测 harness team 的工具，信息密度必须服务于"一眼看懂当前 team 在干嘛"。Cycle 是一等公民，所有执行细节 (task / agent run / test result / stream) 都以 cycle 为根聚合展示，不再有独立的 Tasks / Agents / Tests 顶层页面。Harness 层（通用）与 Product 层（游戏专属）严格分离：harness 代码里不出现 "L1/L2/L3/L4"、"M0-M15"、"zombie" 这类 product 术语，一切分层/阶段/素材都从运行时数据动态读取。

## D0. Home — Bento 预览网格 (`/`)

Home 不再是一堆 stat card, 而是一个 **Bento 网格**: 每个格子是对应子页面的实时缩略预览, 点格子弹 Popup 预览, 需要时再 maximize 进完整页面。用户打开 dashboard 第一眼就能看到 team 的全貌, 然后按需下钻。

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  Home · 2026-04-14 14:42             ⏸ Running · $142/$500 · 🔔 3 unread │
  ├──────────────────────────────────────────────────────────────────────────┤
  │                                                                          │
  │  ┌────────────────────────────┐  ┌──────────────────┐  ┌─────────────┐ │
  │  │  Active Cycle  M8-C1       │  │  Inbox  🔔 3     │  │ Spending    │ │
  │  │  ─────────────────────────  │  │ ──────────────── │  │ ─────────── │ │
  │  │  IMPLEMENT · 3/5 tasks      │  │ ● plan_qa        │  │  $142.50    │ │
  │  │  ████████░░░░░░  60%        │  │   突变多层?      │  │  / $500.00  │ │
  │  │                             │  │ ● approval       │  │  ██████░░░  │ │
  │  │  [Orch][Coder×3][Tstr][Rev] │  │   PR #1242       │  │  28.5%      │ │
  │  │                             │  │ ● next_cycle     │  │             │ │
  │  │  ↑ pipeline 缩略 (mini)     │  │                  │  │ last 7d     │ │
  │  │  ⏱ 42min · $2.40            │  │ [Open Inbox ↗]   │  │ ▇▅▇▆▇▇▆    │ │
  │  │  [Open Cycle ↗] [⛶]        │  │                  │  │             │ │
  │  └────────────────────────────┘  └──────────────────┘  └─────────────┘ │
  │  (2×2 格: 主卡)                  (1×2 格)              (1×2 格)         │
  │                                                                          │
  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────────┐ │
  │  │ Milestones     │  │ Rooms & Specs  │  │  Recent Cycles             │ │
  │  │ ────────────── │  │ ────────────── │  │  ────────────────────────  │ │
  │  │ M8 ████░░ 60%  │  │ 42 active      │  │  M8-C1  ● running   $2.40  │ │
  │  │ M7 ██████100%  │  │ 3 draft ⚠      │  │  M8-C0  ✗ failed    $4.10  │ │
  │  │ M6 ██████100%  │  │ 12 stale       │  │  M7-C5  ✔ merged    $3.20  │ │
  │  │ next: M9       │  │                │  │  M7-C4  ✔ merged    $2.80  │ │
  │  │ [Open ↗]       │  │ [Open ↗]       │  │  [Open List ↗]             │ │
  │  └────────────────┘  └────────────────┘  └────────────────────────────┘ │
  │  (1×1 格)            (1×1 格)            (2×1 格)                       │
  │                                                                          │
  │  ┌────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
  │  │ Assets Preview     │  │ Tests (latest)   │  │  Analytics           │ │
  │  │ ──────────────────│  │ ──────────────── │  │  ─────────────────── │ │
  │  │ ▨ ▨ ▨ ▨ ▨         │  │ pass rate 96%    │  │ Fail reasons (7d):   │ │
  │  │ ▨ ▨ ▨ ▨ ▨         │  │ unit 18/18       │  │  ▇ timeout     12    │ │
  │  │ ▨ ▨ ▨ ▨ ▨         │  │ integr 5/6 ⚠     │  │  ▇ lint        8     │ │
  │  │ 24 placeholder     │  │ scene 1/1        │  │  ▇ type error  5     │ │
  │  │ 8 replaced         │  │                  │  │                      │ │
  │  │ [Open ↗]           │  │ (cycle 内聚合)    │  │ [Open Analytics ↗]   │ │
  │  └────────────────────┘  └──────────────────┘  └──────────────────────┘ │
  │  (1×1 格)              (1×1 格)               (1×1 格)                  │
  │                                                                          │
  │  ┌──────────────────────────────────────────────────────────────────┐   │
  │  │  Events Stream (live SSE, auto-scroll)                           │   │
  │  │  ─────────────────────────────────────────────────────────────── │   │
  │  │  14:42  agent:started    coder  TASK-00043                       │   │
  │  │  14:42  job:requires_approval  next-cycle M8-C1                  │   │
  │  │  14:40  agent:completed  coder  TASK-00041  $0.42                │   │
  │  │  14:39  cycle:progress   M8-C1  3/5                              │   │
  │  └──────────────────────────────────────────────────────────────────┘   │
  │  (3×1 格, 贯穿底部)                                                     │
  └──────────────────────────────────────────────────────────────────────────┘

  Bento 格子规格 (12 列网格):
   • Active Cycle   col-span-6 row-span-2  (主卡, 两倍大)
   • Inbox          col-span-3 row-span-2
   • Spending       col-span-3 row-span-2
   • Milestones     col-span-3 row-span-1
   • Rooms          col-span-3 row-span-1
   • Recent Cycles  col-span-6 row-span-1
   • Assets         col-span-4 row-span-1
   • Tests          col-span-4 row-span-1
   • Analytics      col-span-4 row-span-1
   • Events Stream  col-span-12 row-span-1
```

### D0.1 每个 Bento 格子的设计契约

- **自包含**: 不需要点开就能看懂"当前状态"; 缩略信息 ≥ 3 条, ≤ 6 条
- **实时**: 通过 SSE 订阅, 后端事件驱动更新, 不轮询
- **两级下钻**: 右下角两个按钮
   - `[Open ↗]` → 弹 Popup (D0a, 中等尺寸, 保留 Home 作为背景)
   - `[⛶]` → 直接 maximize 到对应完整页面 (跳路由)
- **空状态**: 每个格子都要定义空态 ("No active cycle" / "Inbox zero 🎉" / ...)
- **可拖动 (v2)**: 用户可以自定义 bento 布局, 存 localStorage

## D0a. Preview Popup 交互

点 Bento 格子 (或 `[Open ↗]` 按钮) → 弹出 popup, 是对应子页面的只读预览。Popup 右上角有 `[⛶ Maximize]` 按钮, 点了就跳到完整路由, 保留当前滚动位置。

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │    [Home 背景, 半透明遮罩 rgba(0,0,0,0.6)]                           │
  │                                                                      │
  │      ┌────────────────────────────────────────────────────┐          │
  │      │  Cycle M8-C1 · IMPLEMENT          [⛶]  [✕]        │          │
  │      │  ────────────────────────────────────────────────  │          │
  │      │                                                    │          │
  │      │  [Orchestrator]→[Coder ×3]→[Tester]→[Reviewer]    │          │
  │      │  ↑ 实时 pipeline (D1b 的完整视图缩放到 popup 尺寸) │          │
  │      │                                                    │          │
  │      │  Tasks 面板 (前 5 条)                              │          │
  │      │  TASK-00041 ✔ merged    $0.92                      │          │
  │      │  TASK-00042 ● running   $0.74                      │          │
  │      │  ...                                               │          │
  │      │                                                    │          │
  │      │  Tests summary · Events log (折叠, 可展开)         │          │
  │      │                                                    │          │
  │      └────────────────────────────────────────────────────┘          │
  │      Popup 尺寸: min(90vw, 1200px) × min(85vh, 800px)               │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘

  交互约束:
   • Popup 内容 = 对应完整页面的"只读 + 核心模块" 版本 (去掉创建表单等写操作)
   • [⛶ Maximize] → router.push('/cycles/M8-C1'), popup 关闭, 路由跳转
   • [✕] / ESC / 点背景遮罩 → 关闭 popup, 留在 Home
   • 键盘: F 或 ⌘↑ 放大, ESC 关闭
   • 在 popup 内点内部链接 (如 task 行) → 自动 maximize 到目标页面并定位
   • SSE 订阅和完整页面一致, popup 开着就继续推送更新
   • 最多同时打开 1 个 popup (点另一个 bento 会替换当前 popup)

  数据获取策略:
   • Popup 调用的 API 和完整页面相同, 后端用统一的 ?preview=1 参数告诉前端
     只渲染核心区 (前端组件据此决定不渲染创建表单、批量工具等)
   • 不重复拉数据: 从 Home bento 点进来时, 已有的聚合数据作为初始态, popup
     再做一次完整 fetch 对齐
```

## D1. 页面结构

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    DASHBOARD (Next.js :3000)                  │
  └─────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────┐
  │ 页面              │ 功能                                     │
  ├───────────────────┼──────────────────────────────────────────┤
  │ Home              │ 系统状态总览 + Analytics:                 │
  │                   │  ── 实时状态 ─────────────────────        │
  │                   │  active cycle, spending                  │
  │                   │  pending approvals 数 (→ Jobs)           │
  │                   │  draft specs 数 (→ Rooms)                │
  │                   │  本 cycle 花费 vs 预算                   │
  │                   │  startup recovery banner (如果恢复中)    │
  │                   │  ── Analytics (下钻面板) ─────────        │
  │                   │  Spending (per-cycle + per-task breakdown)│
  │                   │  Task 成功率 / Review 质量               │
  │                   │  失败原因 top 5 (error message 聚合)    │
  │                   │  Spec 变更历史 (per-cycle 新增/改/删)   │
  │                   │                                          │
  │ Cycles            │ Cycle 列表                               │
  │                   │ 创建新 cycle (指定 milestone + goal)     │
  │                   │ → 点击进入 Cycle Team 视图 (D1a)         │
  │                   │   (含 Tests 面板 + Screenshots)          │
  │                   │                                          │
  │ Milestones        │ Milestone 进度追踪 (动态同步, 非硬编码)  │
  │                   │                                          │
  │ Inbox             │ 邮件式消息中心 — 所有等人拍板的事项 (D9) │
  │                   │  • Job 审批 (requiresApproval=true)     │
  │                   │  • Plan Q&A 回答                        │
  │                   │  • Plan Review 确认                     │
  │                   │  • PR Human Gate (protected paths)      │
  │                   │  • Draft spec 确认 (Curator 0.50-0.74)  │
  │                   │  • Next-cycle 继续/停止决策             │
  │                   │  顶部导航:  🔔 红点 + 未读数            │
  │                   │  页面体验: 邮箱视图 (列表 + 详情面板)    │
  │                   │                                          │
  │ Rooms             │ Room 树形浏览 + Spec 详情                │
  │                   │ [Archive All Stale] 批量操作             │
  │                   │ Spec 变更时间线                          │
  │                   │                                          │
  │ Assets            │ Asset 清单 + 真实文件预览 (D8)           │
  │                   │  sprite/tilemap/ui → 图片渲染            │
  │                   │  sfx/bgm            → 内嵌 audio 播放器  │
  │                   │  spriteframes/vfx   → 帧序列 / 元数据    │
  │                   │  font/theme         → 采样渲染           │
  └───────────────────┴──────────────────────────────────────────┘
```

**移除的页面**:
- ~~Tasks (顶层)~~ → 下沉到 Cycle 详情页的 Tasks 面板
- ~~Agents (顶层)~~ → 下沉到 Cycle Team 视图的 agent 卡片 + 抽屉
- ~~Tests (顶层)~~ → 下沉到 Cycle 详情页的 Tests 面板 (按 task 聚合)
- ~~Analytics (顶层)~~ → 合并到 Home 页作为下钻面板
- ~~Jobs + Review (两个独立页)~~ → 合并为单一 Inbox 页 (邮件式, 见 D9)
- ~~Control (顶层)~~ → 降级为右上角齿轮图标 Settings 面板 (见 D5)

**路由变更**:
- 删除 `/agents`、`/agents/[id]`、`/tasks`、`/tasks/[id]`、`/tests`、`/analytics`
- 合并 `/jobs` + `/review` → `/inbox` (带类型过滤 tab: All / Approvals / Plan Q&A / PR Gate / Drafts)
- `/control` 从顶部导航移除, 保留路由但改为 Modal/Drawer 弹出, 由顶部右上角 ⚙ 图标触发
- 原 `/agents/[id]` 的内容改为 `/cycles/[id]?agent=coder` (抽屉形式)
- 原 `/tasks/[id]` 的内容改为 `/cycles/[id]?task=TASK-00042` (抽屉形式)
- 原 `/tests` 的内容改为 Cycle 详情页内的 Tests 面板, 单条 TestResult 展开在 Task Drawer 内
- 不做 301 跳转，直接删除 (内部观测工具，无外部链接)

**顶部导航栏布局**:

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  ⚡ Harness                                                           │
  │                                                                      │
  │  Home   Cycles   Milestones   Rooms   Assets           🔔³  ⚙       │
  │                                                          │    │       │
  │                                                          │    └─ Settings drawer
  │                                                          │       (原 Control 页,
  │                                                          │        modal 形式弹出)
  │                                                          │
  │                                                          └─ Inbox (带未读红点 + 数字)
  │                                                             点击进入邮件视图 (D9)
  └──────────────────────────────────────────────────────────────────────┘

  左侧主导航 (5 项) : Home · Cycles · Milestones · Rooms · Assets
  右侧工具区 (2 个) : Inbox (🔔) · Settings (⚙)

  设计意图:
   • 左侧是"观察"入口 (看 team 在做什么 / 做了什么)
   • 右侧是"干预"入口 (消息中心 + 系统设置), 和邮件客户端的铃铛/齿轮约定一致
   • Inbox 的未读数全局可见, 无需主动轮询, 有新事项立即高亮
   • Settings 做成 drawer 而不是独立页, 减少导航层级, 配置是低频操作
```

## D1a. Cycles 列表 (`/cycles`)

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Cycles                                    [+ New Cycle]             │
  │  [All] [Running] [Completed] [Failed]     Milestone: [All ▼]        │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  ID      Status      Milestone  Goal                Cost    Tasks    │
  │  ──────  ──────────  ─────────  ────────────────    ──────  ──────   │
  │  M8-C1   ● running   M8         突变系统基础        $2.40   3/5      │
  │  M8-C0   ✗ failed    M8         突变数据模型        $4.10   0/3      │
  │  M7-C5   ✔ merged    M7         Skill 面板收尾      $3.20   4/4      │
  │  M7-C4   ✔ merged    M7         XP 系统             $2.80   3/3      │
  │  M7-C3   ✔ merged    M7         Progression schema  $2.10   2/2      │
  │  ...                                                                  │
  │                                                                      │
  │  (行点击 → 进入 D1b Cycle Team 视图)                                 │
  └──────────────────────────────────────────────────────────────────────┘

  [+ New Cycle] 弹出创建表单:
   ┌─ Create Cycle ──────────────────────────────┐
   │  Milestone: [M8 ▼]                           │
   │  Goal:      [_______________________________] │
   │  Budget:    [$5.00      ]                    │
   │  Mode:      [Auto ▼]                         │
   │  [Cancel]  [Create]                          │
   └──────────────────────────────────────────────┘
```

## D1b. Cycle Team 视图 (`/cycles/[id]`)

Cycle 详情页是 Dashboard 的核心。一个 cycle 对应一个 "team" —— 6 个 agent 角色按 pipeline 顺序协作，视图以横排 pipeline + 箭头连线呈现当前 team 的状态。

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  ← Cycles     Cycle M8-C1 · IMPLEMENT · ███████░░░ 3/5 tasks        │
  │                                                                      │
  │  Milestone M8  Room 04-03-mutation  Budget $2.40 / $5.00  ⏱ 42min  │
  │  [Pause] [Kill] [View Plan] [View PR #1242]                          │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─────────── Team Pipeline (横排 + 箭头连线, 多实例 agent 堆叠) ──────┐
  │                                                                      │
  │   ┌──────────┐    ┌─ Coder ──┐    ┌─ Tester ─┐    ┌─Reviewer─┐     │
  │   │ Orches-  │    │  ×3      │    │  ×1      │    │  ×0      │     │
  │   │ trator   │───►│ ● 2 run  │───►│ ● 1 run  │───►│  ○ idle  │──┐  │
  │   │          │    │ ✔ 1 done │    │  ✔ 0     │    │          │  │  │
  │   │ ✔ done   │    │ ████░░   │    │ ██░░░░   │    │  ░░░░░░  │  │  │
  │   │ 2m 18s   │    │ 8m 12s   │    │ 3m 04s   │    │  -       │  │  │
  │   │ $0.32    │    │ $1.86    │    │ $0.44    │    │  -       │  │  │
  │   └──────────┘    └──────────┘    └──────────┘    └──────────┘  │  │
  │                        ▲ 实例堆叠                                │  │
  │                    TASK-041, 042, 043                           │  │
  │                                                                  ▼  │
  │                                    ┌─Integrator┐   ┌─ Curator ─┐    │
  │                                    │  ×0       │   │  ×0       │    │
  │                               ┌───►│  ○ idle   │──►│  ○ idle   │    │
  │                               │    │           │   │           │    │
  │                               │    │  ░░░░░░   │   │  ░░░░░░   │    │
  │                               │    │  -        │   │  -        │    │
  │                               │    └───────────┘   └───────────┘    │
  │                                                                      │
  │   状态图例:  ● running    ✔ done    ✗ failed    ⏸ waiting    ○ idle │
  │   角标 ×N:   本 cycle 内该 agent 的 run 总数 (含已完成 + 进行中)    │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─────────── Agent 多实例语义 ────────────────────────────────────────┐
  │                                                                      │
  │  单例角色 (每 cycle 最多 1 run):                                     │
  │   • Orchestrator — plan 阶段一次, 可能 replan 计数 +1                │
  │   • Curator      — cycle 收尾一次                                    │
  │                                                                      │
  │  多实例角色 (每 task 起一个 run, 可并发):                            │
  │   • Coder       — 每个 task 一个 run, 受 CONCURRENT_AGENT_SLOTS 限流 │
  │   • Tester      — 每个 task 一个 run                                 │
  │   • Reviewer    — 每个 task 一个 run (含 replan 时的 plan-review)    │
  │   • Integrator  — 每个 task 一个 run                                 │
  │                                                                      │
  │  多实例 agent 卡片显示:                                              │
  │   • 右上角 ×N 徽章 (本 cycle 累计 run 数)                            │
  │   • "● X run" + "✔ Y done" 分状态计数                                │
  │   • 迷你进度条: 已完成/运行中/待启动 堆叠显示                        │
  │   • 耗时 = 所有 run 累计 (并行时 > wall clock)                       │
  │   • 花费 = 所有 run 的 USD 累计                                      │
  │   • 任一子 run 是 running → 卡片脉冲动画                             │
  │   • 任一子 run 是 failed  → 卡片红色边框                             │
  └──────────────────────────────────────────────────────────────────────┘

  点击多实例卡片 → 右侧滑出 Agent Drawer (本 cycle 所有该角色 run):
   ┌─ Drawer: Coder · 3 runs ──────────────────────────┐
   │  [ 全部 ] [ running ] [ done ] [ failed ]           │
   │                                                     │
   │  ▾ run-a1b2  ✔ done    TASK-00041  2m 14s  $0.42   │
   │     (点击展开: stream + context snapshot)           │
   │  ▾ run-c3d4  ● running TASK-00042  3m 04s  $0.74   │
   │     > tool_use: Read(src/mutation.gd)               │
   │     > tool_use: Edit(src/mutation.gd)               │
   │     > text: "Adding mutation formula..."            │
   │  ▾ run-e5f6  ● running TASK-00043  1m 50s  $0.70   │
   │                                                     │
   │  Context snapshot (per run):                         │
   │   • Specs injected: 8 (4 constraint, 3 decision...) │
   │   • Rooms: 04-03-mutation, 02-02-coder              │
   └─────────────────────────────────────────────────────┘

  点击单例卡片 (Orchestrator / Curator) → 直接展示单个 run 的 stream + context。

  ┌─────────── Tasks 面板 (pipeline 下方) ──────────────────────────────┐
  │  TASK-00041  ✔ merged    Coder→Tester→Reviewer→Integrator  $0.92   │
  │               tests: ✔ 3 layers (unit 8/8, integration 4/4, scene 5/5)│
  │  TASK-00042  ● running   Coder                             $0.74   │
  │  TASK-00043  ○ pending                                      -      │
  │  TASK-00044  ○ pending                                      -      │
  │  TASK-00045  ○ pending                                      -      │
  │                                                                      │
  │  点击 task → Task Drawer (原 /tasks/[id] 的内容):                    │
  │   • Task goal / acceptance criteria                                 │
  │   • Per-agent run 时间线 (谁跑过、多久、花多少)                      │
  │   • Test results (按 result.layer 动态分组, 不硬编码 L1-L4)         │
  │   • Screenshots (Tester agent 产出的游戏截图 + AI 分析)             │
  │   • Conflict / retry 历史                                           │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─────────── Tests 面板 (cycle 级聚合, 可折叠) ───────────────────────┐
  │  Cycle 累计:  passed 24 / failed 1  (pass rate 96%)                 │
  │  By layer (动态):                                                    │
  │    unit        ████████████████████ 18/18                           │
  │    integration ████████████░░░░░░░░  5/6   ⚠ 1 failed              │
  │    scene       ██████████████████░░  1/1                            │
  │                                                                      │
  │  ⚠ Recent failures:                                                 │
  │    TASK-00041 · integration · test_harvest_flow                     │
  │    expected: quality=gold  actual: quality=silver                   │
  │    → scripts/harvest.gd:42  (Tester suggestedFixDirection)         │
  │                                                                      │
  │  点击某行 → 跳转到对应 Task Drawer 的 Tests tab                     │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─────────── Events Log (底部, 可折叠) ───────────────────────────────┐
  │  14:23  agent:completed  coder TASK-00041  $0.42                    │
  │  14:24  agent:started    tester TASK-00041                          │
  │  14:25  task:status_changed  TASK-00041 → tested                    │
  └──────────────────────────────────────────────────────────────────────┘
```

**布局要点**:
- 六个 agent 角色固定位置，即使本 cycle 没跑也显示为 `×0 ○ idle` 占位，让 team 形状稳定
- 单例角色 (Orchestrator/Curator) 卡片不显示 ×N 徽章
- 多实例角色 (Coder/Tester/Reviewer/Integrator) 卡片显示 ×N 徽章 + 堆叠进度条，点击进 drawer 查看所有子 run
- 箭头连线表示默认 pipeline 流向 (Orchestrator → Coder → Tester → Reviewer → Integrator → Curator)，连线颜色随上游 agent 状态变化 (灰=未走过, 蓝=有 run 进行中, 绿=全部成功, 红=有 failed)
- running 状态的卡片脉冲动画；failed 状态的卡片红色边框
- 所有数据来自现有 `/api/cycles/:id`、`/api/jobs?cycleId=...`、`/api/agents?cycleId=...`、`/api/events` SSE，不新增 endpoint
- 前端按 `agentRun.role` 聚合同角色 runs 到同一卡片，`role === 'coder'` 等多实例角色用 groupBy，Orchestrator/Curator 直接单选

## D2. 人工干预操作

```
  ┌─────────────────────────────────────────────────────────────┐
  │              HUMAN INTERVENTION — 场景 × 页面 × 操作         │
  └─────────────────────────────────────────────────────────────┘

  所有需要人工介入的场景及对应的 Dashboard 操作:

  ┌──────────────────────────────────────────────────────────────┐
  │ 场景                      │ 页面     │ 操作                  │
  ├───────────────────────────┼──────────┼───────────────────────┤
  │ Job 审批                  │ Inbox    │ Approve / Reject      │
  │ (requiresApproval=true)   │          │ 可附 reason           │
  │                           │          │                       │
  │ Plan Q&A 回答             │ Inbox    │ 选项 + feedback       │
  │ (Orchestrator 有问题)     │          │ Submit Answers        │
  │                           │          │                       │
  │ Plan Review 确认          │ Inbox    │ Approve Plan /        │
  │ (validator+reviewer OK)   │          │ Request Changes       │
  │                           │          │                       │
  │ Plan review reject ×2     │ Inbox    │ 升级为审批 item       │
  │ (Orchestrator 用完重试)   │          │ Approve / Reject      │
  │                           │          │                       │
  │ PR Human Gate             │ Inbox    │ 查看 PR diff          │
  │ (涉及 protected paths)   │          │ Approve / Reject      │
  │                           │          │                       │
  │ 失败后 next-cycle         │ Inbox    │ Approve 继续          │
  │ (所有 tasks failed)       │          │ Reject 停止           │
  │                           │          │                       │
  │ Draft spec 确认           │ Rooms /  │ 查看 spec 内容        │
  │ (Curator conf 0.50-0.74) │ Inbox    │ Activate / Archive    │
  │                           │          │ (Inbox 聚合快速操作)  │
  │                           │          │                       │
  │ 系统暂停/恢复             │ Control  │ Pause / Resume / Kill │
  │ (rate limit / spending)   │          │ 调整 spendingCapUsd   │
  │                           │          │                       │
  │ Spec 管理                 │ Rooms    │ 查看/编辑/归档 spec   │
  │ (override Curator 决策)   │          │ 创建人工 spec         │
  └───────────────────────────┴──────────┴───────────────────────┘

  Inbox 是所有"等我拍板"事项的单一入口。顶部导航徽章显示未处理总数,
  所有 requires_approval / plan_qa / plan_review / pr_gate / draft_spec
  都以统一的 InboxItem 形式展示,用类型 tab 过滤。
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
  │  SSE 事件驱动 UI 更新 (全部在 Cycle Team 视图内):           │
  │  • agent:started          → 对应 agent 卡片 → running       │
  │  • agent:completed        → agent 卡片 → done + 刷新 task   │
  │  • cycle:completed        → Cycles 列表刷新                 │
  │  • task:status_changed    → Tasks 面板行更新                │
  │  • task:conflict_requeued → Tasks 面板 ⚠ 冲突标记 +        │
  │                              冲突文件列表 + attempt 次数    │
  │  • job:requires_approval  → Jobs 页面弹通知                 │
  │  • system:spending_warning→ Control 页面告警                │
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

## D5. Settings 面板 (Drawer, 触发自右上角 ⚙)

Control 不再是独立页面, 而是从顶部导航栏右上角齿轮图标滑出的 drawer。原因: 系统配置是低频操作, 不值得占据顶部导航一格; drawer 形式让用户可以在任何页面就地改配置不打断当前观察上下文。

```
                                                          ⚙ 点击
                                                          ↓
  ┌────────────────────────────────────── Settings ──── ✕ ┐
  │                                                       │
  │  System State                                         │
  │  ┌─────────────────────────────────────────────────┐  │
  │  │ System:    [Running ▼]   running/paused/killed  │  │
  │  │ Operation: [Auto ▼]      auto/supervised/manual │  │
  │  │   Auto       全自动, spending 80% 除外          │  │
  │  │   Supervised 关键操作等人, 其他自动             │  │
  │  │   Manual     所有操作等人                        │  │
  │  └─────────────────────────────────────────────────┘  │
  │                                                       │
  │  Budget                                               │
  │  ┌─────────────────────────────────────────────────┐  │
  │  │ Spending: $142.50 / $500.00                     │  │
  │  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░  28.5%        │  │
  │  │ Cap: [$500.00  ] [Update]                       │  │
  │  └─────────────────────────────────────────────────┘  │
  │                                                       │
  │  Message to Agents                                    │
  │  ┌─────────────────────────────────────────────────┐  │
  │  │ [__________________________________] [Send]    │  │
  │  └─────────────────────────────────────────────────┘  │
  │                                                       │
  │  Recent System Events                                 │
  │  ┌─────────────────────────────────────────────────┐  │
  │  │ 14:23  spending_warning       28.5% of cap      │  │
  │  │ 14:20  agent:completed        curator  $1.20    │  │
  │  │ 14:15  cycle:completed        M8-C1             │  │
  │  └─────────────────────────────────────────────────┘  │
  │                                                       │
  └───────────────────────────────────────────────────────┘

  触发方式:
   • 顶部导航 ⚙ 图标 (任何页面都可点)
   • 快捷键 ⌘, (Cmd+Comma, macOS 惯例)

  行为:
   • 右侧滑入 drawer, 宽 420px, 不阻塞后面的页面
   • ESC 或点背景关闭; 再次点 ⚙ toggle
   • 状态变更即时生效 (走 PATCH /api/control)
   • "Recent System Events" 通过 SSE 实时追加
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

## D8. Assets 页面 — 真实文件预览

Assets 页面不再是静态 PRD 清单，而是从 game repo (`zombie-farm-godot`) 实时扫描 + 渲染真实文件。Dashboard 变成美术资源的「可视化索引」：每张 sprite 能看图、每段音效能点播放、每个主题能采样渲染。

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Assets · 从 zombie-farm-godot/registry + assets/ 读取 · 58/152 已产  │
  │                                                                      │
  │  [Sprites ×24] [Tilemaps ×3] [UI ×12] [Anim ×5] [VFX ×2]             │
  │  [SFX ×18] [BGM ×4]    Milestone: [All ▼]  Status: [All ▼]          │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─────────── Asset Grid (按 category 分栏) ───────────────────────────┐
  │                                                                      │
  │   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
  │   │            │  │            │  │            │  │            │   │
  │   │  [PNG      │  │  [PNG      │  │  [PNG      │  │   planned  │   │
  │   │   preview] │  │   preview] │  │   preview] │  │   no file  │   │
  │   │            │  │            │  │            │  │            │   │
  │   │ 32×32 nearest│ │ 32×32     │  │ 32×48     │  │            │   │
  │   ├────────────┤  ├────────────┤  ├────────────┤  ├────────────┤   │
  │   │ player     │  │ zombie_base│  │ zombie_brute│ │ zombie_runner│ │
  │   │ ✔ final    │  │ ◐ placeholder│ ◐ placeholder│ │ ○ planned  │   │
  │   │ M0         │  │ M2 · 4KB   │  │ M3 · 5KB   │  │ M3         │   │
  │   └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
  │                                                                      │
  │   ┌── SFX row ──────────────────────────────────────────────────┐   │
  │   │ ▶ plant.wav       0:00/0:02  ━━━━━━━━━━━━  ◐ placeholder   │   │
  │   │ ▶ harvest.wav     0:00/0:01  ━━━━━━━━━━━━  ✔ final          │   │
  │   │ ▶ zombie_death.wav 0:00/0:01 ━━━━━━━━━━━━  ○ planned (no file)│ │
  │   └──────────────────────────────────────────────────────────────┘   │
  │                                                                      │
  │   ┌── Animation (spriteframes) ─────────────────────────────────┐   │
  │   │ zombie_grow  5 帧  ⏵ [frame1][frame2][frame3][frame4][frame5]│   │
  │   │ (hover → 自动循环播放;  点击 → 打开大图 modal)              │   │
  │   └──────────────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────────────┘

  点击 asset → 右侧滑出 Asset Drawer:
   ┌─ Drawer: sprite.characters.zombie_base ────────────┐
   │  ┌─────────────────────────────────┐                │
   │  │                                  │                │
   │  │      [大图预览, nearest-neighbor] │                │
   │  │      zoom 1x / 2x / 4x / 8x      │                │
   │  │                                  │                │
   │  └─────────────────────────────────┘                │
   │                                                      │
   │  Path:      assets/sprites/characters/zombie_base.png│
   │  Size:      4.2 KB                                   │
   │  Dimensions:32×32  hframes: 4                        │
   │  SHA256:    a3b2…f91                                 │
   │  Status:    placeholder                              │
   │  Milestone: M2                                       │
   │  Spec:      "32×32, 4 hframes (idle walk)"           │
   │                                                      │
   │  Used in (grep registry):                            │
   │   • scripts/zombie.gd:14                             │
   │   • scenes/zombie.tscn                               │
   │                                                      │
   │  History (git log on file):                          │
   │   • 2026-03-28  cycle M2-C3 placeholder generated    │
   │   • 2026-04-02  cycle M2-C7 replaced with v2         │
   └──────────────────────────────────────────────────────┘
```

### D8.1 预览策略 (按 asset type)

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Asset type       │ 渲染方式                                          │
  ├──────────────────┼───────────────────────────────────────────────────┤
  │ texture (png/jpg)│ <img> + image-rendering: pixelated                │
  │                  │ hframes > 1 → 切片为多帧横排展示                  │
  │                  │                                                    │
  │ spriteframes     │ 读 .tres 元数据 → 逐帧 <img> 横排                 │
  │ (Godot resource) │ hover 自动循环 (requestAnimationFrame)            │
  │                  │                                                    │
  │ audio (wav/ogg)  │ 原生 <audio controls preload="metadata">          │
  │                  │ 悬浮波形缩略图 (canvas, 客户端解码)              │
  │                  │                                                    │
  │ font (ttf/otf)   │ @font-face 动态注入 → 渲染预览句子              │
  │                  │  "僵尸农场 Zombie Farm 1234567890"               │
  │                  │ 多字号采样: 12px / 16px / 24px / 32px            │
  │                  │                                                    │
  │ theme (.tres)    │ 解析文本 → 列出 color/font/stylebox 条目         │
  │                  │ 不做真实 Godot 渲染 (代价过高)                   │
  │                  │                                                    │
  │ shader (.gdshader)│ 显示源码 (syntax highlight)                      │
  │                  │ 不做 WebGL 重放                                    │
  │                  │                                                    │
  │ particles (.tres)│ 展示 texture 预览 + 参数列表                     │
  │                  │                                                    │
  │ planned (no file)│ 占位卡片 (虚线边框) + spec 描述                 │
  │                  │ 状态标签 "planned"                                │
  └──────────────────────────────────────────────────────────────────────┘
```

### D8.2 数据源 — 扫描 vs Registry

两种模式，`registry` 优先，回退到 `scan`：

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Mode 1: registry (优先)                                              │
  │  读 zombie-farm-godot/registry/*.json (asset pipeline Phase 5 产物)  │
  │  字段: asset_id, path, status, sha256, milestone, spec               │
  │                                                                      │
  │ Mode 2: filesystem scan (回退)                                       │
  │  Phase 5 未落地时使用                                                │
  │  递归扫描 zombie-farm-godot/assets/ 按约定前缀映射到 asset_id        │
  │   assets/sprites/characters/player.png → sprite.characters.player   │
  │   assets/audio/sfx/plant.wav           → audio_sfx.plant            │
  │  与 PRD 静态清单 (PLANNED_ASSETS) join → 未命中的标 planned          │
  │                                                                      │
  │ Mode 3: 混合                                                         │
  │  默认行为: 先读 registry, 缺失 asset_id 从 scan 补, 都没有则 planned │
  └──────────────────────────────────────────────────────────────────────┘
```

### D8.3 后端 API

新增 3 个 server 端点 (`apps/server/src/routes/assets.ts`)：

```
  GET /api/assets
    查询参数: ?category=sprite&milestone=M2&status=placeholder
    返回: AssetSpec[] (合并 registry + scan + PLANNED 清单)
    字段:
      asset_id, category, subcategory, name, type
      status: planned | placeholder | replaced | final
      milestone, priority, spec
      file?: { relPath, sizeBytes, sha256, width?, height?, hframes?, duration? }

  GET /api/assets/:assetId/file
    透传真实文件字节流 (Content-Type 按扩展名)
    Cache-Control: public, max-age=60  (sha256 变化时由 etag 触发刷新)
    404 if planned (无文件)

  GET /api/assets/:assetId/metadata
    返回富元数据: git log 历史、用到它的 scene/script 文件列表、上次替换的 cycle
```

Dashboard 通过 `<img src="/api/assets/:id/file">` 和 `<audio src="/api/assets/:id/file">` 直接引用，无需在前端重新打包资源。

### D8.4 安全与性能

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 安全:                                                                │
  │  • asset_id 严格白名单校验 (正则 ^[a-z0-9_.]+$)                     │
  │  • 解析后路径必须落在 zombie-farm-godot/assets/ 内 (防 ../ 逃逸)   │
  │  • 拒绝 symlink 跨越 repo 根                                         │
  │                                                                      │
  │ 性能:                                                                │
  │  • server 端 LRU 缓存 registry + scan 结果 (TTL 30s)                │
  │  • 大图片走 HTTP etag, 浏览器缓存                                    │
  │  • 音频用 preload="metadata", 只在点播放时下载完整文件              │
  │  • grid 渲染使用 IntersectionObserver 懒加载 (视口外不拉图)         │
  │                                                                      │
  │ 容量预估:                                                            │
  │  预计总 asset 数 < 300, 总大小 < 20MB (pixel art + wav)             │
  │  不需要 CDN, server 直接 fs.createReadStream 即可                   │
  └──────────────────────────────────────────────────────────────────────┘
```

### D8.5 与现有 Assets 页面的差异

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 当前 (静态)                 │ 新版 (D8)                               │
  ├─────────────────────────────┼─────────────────────────────────────────┤
  │ 硬编码 PLANNED_ASSETS 数组  │ 从 registry + filesystem 实时读取       │
  │ 只有文字说明                │ 真实图片/音频/字体/帧动画预览          │
  │ 分类 + milestone 过滤       │ 保留, 额外增加 status 过滤              │
  │ 状态永远是 "planned"        │ 真实的 planned/placeholder/replaced/final│
  │ 无文件元数据                │ 文件大小/尺寸/sha256/git 历史           │
  │ 无法跳转到引用              │ "Used in" 显示引用该 asset 的 scene/gd  │
  └──────────────────────────────────────────────────────────────────────┘
```

## D9. Inbox — 邮件式消息中心

Inbox 用邮件客户端的心智模型组织所有"等人拍板"的事项。用户每天第一件事就是打开 Inbox 看未读, 处理完就清零, 不需要在多个页面之间来回查状态。

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  🔔 Inbox · 3 unread                           [✓ Mark all read]     │
  │  ┌──────┬─────────────┬─────────────────────────────────────────┐   │
  │  │ All  │ Approvals 2 │ Plan Q&A 1 │ PR Gate 0 │ Drafts 0 │     │   │
  │  └──────┴─────────────┴─────────────────────────────────────────┘   │
  │                                                                      │
  │  ┌─ Item List (左列) ──────┐  ┌─ Detail Panel (右列) ────────────┐ │
  │  │                          │  │                                    │ │
  │  │ ● 14:42  PLAN Q&A        │  │  From:  Orchestrator · Cycle M8-C1│ │
  │  │   Orchestrator M8-C1     │  │  Type:  plan_qa                    │ │
  │  │   突变系统要支持多层?  │  │  Age:   3 min                      │ │
  │  │   🔔 3 min                │  │                                    │ │
  │  │                          │  │  ─── Question ───────────────    │ │
  │  │ ● 14:28  APPROVAL        │  │  Q1: 突变系统要支持多层突变吗?    │ │
  │  │   Integrator merge PR    │  │    ○ 单层 (1 cycle)  ← recommend  │ │
  │  │   #1242 touches protected│  │    ● 多层 (2 cycles)              │ │
  │  │   🔔 17 min               │  │                                    │ │
  │  │                          │  │  Q2: 突变 UI 本 cycle 还是下个?   │ │
  │  │ ● 13:55  APPROVAL        │  │    ○ 本 cycle                      │ │
  │  │   Next-cycle continue?  │  │    ● 下个 cycle      ← recommend  │ │
  │  │   M8-C0 all tasks failed │  │                                    │ │
  │  │   🔔 50 min               │  │  Feedback (optional):              │ │
  │  │                          │  │  [突变概率参考 PRD 03b_______]    │ │
  │  │ ○ 12:10  DRAFT SPEC      │  │                                    │ │
  │  │   Curator draft 0.62     │  │  [Submit Answers]  [Defer]        │ │
  │  │   "L4 与 L2 并行执行"    │  │                                    │ │
  │  │   (read)                 │  │  ─── Context ───────────────      │ │
  │  │                          │  │  Cycle: M8-C1 · Room 04-03-muta   │ │
  │  │ ○ 11:45  PR GATE         │  │  Goal: 突变系统基础               │ │
  │  │   ... (read)             │  │  Budget so far: $0.32 / $5.00     │ │
  │  │                          │  │  [→ 跳转到 Cycle Team 视图]       │ │
  │  │                          │  │                                    │ │
  │  └──────────────────────────┘  └────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘
```

### D9.1 Item 类型与统一结构

不同类型的事项用同一个 `InboxItem` shape 渲染, 差别只在 Detail Panel 的交互组件:

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ type          │ 源                  │ 主操作                         │
  ├───────────────┼─────────────────────┼────────────────────────────────┤
  │ approval      │ Job requiresApproval│ Approve / Reject (+reason)     │
  │ plan_qa       │ Orchestrator qs     │ 选项 + feedback + Submit       │
  │ plan_review   │ validator+reviewer  │ Approve Plan / Request Changes │
  │ pr_gate       │ Integrator PR gate  │ 查看 diff / Approve / Reject   │
  │ draft_spec    │ Curator 0.50-0.74   │ Activate / Archive / Edit      │
  │ next_cycle    │ All tasks failed    │ Continue / Stop                │
  └──────────────────────────────────────────────────────────────────────┘

  InboxItem 字段 (统一):
   • id, type, createdAt, readAt?
   • source: { cycleId, taskId?, agentRunId?, jobId? }
   • title: string               (列表行主标题)
   • preview: string             (列表行副标题, 2 行截断)
   • urgency: 'low'|'normal'|'urgent'  (driver: age + type + spending)
   • status: 'unread'|'read'|'resolved'
   • payload: <type-specific>    (渲染 Detail Panel 用)
```

### D9.2 邮箱体验要素

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 未读标记     │ 左侧蓝点 (●) , 已读灰圈 (○) , 列表字体加粗             │
  │ 红点徽章     │ 顶部导航 🔔N 实时更新 (SSE)                           │
  │ 类型 tab     │ 顶部 tab 带每类未读数, 默认 All                       │
  │ 紧急度       │ urgent item 整行红色背景 + ⚠ 图标                     │
  │ Defer        │ "稍后处理" 按钮, 保留未读但移到列表底部               │
  │ Mark read    │ 打开 Detail 即标已读 (不触发动作, 只更新 readAt)      │
  │ Mark all read│ 顶部按钮, 批量标已读 (不触发动作, 用于清视觉噪音)    │
  │ Resolved     │ 执行主操作后自动 resolved, 从列表移除, 可筛选查看     │
  │ 键盘导航     │ j/k 上下, Enter 打开, a=approve, r=reject, d=defer   │
  │ 空状态       │ 🎉 "Inbox zero — team is flying solo"                 │
  └──────────────────────────────────────────────────────────────────────┘
```

### D9.3 通知级联

Inbox 是"桌面"层, 但用户不一定盯着 dashboard, 所以新 item 还要有外部通道 (已在 D7 部分设计):

```
  新 InboxItem 触发链路:
                                                                  
  Agent/System 产生 → InboxItem 写入 Mongo                          
                    ↓                                              
                    ├─→ SSE event "inbox:new"                      
                    │     ↓                                        
                    │     Dashboard 红点 +1, 列表头部插入          
                    │                                              
                    └─→ Discord webhook (D7)                       
                          "🔔 Inbox: Orchestrator has 2 questions" 
                          含 deep link → /inbox?item=<id>          
```

### D9.4 后端 API

```
  GET    /api/inbox                       列表, 支持 ?type= ?status= ?cycleId=
  GET    /api/inbox/:id                   单条 + payload
  PATCH  /api/inbox/:id/read              标记已读 (不触发动作)
  PATCH  /api/inbox/:id/defer             延后
  POST   /api/inbox/:id/resolve           { action, ...typePayload } → 执行主操作
                                          server 内部路由到现有 job/plan/spec/pr 处理器
  POST   /api/inbox/mark-all-read         批量已读
```

后端不新建独立 collection, InboxItem 是对现有 `Job (requiresApproval=true, pending)`, `Job (type=plan_qa)`, `Spec (state=draft)`, `PR (human_gate pending)` 的 **视图聚合**, 通过 union query 动态返回。好处: 单一数据源, 没有同步漂移; 缺点: 需要索引支持快速查询 (已有字段覆盖)。

## D10. Milestones 页面 (`/milestones`)

Milestones 数据源**不是硬编码**, 而是从游戏 repo 的 `milestones/*.yaml` 同步到 Mongo, 附加 harness 运行时产生的状态字段 (见前面讨论)。页面本身是只读视图 + 可视化进度, 不做编辑。

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │  Milestones                              Source: zombie-farm-godot   │
  │  [Roadmap View] [List View]  · Last sync: 2 min ago  [↻ Sync]        │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Roadmap View (gantt-like 时间轴):                                   │
  │                                                                      │
  │   M0 │██████████│ ✔ done    (2026-02-14 → 02-21)    4 cycles · $12  │
  │   M1 │██████████│ ✔ done    (02-21 → 03-07)         7 cycles · $24  │
  │   M2 │██████████│ ✔ done    (03-07 → 03-21)         6 cycles · $22  │
  │   M3 │██████████│ ✔ done                            5 cycles · $18  │
  │   M4 │██████████│ ✔ done                            9 cycles · $34  │
  │   M5 │██████████│ ✔ done                            6 cycles · $21  │
  │   M6 │██████████│ ✔ done                            4 cycles · $14  │
  │   M7 │██████████│ ✔ done    (04-04 → 04-12)         5 cycles · $16  │
  │   M8 │████░░░░░░│ ● active  (04-12 → est. 04-19)    1.5 cycles · $6 │
  │   M9 │░░░░░░░░░░│ ○ planned                                         │
  │   M10│░░░░░░░░░░│ ○ planned                                         │
  │                                                                      │
  │  点击某个 milestone → Popup / Maximize 到详情                        │
  └──────────────────────────────────────────────────────────────────────┘

  ┌─ Milestone Detail (Popup 或全页) ───────────────────────────────────┐
  │  M8 · Mutations & Evolution            ● active · 30% done          │
  │  ──────────────────────────────────────────────────────────────────  │
  │                                                                      │
  │  Source file: zombie-farm-godot/milestones/M8-mutations.yaml        │
  │  Started:     2026-04-12                                            │
  │  Target:      2026-04-19 (estimated)                                │
  │                                                                      │
  │  Goals (from yaml):                                                  │
  │   ○ 突变实验室建筑                                                   │
  │   ● 4 种突变类型定义                                                 │
  │   ○ 催化剂系统                                                       │
  │   ○ 僵尸融合                                                         │
  │   ○ 隐藏基因                                                         │
  │                                                                      │
  │  Cycles contributing to M8:                                          │
  │   • M8-C0  ✗ failed    突变数据模型       $4.10                     │
  │   • M8-C1  ● running   突变系统基础       $2.40  (current)          │
  │                                                                      │
  │  Specs created under this milestone:                                 │
  │   • constraint-042  "突变概率遵循 PRD 03b 公式"                     │
  │   • decision-018    "催化剂作为独立 resource 存在"                  │
  │                                                                      │
  │  Total cost so far: $6.50                                            │
  │                                                                      │
  │  [→ Open PR list] [→ Open Cycles filtered by M8]                    │
  └──────────────────────────────────────────────────────────────────────┘
```

### D10.1 数据同步

```
  zombie-farm-godot/milestones/*.yaml   (source of truth, git 版本化)
         ↓  seed-milestones.ts
  Mongo: MilestoneModel                 (mirror + 运行时字段)
         ↓
  GET /api/milestones                   (dashboard 读)
```

触发时机:
- Server 启动时自动 seed
- 手动触发: `POST /api/milestones/sync` (页面 [↻ Sync] 按钮)
- 可选 webhook: game repo 推送 milestones/ 变更时触发

### D10.2 字段

**从 yaml 读取 (静态)**:
- `id`, `name`, `description`, `goals[]`, `features[]`, `dependsOn[]`, `estimatedWeeks`

**Harness 运行时写入**:
- `status: planned|active|completed|blocked`
- `cycles: [cycleId]`  (反向索引)
- `startedAt`, `completedAt`
- `totalCostUsd`
- `lastSyncedAt`



# Architecture — 系统架构与数据流

系统总览 (A1-A2)、数据流 (A3)、项目结构 (A4)、安全边界 (A5)、可观测性 (A6)。

## A1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HUMAN OPERATOR                               │
│                     Dashboard (Next.js :3000)                       │
│     Home · Cycles · Milestones · Rooms · Assets   🔔 Inbox  ⚙      │
└────────────────────────────┬────────────────────────────────────────┘
                             │ SSE (real-time)
                             │ REST API
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LAUNCHER SERVICE (Express :3001)                 │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  Job Queue   │  │   Spawner    │  │    Context Builder     │    │
│  │              │  │              │  │                        │    │
│  │ Poll 5s      │  │ Dispatch     │  │ Room-aware selection   │    │
│  │ Agent pool:3 │  │ Follow-up    │  │ Dual-repo spec merge  │    │
│  │ Infra pool:2 │  │ Retry logic  │  │ Quality feedback       │    │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬───────────┘    │
│         │                 │                        │                │
│  ┌──────▼─────────────────▼────────────────────────▼───────────┐   │
│  │                  Plan Validator                              │   │
│  │  Task count 3-7 · Cycle deps · Field check · .tscn mutex   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐      │
│  │  GitHub Svc  │  │  SSE Manager │  │  Orphan Recovery     │      │
│  │  PR/Branch   │  │  Broadcast   │  │  Startup cleanup     │      │
│  │  CI polling  │  │  Heartbeat   │  │  Label scan          │      │
│  └─────────────┘  └──────────────┘  └──────────────────────┘      │
└──────────┬─────────────────────────────────────┬────────────────────┘
           │ Docker API                          │ reads rooms/
           ▼                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DOCKER HOST                                   │
│                                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐  │
│  │ Orchestrator│ │   Coder     │ │   Tester    │ │  Reviewer   │  │
│  │ Plan JSON   │ │ GDScript    │ │ L2/L3/L4    │ │ 7-item      │  │
│  │ 3-7 tasks   │ │ L1 GUT     │ │ Quick-fail  │ │ checklist   │  │
│  │             │ │ Branch+PR   │ │ Fix tasks   │ │ Verdict     │  │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘  │
│  ┌─────────────┐ ┌─────────────┐                                   │
│  │ Integrator  │ │   Curator   │  godot-agent:4.6.1 image          │
│  │ Topo merge  │ │ Spec        │  Node 22 + Godot + Claude Code    │
│  │ Conflict    │ │ sediment    │  + gh CLI + GUT 9.x               │
│  └─────────────┘ └──────┬──────┘                                   │
└──────────────────────────┼──────────────────────────────────────────┘
                           │ writes new specs
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        PERSISTENCE LAYER                            │
│                                                                     │
│  ┌──────────────────────────────────────┐  ┌────────────────────┐  │
│  │           MongoDB :27017             │  │ GitHub (remote)    │  │
│  │                                      │  │                    │  │
│  │  ┌─ Execution ────────────────────┐  │  │ V1ctor2182/       │  │
│  │  │ cycles · tasks · agentruns     │  │  │ harness-system    │  │
│  │  │ agentevents · jobs             │  │  │  agents/          │  │
│  │  └────────────────────────────────┘  │  │  rooms/ (26)      │  │
│  │  ┌─ Feature Rooms (dual-repo) ────┐  │  │                    │  │
│  │  │                                │  │  │ V1ctor2182/       │  │
│  │  │  rooms collection (46 rooms)   │  │  │ zombie-farm-godot │  │
│  │  │  ┌─ harness: 26 rooms ──────┐ │  │  │  prd/             │  │
│  │  │  │ "怎么工作"               │ │  │  │  milestones/      │  │
│  │  │  │ 02-agent-system/         │ │  │  │  rooms/ (~20)     │  │
│  │  │  │   03-tester              │ │  │  │  zombie-farm/     │  │
│  │  │  │   08-spawner             │ │  │  │                    │  │
│  │  │  │ 03-job-queue             │ │  │  │ Coder pushes      │  │
│  │  │  │ 05-testing-pipeline      │ │  │  │ branches + PRs    │  │
│  │  │  └──────────────────────────┘ │  │  │                    │  │
│  │  │  ┌─ game: ~20 rooms ────────┐ │  │  │ Integrator merges │  │
│  │  │  │ "做什么"                 │ │  │  │ in topo order     │  │
│  │  │  │ 03-farm/                 │ │  │  │                    │  │
│  │  │  │   01-planting            │ │  │  │ Curator writes    │  │
│  │  │  │   02-grid                │ │  │  │ specs back to DB  │  │
│  │  │  │ 04-zombie/               │ │  │  │ + syncs to disk   │  │
│  │  │  │   01-growth              │ │  │  └────────────────────┘  │
│  │  │  │   03-mutation            │ │  │                          │
│  │  │  │ 05-combat/               │ │  │                          │
│  │  │  └──────────────────────────┘ │  │                          │
│  │  │                                │  │                          │
│  │  │  specs collection              │  │                          │
│  │  │  ┌──────────────────────────┐  │  │                          │
│  │  │  │ 7 types:                │  │  │                          │
│  │  │  │  intent · decision      │  │  │                          │
│  │  │  │  constraint · contract  │  │  │                          │
│  │  │  │  convention · change    │  │  │                          │
│  │  │  │  context                │  │  │                          │
│  │  │  │                        │  │  │                          │
│  │  │  │ Each spec has:         │  │  │                          │
│  │  │  │  roomId → Room         │  │  │                          │
│  │  │  │  state (draft/active)  │  │  │                          │
│  │  │  │  provenance + conf.    │  │  │                          │
│  │  │  │  qualityScore (-10~100)│  │  │                          │
│  │  │  │  anchors → code files  │  │  │                          │
│  │  │  └──────────────────────────┘  │  │                          │
│  │  └────────────────────────────────┘  │                          │
│  │                                      │                          │
│  │  ┌─ Testing ──┐  ┌─ Control ─────┐  │                          │
│  │  │ testresults│  │ controls      │  │                          │
│  │  │ screenshots│  │ counters      │  │                          │
│  │  └────────────┘  │ migrations    │  │                          │
│  │                   └───────────────┘  │                          │
│  └──────────────────────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────┘

  数据同步 (DB 为主 + Disk 镜像):

  Design Decision: DB 为主，Disk 是 DB 的自动投影
  ────────────────────────────────────────────────
  考虑过 disk 为主（rooms/*.yaml = source of truth, DB = cache），
  但 Curator 在 runtime 写新 specs 时需要双写（DB + disk），
  且 qualityScore 等 runtime 状态不好决定 sync 不 sync。
  改为 DB 为主后写入逻辑简单（只写 DB），disk 是 post-hook
  自动投影。灾难恢复时 disk yaml 也能完整重建 DB。

  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Source of Truth: MongoDB (rooms + specs collections)        │
  │  Disk Mirror:     rooms/*.yaml (DB 的自动投影, Git 版本化)   │
  │                                                              │
  │  ┌─ 冷启动 (首次) ──────────────────────────────────────┐   │
  │  │ rooms/ 目录有初始 yaml (人工 bootstrap)               │   │
  │  │ seedRooms() 读 disk → 写入 MongoDB                   │   │
  │  │   harness-system/rooms/ (26 rooms)                    │   │
  │  │   zombie-farm-godot/rooms/ (~20 rooms)                │   │
  │  │ 之后 DB 有数据 → seedRooms() 跳过已存在的             │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  │  ┌─ 灾难恢复 ──────────────────────────────────────────┐   │
  │  │ DB 挂了 → seedRooms() 从 disk yaml 重建全部数据      │   │
  │  │ (qualityScore 重置为 0，其他数据完整恢复)             │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  │  ┌─ Read Path ─────────────────────────────────────────┐   │
  │  │ Context Builder: 读 MongoDB (快速, 可排序/过滤)      │   │
  │  │ Dashboard:       读 MongoDB (REST API)              │   │
  │  │ Human review:    读 Git diff (disk yaml 变更)        │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  │  ┌─ Write Path ────────────────────────────────────────┐   │
  │  │                                                      │   │
  │  │ 所有写入只走 DB，disk sync 是 post-hook:             │   │
  │  │                                                      │   │
  │  │  Curator / Human / seedRooms()                       │   │
  │  │       │                                              │   │
  │  │       ▼                                              │   │
  │  │  POST /api/specs  或  POST /api/rooms                │   │
  │  │       │                                              │   │
  │  │       ├── 1. 写 MongoDB (立即生效)                   │   │
  │  │       │                                              │   │
  │  │       └── 2. post-hook: syncToDisk()                 │   │
  │  │              ├── 写 rooms/{room}/specs/*.yaml        │   │
  │  │              ├── 写 rooms/{room}/room.yaml           │   │
  │  │              └── regenerateTreeYaml()                │   │
  │  │                                                      │   │
  │  │  Integrator merge 时 disk 变更随 commit 进入 Git     │   │
  │  │  → 版本化，可 PR review，可 git blame 追溯           │   │
  │  │                                                      │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  │  ┌─ qualityScore ─────────────────────────────────────┐   │
  │  │ contextFeedback → 更新 DB spec.qualityScore         │   │
  │  │ 也 sync 回 disk (完全镜像)                          │   │
  │  │ 但不是实时 — 每 cycle 结束时 batch dump 一次         │   │
  │  │ (内容变更实时 sync，分数变更 batch sync)             │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  │  Disk 永远 = DB 快照:                                       │
  │  ┌──────────────────────────────────────────────────────┐   │
  │  │ 内容变更 (新 spec / 编辑 spec)  → 实时 sync to disk  │   │
  │  │ 状态变更 (qualityScore / state) → batch sync per cycle│   │
  │  │ 结构变更 (新 room / 移动 room)  → 实时 sync to disk  │   │
  │  └──────────────────────────────────────────────────────┘   │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  ┌─ 异常与边界情况 ──────────────────────────────────────────┐
  │                                                              │
  │ syncToDisk 失败:                                             │
  │  • DB 写入成功但 disk sync 失败 → disk 短暂 stale           │
  │  • 无自动重试 — 依赖下次写入时覆盖                           │
  │  • 灾难恢复: seedRooms() 从 disk 重建时 qualityScore 归零   │
  │                                                              │
  │ 不一致窗口:                                                   │
  │  • qualityScore batch sync → cycle 中间 disk score 是旧的   │
  │  • Integrator merge 时 Git 里的 yaml 可能 lag behind DB     │
  │  • 影响: human review Git diff 看到的分数不是最新的          │
  │                                                              │
  │ 反向同步 (disk → DB):                                        │
  │  • 人工改 room yaml → 需手动重启 server 触发 seedRooms()    │
  │  • seedRooms() 只 upsert 不存在的 — 不会覆盖已有数据        │
  │  • 要强制同步: 需删除 DB 对应文档后重启                      │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘

  Design Decision: MongoDB Standalone (无 Replica Set)
  ────────────────────────────────────────────────────
  当前选择 standalone 原因: single-developer、低成本、简单运维。
  风险: DB 挂了 → qualityScore 全部归零 (disk yaml 不含实时分数)。
  升级路径: replica set (1P+1S+1A) 或迁移到 SQLite/Turso。
```

### A2. Feature Rooms 如何融入每个阶段

```
  ┌─────────────────────────────────────────────────────────────┐
  │      FEATURE ROOMS × CYCLE — 每个阶段怎么用 Rooms           │
  └─────────────────────────────────────────────────────────────┘

  ══ PLAN 阶段 ════════════════════════════════════════════════

  Orchestrator 读取 Rooms 来规划任务:

  ┌──────────────────┐     ┌─────────────────────────────────┐
  │ Orchestrator     │     │  Context Builder 注入:          │
  │                  │◄────│                                 │
  │ "M8 目标:        │     │  From game rooms:               │
  │  实现突变系统"    │     │    04-03-mutation/              │
  │                  │     │      intent: "突变+进化系统"     │
  │ 输出:            │     │      constraint: "概率≤15%"     │
  │ Task 1: 突变数据 │     │    04-01-growth/                │
  │ Task 2: 突变 UI  │     │      decision: "用 Resource"    │
  │ Task 3: 测试     │     │                                 │
  └──────────────────┘     │  From harness rooms:            │
                           │    02-01-orchestrator/           │
                           │      constraint: "3-7 tasks"    │
                           │      constraint: "min overlap"  │
                           └─────────────────────────────────┘

  ══ IMPLEMENT 阶段 ═══════════════════════════════════════════

  Coder 读取 Room specs 来写代码:

  ┌──────────────────┐     ┌─────────────────────────────────┐
  │ Coder            │     │  Context Builder 注入:          │
  │                  │◄────│                                 │
  │ Task: "突变数据  │     │  From game rooms:               │
  │  模型和公式"     │     │    04-03-mutation/              │
  │                  │     │      constraint: "概率≤15%"     │
  │ 写 GDScript:     │     │      constraint: "催化剂消耗"   │
  │  mutation.gd     │     │    04-zombie/ (inherited)       │
  │  mutation_data/  │     │      convention: "type enum"    │
  │                  │     │    00-project/ (inherited)      │
  │ 写 GUT test:     │     │      convention: ":= 静态类型" │
  │  test_mutation   │     │      convention: "signal 规范"  │
  │                  │     │                                 │
  │ 输出: PR #42     │     │  From harness rooms:            │
  └──────────────────┘     │    02-02-coder/                 │
                           │      convention: "PR body JSON" │
                           │      constraint: "L1 必须过"    │
                           └─────────────────────────────────┘

  ══ TEST 阶段 ════════════════════════════════════════════════

  Tester 用 Room constraints 验证正确性:

  ┌──────────────────┐     ┌─────────────────────────────────┐
  │ Tester           │     │  Context Builder 注入:          │
  │                  │◄────│                                 │
  │ L2: 集成测试     │     │  From game rooms:               │
  │   突变后 zombie  │     │    04-03-mutation/              │
  │   属性正确?      │     │      constraint: "概率≤15%"     │
  │                  │     │      constraint: "突变不改 tier" │
  │ L4: PRD 合规     │     │    00-project/                  │
  │   概率公式匹配   │     │      context: "PRD 03b 公式"    │
  │   PRD 03b?       │     │                                 │
  │                  │     │  From harness rooms:            │
  │ 输出:            │     │    02-03-tester/                │
  │   TestResult     │     │      constraint: "quick-fail"   │
  │   4 passed       │     │      constraint: "GUT 3min"     │
  └──────────────────┘     └─────────────────────────────────┘

  ══ REVIEW 阶段 ══════════════════════════════════════════════

  Reviewer 用 Room specs 作为评审标准:

  ┌──────────────────┐     ┌─────────────────────────────────┐
  │ Reviewer         │     │  Context Builder 注入:          │
  │                  │◄────│                                 │
  │ PR #42 审查:     │     │  From game rooms:               │
  │                  │     │    04-03-mutation/              │
  │ ✓ constraint:    │     │      所有 constraints           │
  │   概率≤15% 满足  │     │      所有 decisions             │
  │ ✓ convention:    │     │                                 │
  │   静态类型 OK    │     │  From harness rooms:            │
  │ ✗ decision:      │     │    02-04-reviewer/              │
  │   应该用 Resource│     │      convention: "7-item check" │
  │   而非 Dictionary│     │      constraint: "severity分级" │
  │                  │     └─────────────────────────────────┘
  │ Verdict:         │
  │   changes-req    │
  │   severity: major│
  └──────────────────┘

  ══ INTEGRATE 阶段 ═══════════════════════════════════════════

  Integrator 检查 Room ownership 避免冲突:

  ┌──────────────────┐     ┌─────────────────────────────────┐
  │ Integrator       │     │  Context Builder 注入:          │
  │                  │◄────│                                 │
  │ 合并 PR #42 #43  │     │  From harness rooms:            │
  │                  │     │    02-05-integrator/             │
  │ _tree.yaml 检查: │     │      constraint: "topo排序合并" │
  │  mutation.gd     │     │      constraint: ".tscn特殊处理"│
  │  属于 04-03 Room │     │      decision: "conflict→requeue│
  │  无其他 PR 改它  │     │       不是 failure"             │
  │  → 安全合并      │     │                                 │
  └──────────────────┘     └─────────────────────────────────┘

  ══ RETROSPECT 阶段 ══════════════════════════════════════════

  Curator 从 PR diffs 提取知识，写回 Rooms:

  ┌──────────────────┐     ┌─────────────────────────────────┐
  │ Curator          │     │  读取本 cycle 所有 merged PRs   │
  │                  │◄────│  PR #42: mutation.gd            │
  │ 提取 sediment:   │     │  PR #43: mutation_ui.tscn       │
  │                  │     └─────────────────────────────────┘
  │ decision:        │
  │   "突变用 Resource│     写回 Feature Rooms:
  │    不用 Dict,    │     ┌─────────────────────────────────┐
  │    因为需要序列化"│────►│  POST /api/specs               │
  │   conf: 0.85     │     │  roomId: "04-03-mutation"       │
  │   cycle: M8-C1   │     │  type: decision                 │
  │                  │     │  state: active (conf≥0.75)      │
  │ constraint:      │     │  provenance:                    │
  │   "突变后 zombie │────►│    source_type: agent_sediment  │
  │    保留原始 tier" │     │    cycle_tag: "M8-C1"          │
  │   conf: 0.78     │     │    agentRunId: "curator-xyz"    │
  │                  │     │  anchors:                       │
  │ context:         │     │    file: scripts/mutation.gd    │
  │   "Godot Resource│────►│                                 │
  │    save 有 bug,  │     │  下一个 cycle 的 Coder/Tester   │
  │    需要 flush"   │     │  会自动收到这些新 specs          │
  │   conf: 0.60     │     └─────────────────────────────────┘
  │   → state: draft │
  │     (需人工确认)  │
  └──────────────────┘

  ══ 完整循环 ═════════════════════════════════════════════════

  Cycle N                              Cycle N+1
  ┌──────┐                            ┌──────┐
  │ Plan │ ← 读 Room specs            │ Plan │ ← 读 Room specs
  │      │                            │      │   (含 Cycle N 新增的
  │Imple.│ ← 读 Room constraints      │      │    decisions/constraints)
  │      │                            │Imple.│
  │ Test │ ← 读 Room constraints      │      │
  │      │   验证 PRD compliance      │ Test │
  │Review│ ← 读 Room decisions        │      │
  │      │   检查是否违反已有决策      │Review│
  │Integ.│                            │      │
  │      │                            │Integ.│
  │Retro.│ → 写 新 specs 到 Rooms ────┼──►   │
  └──────┘                            └──────┘
                                        知识在 cycles 间
                                        持续积累和演化
```


## A3. 数据流

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  DATA FLOW OVERVIEW                          │
  └─────────────────────────────────────────────────────────────┘

  Game Repo (zombie-farm-godot)            Harness Repo
  ┌───────────────────────────┐           ┌──────────────────────────┐
  │ prd/  (21 模块化文档)      │           │ agents/*.md → 系统提示词  │
  │ milestones/ (M0-M15)      │           │ rooms/00-project-room/ → 全局 specs (继承给所有子 Room) │
  │ zombie-farm/               │           │                          │
  │   scenes/ scripts/ tests/  │           │ rooms/ (harness rooms)   │
  │                            │           │ 26 rooms — 管线自身的    │
  │ rooms/ (game rooms)        │           │ constraints/decisions    │
  │ ~20 rooms — 游戏逻辑的    │           │ "怎么工作"               │
  │ constraints/decisions      │           │ (PR格式, 测试超时,       │
  │ "做什么"                   │           │  container规则...)        │
  │ (基因数量, 战斗公式,       │           └─────────────┬────────────┘
  │  FPS阈值, 资源平衡...)     │                         │
  └─────────────┬──────────────┘                         │
                │                                        │
                │◄───── Coder pushes branches + PRs      │
                │                                        │
                └──────────────┬─────────────────────────┘
                               │ Context Builder
                               │ 合并两套 rooms
                               ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                        MongoDB                               │
  │                                                             │
  │  ┌─ Execution ────────────────────────────────────────────┐ │
  │  │ cycles ◄──► tasks ◄──► agentruns ──► agentevents      │ │
  │  │                                         │              │ │
  │  │ jobs ◄──────────────────────────────────┘              │ │
  │  └────────────────────────────────────────────────────────┘ │
  │                                              │ SSE          │
  │  ┌─ Knowledge ────────────────────────┐      ▼              │
  │  │ rooms (harness + game)             │   Dashboard         │
  │  │   ├── 26 harness rooms             │                     │
  │  │   └── ~20 game rooms               │                     │
  │  │ specs (typed, with provenance)     │                     │
  │  │   ├── constraints, decisions...    │                     │
  │  │   └── qualityScore feedback loop   │                     │
  │  └────────────────────────────────────┘                     │
  │                                                             │
  │  ┌─ Testing ──────────────┐  ┌─ Control ──────────────┐    │
  │  │ testresults            │  │ controls (singleton)    │    │
  │  │ screenshots            │  │ mode, spending, auto-   │    │
  │  └────────────────────────┘  │ approval categories    │    │
  │                              └────────────────────────┘    │
  └─────────────────────────────────────────────────────────────┘

  知识流向:

  Game Rooms                   Harness Rooms
  (zombie-farm-godot/rooms/)   (harness-system/rooms/)
         │                            │
         │  seedRooms()               │  seedRooms()
         ▼                            ▼
  ┌──────────────────────────────────────────┐
  │  MongoDB: rooms + specs collections       │
  │                                          │
  │  Context Builder 合并:                    │
  │  ┌────────────────────────────────────┐  │
  │  │ Task "implement zombie growth"     │  │
  │  │                                    │  │
  │  │ From game rooms:                   │  │
  │  │   04-01-growth constraints         │  │
  │  │   04-zombie conventions            │  │
  │  │   00-project GDScript 约定         │  │
  │  │                                    │  │
  │  │ From harness rooms:                │  │
  │  │   02-02-coder conventions          │  │
  │  │   00-project-room constraints      │  │
  │  └────────────────────────────────────┘  │
  │              │                            │
  │              ▼                            │
  │  inject → Agent Container                 │
  │              │                            │
  │              ▼                            │
  │  Curator extracts sediment → new specs    │
  │  → writes back to game or harness rooms   │
  └──────────────────────────────────────────┘
```

## A4. 项目结构（双 Repo）

两个 repo 各有自己的 Feature Rooms，通过 MongoDB 统一管理：

```
godot-self-evolve-implementation-system/
├── harness-system/                ★ 管线 repo (V1ctor2182/harness-system)
│   │                              告诉 agents "怎么工作"
│   ├── apps/
│   │   ├── server/                    Express 后端
│   │   │   ├── src/
│   │   │   │   ├── config.ts          环境变量 + defaults
│   │   │   │   ├── index.ts           入口 (migrations → seed → poll)
│   │   │   │   ├── models/            13 Mongoose models (含 Room + Spec)
│   │   │   │   ├── routes/            REST API (含 /api/rooms, /api/specs)
│   │   │   │   ├── lib/
│   │   │   │   │   └── seed-rooms.ts      rooms/ 目录 → DB (两个 repo)
│   │   │   │   ├── services/
│   │   │   │   │   ├── job-queue.ts   Polling scheduler + handlers
│   │   │   │   │   ├── github.ts      PR/Branch/CI integration
│   │   │   │   │   ├── sse-manager.ts SSE broadcast
│   │   │   │   │   └── launcher/
│   │   │   │   │       ├── spawner.ts      Agent dispatch + output parsing
│   │   │   │   │       ├── container.ts    Docker 9-step lifecycle
│   │   │   │   │       ├── context-builder.ts  Room-aware 知识选择
│   │   │   │   │       ├── plan-validator.ts   Plan constraint checks
│   │   │   │   │       ├── stream-capture.ts   NDJSON parsing
│   │   │   │   │       └── orphan-recovery.ts  Startup cleanup
│   │   │   │   └── migrations/        Schema migration scripts
│   │   │   └── tests/                 Vitest test files
│   │   │
│   │   └── dashboard/                 Next.js 前端
│   │       └── src/app/
│   │           ├── page.tsx           Home (system status)
│   │           ├── cycles/            Cycle 列表 + 详情
│   │           ├── tasks/             Task 列表 + 详情
│   │           ├── agents/            Agent runs + live stream
│   │           ├── tests/             Test results
│   │           ├── milestones/        M0-M15 tracking
│   │           ├── assets/            Godot asset inventory
│   │           ├── rooms/             Feature Room 树形浏览 (新增)
│   │           ├── jobs/              Queue + approval UI
│   │           ├── review/            Human review panel
│   │           ├── analytics/         Metrics + charts
│   │           └── control/           System mode + spending
│   │
│   ├── packages/
│   │   └── shared/                    共享代码
│   │       └── src/
│   │           ├── constants.ts       Timeouts, slots, paths, versions
│   │           └── types.ts           AgentRole, JobType, Room, Spec types
│   │
│   ├── agents/                        6 Agent system prompts
│   │   ├── orchestrator.md
│   │   ├── coder.md
│   │   ├── tester.md
│   │   ├── reviewer.md
│   │   ├── integrator.md
│   │   └── curator.md
│   │
│   │                                  (boot.md, conventions.md, glossary.md
│   │                                   已迁入 rooms/00-project-room/specs/)
│   │
│   ├── rooms/                         ★ Harness Feature Rooms (26 rooms)
│   │   │                              管线自身的 constraints/decisions
│   │   ├── 00-project-room/
│   │   │   └── _tree.yaml             唯一索引
│   │   ├── 01-cycle-engine/           Cycle 状态机, phase 流转
│   │   ├── 02-agent-system/           6 agents + container + spawner + stream
│   │   │   ├── 01-orchestrator/
│   │   │   ├── 02-coder/
│   │   │   ├── 03-tester/
│   │   │   ├── ...
│   │   │   └── 09-stream-capture/
│   │   ├── 03-job-queue/              Polling scheduler, approval gates
│   │   ├── 04-knowledge-system/       Context builder, curation
│   │   ├── 05-testing-pipeline/       L1-L4 test layers
│   │   ├── 06-plan-validation/        Plan constraint checks
│   │   ├── 07-dashboard/              UI: live-stream, review, analytics
│   │   ├── 08-infrastructure/         Docker, CI/CD, GitHub
│   │   ├── 09-spending/               Cost tracking, circuit breaker
│   │   ├── 10-game-rooms/             Meta: game knowledge management
│   │   └── 11-data-layer/             MongoDB schemas, migrations
│   │
│   ├── docker/
│   │   └── agent/
│   │       ├── Dockerfile             godot-agent:4.6.1 image
│   │       ├── entrypoint.sh          Clone → import → rate check → claude
│   │       └── tools/                 gen_pr_body.py, validate_pr_body.py
│   │
│   ├── basic-doc/                     PRD + Tech Design (本文档)
│   ├── docker-compose.yml             MongoDB + Server + Dashboard + Reloader
│   ├── .github/workflows/ci.yml       TypeScript CI
│   └── CLAUDE.md                      Agent conventions
│
└── game/                          ★ 游戏 repo (V1ctor2182/zombie-farm-godot)
    │                              告诉 agents "做什么"
    ├── prd/                           21 模块化 PRD 文档
    │   ├── 00-core-concept.md         五大设计原则
    │   ├── 03-zombie-growth.md        种植 + 隐藏基因 + 杂交
    │   ├── 05-combat.md               自动战斗 + 难度曲线
    │   ├── 13-wuxing-cultivation.md   五行修炼 + 15 法术
    │   └── ... (21 files)
    │
    ├── milestones/                    M0-M15 里程碑规格
    │   ├── README-里程碑总览.md        总览 (M0-M7 ✅, M8 🔄)
    │   ├── M00-movement-farm.md
    │   ├── M01-core-planting.md
    │   └── ... (16 files)
    │
    ├── rooms/                         ★ Game Feature Rooms (~20 rooms)
    │   │                              游戏逻辑的 constraints/decisions
    │   ├── 00-project-room/
    │   │   └── _tree.yaml             GDScript 约定, Godot 约束, 资源规范
    │   ├── 01-core-systems/           场景管理, 存档, 事件总线
    │   ├── 02-player/                 移动, 等级, 技能树
    │   ├── 03-farm/                   种植, Grid, 建筑, 收获
    │   ├── 04-zombie/                 成长, 种族, 突变, AI, 衰老
    │   ├── 05-combat/                 自动战斗, 难度, 防御
    │   ├── 06-economy/                资源, 交易
    │   ├── 07-world/                  日夜, 探索, NPC
    │   ├── 08-wuxing/                 五行修炼系统
    │   ├── 09-ui/                     HUD, 菜单, 新手引导
    │   └── 10-art-audio/              美术音效标准
    │
    └── zombie-farm/                   Godot 4.6.1 项目
        ├── project.godot
        ├── scenes/
        ├── scripts/
        ├── assets/
        ├── data/
        └── tests/
```

  双 Repo Room ID 命名规则:
  ┌──────────────────────────────────────────────────────────────┐
  │ Harness rooms: 00-xx, 01-xx, 02-xx, ... 11-xx               │
  │ Game rooms:    00-xx (shared project), 01-xx ... 10-xx       │
  │ 区分: seedRooms() 时通过 repo 字段标记来源                   │
  │                                                              │
  │ 冲突防范: 无自动 enforce — 靠命名约定 + code review          │
  │ Seed 时机: server 启动时 seedRooms() 扫描两个 repo          │
  │ 人工改 game yaml: 需重启 server 触发 re-seed                │
  └──────────────────────────────────────────────────────────────┘


## A5. 安全边界

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    TRUST BOUNDARIES                          │
  └─────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────┐
  │  TRUST ZONE: Human Operator                │
  │  - Dashboard access                        │
  │  - Approve/reject jobs                     │
  │  - Control system mode                     │
  │  - Protected path modifications            │
  └──────────────────┬─────────────────────────┘
                     │ approval gate
                     ▼
  ┌────────────────────────────────────────────┐
  │  TRUST ZONE: Launcher Service              │
  │  - Deterministic infrastructure code       │
  │  - Plan validation                         │
  │  - Job scheduling                          │
  │  - No LLM — all logic is explicit          │
  └──────────────────┬─────────────────────────┘
                     │ Docker API
                     ▼
  ┌────────────────────────────────────────────┐
  │  TRUST ZONE: Agent Container (isolated)    │
  │  ┌──────────────────────────────────────┐  │
  │  │ Full privileges INSIDE container:    │  │
  │  │ - File I/O, bash, git, network      │  │
  │  │ - No capability restrictions         │  │
  │  │ - Guardrails = process, not perms    │  │
  │  └──────────────────────────────────────┘  │
  │  Container = security boundary             │
  │  Memory cap: 4-8 GB                        │
  │  CPU cap: 1 core                           │
  │  Budget cap: $5/run                        │
  └────────────────────────────────────────────┘
```

### A5.1 当前安全约束

```
  已实施的安全措施:
  ┌──────────────────────────────────────────────────────────────┐
  │ 资源隔离                                                      │
  │  • 容器 Memory cap: 2-4 GB (constants.ts)                    │
  │  • 容器 CPU cap: 1 core                                      │
  │  • 容器用完即销毁 (container.remove force: true)              │
  │  • 容器 labels 用于 orphan tracking                          │
  │                                                              │
  │ 预算控制                                                      │
  │  • Per-run budget: $5 default                                │
  │  • Global spending cap (可配置)                               │
  │  • 80% 阈值 → 自动暂停 + SSE warning                        │
  │  • 100% 阈值 → hard block                                   │
  │                                                              │
  │ 人工审批                                                      │
  │  • Protected paths 修改需审批:                                │
  │    agents/, prd/, rooms/00-project-room/, docker/,           │
  │    rooms/_tree.yaml, project.godot, export_presets.cfg       │
  │  • 失败后 next-cycle 需人工审批                               │
  │                                                              │
  │ 网络绑定                                                      │
  │  • Server 绑定 127.0.0.1 only (docker-compose.yml)           │
  │  • Dashboard 绑定 127.0.0.1 only                             │
  │  • 外部不可访问 API                                           │
  │                                                              │
  │ 输入校验                                                      │
  │  • Zod schema 校验 control/jobs/knowledge 路由               │
  └──────────────────────────────────────────────────────────────┘
```

```
  资源限制 Rationale:
  ┌──────────────────────────────────────────────────────────────┐
  │ Memory 2 GB default / 4 GB max:                              │
  │  经验值。Claude Code CLI ~500MB + Godot headless import      │
  │  ~300MB + git clone ~200MB + 工作区余量。                     │
  │  4 GB 在 amd64 emulation (ARM Mac) 下偶尔需要。              │
  │  16 GB 宿主机跑 2 agent = 4 GB，加 MongoDB/Server 约 5 GB，  │
  │  Docker 分配 8 GB 即可。                                     │
  │                                                              │
  │ CPU 1 core:                                                  │
  │  防止 agent 容器抢占宿主机资源。Godot headless import 是      │
  │  CPU 密集的唯一阶段，单核足够。LLM 调用是 I/O bound。        │
  │                                                              │
  │ $5/run budget:                                               │
  │  经验值。大多数 agent run 花费 $0.50-$2.00。$5 给足够余量     │
  │  处理复杂任务 + retry。15 个 run 的级联故障 ≈ $75，          │
  │  global spending cap 是最终安全网。                           │
  │                                                              │
  │ Poll interval 5s:                                            │
  │  平衡响应速度和 MongoDB 查询负载。Agent run 本身 5-30 分钟，  │
  │  5s 延迟可忽略。                                              │
  │                                                              │
  │ Role timeouts (Orchestrator 10m, Coder 15m, ...):            │
  │  基于观察的 P95 执行时间 + buffer。Coder 15m 含 amd64         │
  │  emulation overhead。Integrator 10-30m 动态 (base + test数)。│
  │                                                              │
  │ qualityScore 范围 [-10, 100]:                                │
  │  -10 触发 archived — 约需 7 次连续 "unnecessary" 反馈。      │
  │  100 为理论上限。0 是新 spec 起点。                           │
  │  decay 0.95 使长期不被引用的 spec 缓慢衰减。                 │
  └──────────────────────────────────────────────────────────────┘
```

### A5.2 已知安全 Gap

```
  未实施 — 需在文档中 acknowledge:
  ┌──────────────────────────────────────────────────────────────┐
  │ 容器权限                                                      │
  │  ✗ 无 Docker capability 限制 (无 CapDrop)                    │
  │  ✗ 容器内可发任意 HTTP 请求                                   │
  │  ✗ 容器内可读任意文件、执行任意 git 操作                      │
  │  ✗ 容器无网络隔离 (可访问任意外部地址)                        │
  │                                                              │
  │ 认证与授权                                                    │
  │  ✗ API 无 authentication — 所有端点公开                      │
  │  ✗ Dashboard 无 login                                        │
  │  ✗ 无 RBAC                                                   │
  │                                                              │
  │ Secret 管理                                                   │
  │  ✗ Token 通过环境变量注入，无 scope 限制                     │
  │  ✗ 无 secret rotation 策略                                   │
  │  ✗ Agent 获得完整 CLAUDE_CODE_OAUTH_TOKEN 和 GH_TOKEN       │
  └──────────────────────────────────────────────────────────────┘
```

### A5.3 风险评估（Single-Developer 场景）

```
  ┌──────────────────────────────────────────────────────────────┐
  │ 风险可接受（当前场景）:                                        │
  │  • API 无 auth — localhost-only 绑定降低风险                  │
  │  • Dashboard 无 login — 同上                                  │
  │  • 无 RBAC — 只有一个操作者                                   │
  │                                                              │
  │ 应优先修复:                                                    │
  │  P1: 容器网络隔离 — 限制 egress 到 GitHub + Anthropic API    │
  │  P1: control endpoint Bearer token — 防止意外状态变更         │
  │  P2: Docker CapDrop — 最小权限原则                           │
  │  P2: Secret scope — 限制 GH_TOKEN 权限到最小                 │
  │                                                              │
  │ 多用户场景升级路径:                                            │
  │  • 增加 API Bearer token auth                                │
  │  • Dashboard 接入 OAuth (GitHub)                             │
  │  • 基于 role 的端点权限                                       │
  │  • Container 用 Docker secret 替代环境变量                   │
  └──────────────────────────────────────────────────────────────┘
```

## A6. 可观测性

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    OBSERVABILITY                              │
  └─────────────────────────────────────────────────────────────┘

  健康检查:
  ┌──────────────────────────────────────────────────────────────┐
  │ GET /api/health                                              │
  │  检查: MongoDB 连接 + Docker daemon + startupReady           │
  │  返回: { status, uptime, startupReady, checks, lastRecovery }│
  │  startupReady=false → 系统恢复中，不接受新 cycle             │
  │  HTTP 200 = ok, 503 = degraded 或 recovering                │
  └──────────────────────────────────────────────────────────────┘

  日志:
  ┌──────────────────────────────────────────────────────────────┐
  │ Structured logging (Pino)                                    │
  │  • 级别: configurable via LOG_LEVEL env var                  │
  │  • HTTP: pino-http middleware 记录所有请求                    │
  │  • Retention: AgentEvent TTL 30 天自动清理                   │
  └──────────────────────────────────────────────────────────────┘

  实时监控:
  ┌──────────────────────────────────────────────────────────────┐
  │ SSE 全局事件:                                                 │
  │  agent:started, agent:completed, cycle:completed,            │
  │  task:status_changed, job:requires_approval,                 │
  │  system:spending_warning                                     │
  │                                                              │
  │ Dashboard 展示: Cycles / Tasks / Agents / Jobs 实时状态       │
  └──────────────────────────────────────────────────────────────┘

  分析指标:
  ┌──────────────────────────────────────────────────────────────┐
  │ GET /api/analytics/spending       Spending by cycle/role     │
  │ GET /api/analytics/tasks          Task 成功率 + retry 率     │
  │ GET /api/analytics/review-quality Review retry rates         │
  │ GET /api/status                   Uptime, memory, 活跃 agent │
  └──────────────────────────────────────────────────────────────┘

  当前缺失:
  ┌──────────────────────────────────────────────────────────────┐
  │  ✗ Alerting (无 Slack/email/webhook 通知)                    │
  │  ✗ Distributed tracing (无 correlation ID 跨 agent 追踪)    │
  │  ✗ Metrics export (无 Prometheus/Grafana 集成)               │
  │  ✗ Knowledge quality degradation 告警                        │
  └──────────────────────────────────────────────────────────────┘
```



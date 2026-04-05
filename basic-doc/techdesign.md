# Zombie Farm AI Harness — Tech Design

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HUMAN OPERATOR                               │
│                     Dashboard (Next.js :3000)                       │
│     Cycles · Tasks · Agents · Tests · Rooms · Review · Control      │
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
│  │                                      │  │  knowledge/       │  │
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
```

### 1.1 Feature Rooms 如何融入每个阶段

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

## 2. Cycle 状态机

```
                    ┌─────────────────────────────────────────┐
                    │              CYCLE LIFECYCLE             │
                    └─────────────────────────────────────────┘

     ┌────────┐  spawn     ┌───────────┐  apply-plan   ┌────────────┐
     │  PLAN  │──────────►│ Orchestr. │─────────────►│ IMPLEMENT  │
     └────────┘  orchestr. └───────────┘  3-7 tasks    └─────┬──────┘
                                                              │
                    ┌─────────────────────────────────────────┘
                    │  spawn coder per task (parallel)
                    ▼
     ┌──────────────────┐     PR created      ┌────────────────┐
     │  Coder (×N)      │───────────────────►│    REVIEW       │
     │  branch per task │                     │                 │
     └──────────────────┘                     └───┬─────────┬───┘
                                                  │         │
                                    ┌─────────────┘         │
                                    ▼                       ▼
                              ┌──────────┐          ┌────────────┐
                              │  Tester  │          │  wait-ci   │
                              │  L2-L4   │          │  (GitHub   │
                              └────┬─────┘          │   Actions) │
                                   │                └──────┬─────┘
                                   │  pass                 │ pass
                                   ▼                       ▼
                              ┌──────────┐          ┌────────────┐
                              │ Reviewer │          │  Human     │
                              │ 7-item   │          │  Gate      │
                              └────┬─────┘          └──────┬─────┘
                                   │                       │
                     ┌─────────────┴───────────────────────┘
                     │  all approved
                     ▼
              ┌─────────────┐  merge PRs    ┌──────────────┐
              │  INTEGRATE  │──────────────►│  Integrator  │
              └─────────────┘  topo order   └──────┬───────┘
                                                   │
                    ┌──────────────────────────────┘
                    ▼
              ┌──────────────┐  curate     ┌──────────────┐
              │  RETROSPECT  │────────────►│   Curator    │
              └──────┬───────┘  inbox      └──────────────┘
                     │
                     ▼
              ┌──────────────┐
              │  COMPLETED   │──► next-cycle job (auto or human-gated)
              └──────────────┘

     ──── FAILURE PATH ────

     All tasks failed in review?
         │
         ▼
     cycle.status = 'failed'
     No Integrator spawned
     next-cycle job with requiresApproval: true
```

## 3. Container 生命周期（9 步）

```
  ┌─────────────────────────────────────────────────────────────┐
  │                CONTAINER LIFECYCLE (9 Steps)                 │
  └─────────────────────────────────────────────────────────────┘

  Step 1: PREPARE
  ┌─────────────────────────────────┐
  │ Context Builder assembles:      │
  │ - System prompt (.md)           │
  │ - Task prompt (.md)             │
  │ - Knowledge files (ranked)      │
  │ - Retry context (if retry)      │
  └──────────────┬──────────────────┘
                 ▼
  Step 2: CREATE
  ┌─────────────────────────────────┐
  │ docker.createContainer({        │
  │   Image: 'godot-agent:4.6.1',  │
  │   Env: [TASK_ID, CYCLE_ID,     │
  │         GITHUB_TOKEN, ...],     │
  │   Labels: {zombie-farm: agent}, │
  │   Memory: 4GB, CPU: 1          │
  │ })                              │
  └──────────────┬──────────────────┘
                 ▼
  Step 3: INJECT
  ┌─────────────────────────────────┐
  │ putArchive → /home/agent/ctx/   │
  │   system-prompt.md              │
  │   task-prompt.md                │
  │   append-prompt.md              │
  │   knowledge/*.md                │
  └──────────────┬──────────────────┘
                 ▼
  Step 4: ATTACH ──► Step 5: START
  ┌──────────────┐   ┌──────────────┐
  │ stdout stream│   │ container    │
  │ (zero-delay) │   │ .start()     │
  └──────┬───────┘   └──────┬───────┘
         │                  │
         └────────┬─────────┘
                  ▼
  Step 6: STREAM
  ┌─────────────────────────────────┐
  │ entrypoint.sh:                  │
  │   1. git clone repo             │
  │   2. checkout TASK_BRANCH       │
  │   3. godot --headless --import  │
  │   4. rate limit pre-flight      │
  │   5. claude --output stream-json│
  │                                 │
  │ Backend parses NDJSON:          │
  │   → Persist AgentEvents         │
  │   → SSE broadcast deltas        │
  │   → Detect rateLimited          │
  └──────────────┬──────────────────┘
                 ▼
  Step 7: WAIT
  ┌─────────────────────────────────┐
  │ Role-based timeout:             │
  │   Orchestrator: 10 min          │
  │   Coder:        15 min          │
  │   Tester:       10 min          │
  │   Reviewer:      5 min          │
  │   Integrator:   10-30 min       │
  │   Curator:       5 min          │
  └──────────────┬──────────────────┘
                 ▼
  Step 8: COLLECT
  ┌─────────────────────────────────┐
  │ Parse completion event:         │
  │   - costUsd, tokens, duration   │
  │   - Structured output (plan,    │
  │     PR body, test results...)   │
  │   - Exit code (137 = OOM)       │
  │ Update AgentRun + Task          │
  │ Create follow-up jobs           │
  └──────────────┬──────────────────┘
                 ▼
  Step 9: CLEANUP
  ┌─────────────────────────────────┐
  │ container.remove({ force: true})│
  └─────────────────────────────────┘
```

## 4. Job Queue 架构

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    JOB QUEUE (Polling)                       │
  │                    Poll interval: 5s                         │
  └─────────────────────────────────────────────────────────────┘

  ┌───────────────────────┐    ┌───────────────────────┐
  │    AGENT POOL (3)     │    │    INFRA POOL (2)     │
  │                       │    │                       │
  │  spawn (coder/tester/ │    │  wait-for-ci          │
  │    reviewer/orchestr/ │    │  apply-plan           │
  │    integrator/curator)│    │  advance-cycle        │
  │  spawn-tester         │    │  next-cycle           │
  │  curate-inbox         │    │  reload               │
  │                       │    │  cleanup-prs          │
  │                       │    │  run-gut-tests        │
  │                       │    │  run-integration-tests│
  │                       │    │  run-visual-tests     │
  │                       │    │  run-prd-compliance   │
  │                       │    │  create-fix-task      │
  │                       │    │  validate-assets      │
  └───────────┬───────────┘    └───────────┬───────────┘
              │                            │
              ▼                            ▼
  ┌─────────────────────────────────────────────────────────────┐
  │                    APPROVAL GATE                             │
  │                                                             │
  │  requiresApproval: true?                                    │
  │    ├── YES → hold until human approves via Dashboard        │
  │    └── NO  → check autoApprovalCategories + protected paths │
  │                                                             │
  │  Protected paths → ALWAYS require approval:                 │
  │    agents/, prd/, knowledge/boot.md, docker/,               │
  │    rooms/_tree.yaml, project.godot, export_presets.cfg       │
  └─────────────────────────────────────────────────────────────┘

  Job Status Flow:
  pending ──► active ──► completed
                    └──► failed (+ retry if retryCount < maxRetries)
```

## 5. 数据流

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  DATA FLOW OVERVIEW                          │
  └─────────────────────────────────────────────────────────────┘

  Game Repo (zombie-farm-godot)            Harness Repo
  ┌───────────────────────────┐           ┌──────────────────────────┐
  │ prd/  (21 模块化文档)      │           │ agents/*.md → 系统提示词  │
  │ milestones/ (M0-M15)      │           │ knowledge/*.md → 引导知识 │
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
  │  │ knowledgefiles (legacy, 逐步迁移)  │                     │
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

## 6. 测试管线流程

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  TEST PIPELINE (Quick-Fail)                  │
  └─────────────────────────────────────────────────────────────┘

  Coder completes PR
         │
         ▼
  ┌──────────────────┐
  │   L1: GUT Unit   │  godot --headless -s gut_cmdline.gd
  │   (Coder, 3min)  │  tests/unit/
  └────────┬─────────┘
           │
     ┌─────┴──────┐
     │ PASS?      │
     │  NO ──────►│ STOP. Task marked failed.
     │  YES       │
     └─────┬──────┘
           │
     ┌─────┴──────────────────────┐
     │                            │
     ▼                            ▼
  ┌──────────────────┐    ┌──────────────────┐
  │   L2: Integration │    │   L4: PRD        │
  │   (Tester, 2min)  │    │   Compliance     │
  │   headless +       │    │   formula check  │
  │   node tree snap   │    │   (parallel)     │
  └────────┬───────────┘    └────────┬─────────┘
           │                         │
     ┌─────┴──────┐                  │
     │ PASS?      │                  │
     │  NO ──────►│ Create fix task  │
     │  YES       │                  │
     └─────┬──────┘                  │
           │                         │
           ▼                         │
  ┌──────────────────┐               │
  │   L3: Visual     │               │
  │   (Tester, 5min) │               │
  │   screenshots +  │               │
  │   AI analysis    │               │
  └────────┬─────────┘               │
           │                         │
           └────────────┬────────────┘
                        ▼
                 ┌──────────────┐
                 │  TestResult  │──► MongoDB
                 │  Screenshot  │──► AI Analysis
                 └──────────────┘
```

## 7. Knowledge Feedback Loop

知识系统的完整生命周期：Agent 消费 specs → 反馈质量 → Curator 写入新 specs → 循环。

```
  ┌─────────────────────────────────────────────────────────────┐
  │           KNOWLEDGE LIFECYCLE (Room + Spec based)            │
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
  │                  │                                     │   │
  │                  │  写入对应 Feature Room:              │   │
  │                  │  02-03-tester/specs/decision-*.yaml │   │
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
  │  │ 1. constraints  (必须遵守)                       │      │
  │  │ 2. decisions    (已做选择，不重复决策)             │      │
  │  │ 3. conventions  (团队约定)                       │      │
  │  │ 4. context      (背景参考)                       │      │
  │  │ 5. intent       (功能目标)                       │      │
  │  │ Within each: qualityScore DESC                   │      │
  │  └──────────────────────┬───────────────────────────┘      │
  │                         ▼                                   │
  │  inject → /home/agent/context/                              │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

  ┌─── FEEDBACK PATH (质量演化) ────────────────────────────────┐
  │                                                             │
  │  Agent 完成后 emit contextFeedback:                         │
  │                                                             │
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

## 8. SSE Event 架构

```
  ┌─────────────────────────────────────────────────────────────┐
  │                   SSE EVENT FLOW                             │
  └─────────────────────────────────────────────────────────────┘

  Agent Container                    Server                   Dashboard
  ┌──────────────┐              ┌──────────────┐         ┌──────────────┐
  │ Claude Code  │   NDJSON     │ Stream       │  SSE    │ useSSE()     │
  │ --output     │─────────────►│ Capture      │────────►│ useAgentSSE()│
  │ stream-json  │   stdout     │              │         │              │
  └──────────────┘              │ Parse events │         │ Render:      │
                                │ Persist turns│         │ - text       │
                                │ Broadcast Δ  │         │ - tool calls │
                                └──────────────┘         │ - reasoning  │
                                                         └──────────────┘

  Event Types:
  ┌─────────────┬──────────────────────────────────┬───────────┐
  │ Type        │ Data                             │ Persisted │
  ├─────────────┼──────────────────────────────────┼───────────┤
  │ text        │ { content }                      │ ✓ (turns) │
  │ tool_use    │ { toolName, toolInput, id }      │ ✓         │
  │ tool_result │ { id, output (≤10KB), isError }  │ ✓         │
  │ error       │ { message, code? }               │ ✓         │
  │ completion  │ { result, cost, tokens, duration }│ ✓         │
  │ system      │ { message }                      │ ✓         │
  │ stream_event│ { delta }                        │ ✗ (SSE ∅) │
  └─────────────┴──────────────────────────────────┴───────────┘

  Global SSE Events:
  agent:started, agent:completed, cycle:completed,
  task:status_changed, job:requires_approval,
  system:spending_warning

  Heartbeat: every 30s
  Replay: last 100 events for new subscribers
```

## 9. Docker Compose Stack

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  DOCKER COMPOSE STACK                        │
  │                  docker-compose.yml                          │
  └─────────────────────────────────────────────────────────────┘

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │   MongoDB    │  │    Server    │  │  Dashboard   │
  │   :27017     │  │    :3001     │  │    :3000     │
  │              │  │              │  │              │
  │  standalone  │◄─│  Express     │  │  Next.js     │
  │  no replica  │  │  Job Queue   │  │  App Router  │
  │              │  │  Spawner     │  │  SSE client  │
  └──────────────┘  │  SSE Manager │  │              │
                    └──────┬───────┘  └──────────────┘
                           │
                    ┌──────▼───────┐
                    │  Reloader    │
                    │  Sidecar     │
                    │              │
                    │  Watch       │
                    │  /reload/    │
                    │  trigger     │
                    │  → git pull  │
                    │  → rebuild   │
                    └──────────────┘

  Agent containers are ephemeral — created/destroyed per run
  Image: godot-agent:4.6.1
  ┌────────────────────────────────────┐
  │  Node 22 + Godot 4.6.1 headless   │
  │  + Claude Code CLI                │
  │  + gh CLI                         │
  │  + GUT 9.x                        │
  │  + sox (audio processing)         │
  │  + tools/                         │
  │    gen_pr_body.py                  │
  │    validate_pr_body.py             │
  │    check_rate_limit.sh             │
  └────────────────────────────────────┘
```

## 10. 项目结构（双 Repo）

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
│   │   │   │   │   ├── seed-knowledge.ts  Bootstrap knowledge → DB
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
│   │           ├── knowledge/         Legacy knowledge browser
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
│   ├── knowledge/                     Bootstrap knowledge (seeded to DB)
│   │   ├── boot.md                    System overview (injected to all agents)
│   │   ├── conventions.md             GDScript standards
│   │   └── glossary.md                Game + engine terms
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

## 11. 错误恢复策略

```
  ┌──────────────────┬─────────────────────────┬──────────────────────┐
  │ 错误类型          │ 检测方式                 │ 恢复策略              │
  ├──────────────────┼─────────────────────────┼──────────────────────┤
  │ OOM (exit 137)   │ container exit code     │ Retry + 增大 memory  │
  │ Timeout          │ role-based deadline     │ Retry same timeout   │
  │                  │                         │ → escalate if repeat │
  │ Rate limited     │ stdout text detection   │ Mark run, retry later│
  │ Network partition│ 5 min no events         │ Kill + retry         │
  │ Merge conflict   │ git merge --no-commit   │ Re-queue task with   │
  │                  │ dry-run                 │ fresh spawn          │
  │ Plan invalid     │ plan-validator          │ Replan (1 retry)     │
  │                  │                         │ → human intervention │
  │ All tasks failed │ review phase check      │ Cycle failed + human │
  │                  │                         │ gated next-cycle     │
  │ Orphan container │ startup label scan      │ Classify + cleanup   │
  │ Spending overrun │ 80% / 100% threshold   │ Warning → hard block │
  │ PR body invalid  │ validate_pr_body.py     │ Retry with feedback  │
  └──────────────────┴─────────────────────────┴──────────────────────┘
```

## 12. 安全边界

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

## 13. Knowledge 系统升级：KnowledgeFile → Room + Spec

### 13.1 为什么要改

当前 `KnowledgeFile` 是 flat 的 markdown blob 池子，Context Builder 靠 qualityScore 全局排名选文件注入。问题：

1. **无结构** — `skills/error-handling.md` 和 `decisions/use-gut.md` 存的都是 markdown，没有类型区分
2. **无层级** — 没法表达 "这个 constraint 属于 Tester 模块" 这种归属关系
3. **无精确投放** — Coder 做 tester task 时，收到的是全局 top-15 文件，不是 tester 相关的 specs
4. **无继承** — 子模块无法自动继承父模块的 constraints
5. **无溯源** — 不知道这条 knowledge 是哪个 cycle、哪个 agent、多大 confidence 产生的
6. **Curator 落空** — curator.md 已经写好了 Room/Spec 写入逻辑，但后端没有对应的 model

### 13.2 当前系统 vs 目标系统

#### 当前：Flat KnowledgeFile

```
  ┌─────────────────────────────────────────────────────────────┐
  │              当前 KNOWLEDGE SYSTEM (flat)                     │
  └─────────────────────────────────────────────────────────────┘

  存储: 一个 MongoDB collection，所有知识混在一起
  ┌───────────────────────────────────────────────────────────┐
  │  KnowledgeFile collection                                 │
  │                                                           │
  │  { _id: "specs/boot.md",                                  │
  │    category: "specs",     ← 只有 6 种粗分类               │
  │    content: "# System...", ← 纯 markdown blob，无结构     │
  │    qualityScore: 42,                                      │
  │    status: "active" }                                     │
  │                                                           │
  │  { _id: "skills/conventions.md",                          │
  │    category: "skills",                                    │
  │    content: "# GDScript...",                              │
  │    qualityScore: 38 }                                     │
  │                                                           │
  │  { _id: "decisions/use-gut-framework.md",                 │
  │    category: "decisions",                                 │
  │    content: "We chose GUT because...",                    │
  │    qualityScore: 15 }                                     │
  │                                                           │
  │  { _id: "inbox/1712345-abc",                              │
  │    category: "inbox",      ← agent 报告的知识缺口          │
  │    content: "Need: .tscn merge strategy" }                │
  │                                                           │
  │  { _id: "retrospectives/cycle-5.md",                      │
  │    category: "retrospectives",                            │
  │    content: "# Cycle 5\n3/5 tasks done..." }              │
  │                                                           │
  │  ... (全部 flat，无层级，无归属)                            │
  └───────────────────────────────────────────────────────────┘

  Categories (6 种):
  ┌────────────────┬─────────────────────────────────────────┐
  │ skills         │ 可复用模式 (conventions.md)              │
  │ decisions      │ 架构选择 (use-gut.md)                   │
  │ specs          │ 功能规格 (boot.md, glossary.md)         │
  │ journal        │ 日志 (known-issues.md)                  │
  │ inbox          │ Agent 报告的知识缺口                     │
  │ retrospectives │ 自动生成的 cycle 总结                    │
  └────────────────┴─────────────────────────────────────────┘

  Context Builder 怎么用:
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  1. 固定注入 3 个 bootstrap 文件 (从磁盘读，不走 DB):       │
  │     boot.md, conventions.md, glossary.md                    │
  │                                                             │
  │  2. 从 DB 查询: status=active, 排除已注入的 3 个            │
  │     ORDER BY qualityScore DESC                              │
  │     LIMIT 15                                                │
  │                                                             │
  │  3. Keyword boost (task title/desc 提取关键词):             │
  │     Tier 1: 关键词命中 title/snippet  ──► 提前             │
  │     Tier 2: 关键词命中 content 前 500 字 ──► 次之          │
  │     Tier 3: 无匹配 ──► 原位                                │
  │                                                             │
  │  4. 全部拼接成 markdown 注入到 agent 容器                   │
  │                                                             │
  │  问题:                                                      │
  │  - Coder 做 tester task，收到的是全局 top 15，              │
  │    可能包含完全无关的 retrospective 和 journal               │
  │  - 没法区分 "必须遵守的 constraint" 和 "参考用的 context"   │
  │  - 不知道这条知识属于哪个模块                                │
  │  - 不知道谁写的、什么时候、多大把握                          │
  └─────────────────────────────────────────────────────────────┘

  Curator 怎么写:
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  Cycle retrospect 阶段:                                     │
  │  1. 检查 inbox 有没有 pending 条目                          │
  │  2. 有 → spawn Curator agent                               │
  │  3. Curator 处理 inbox（merge/archive/promote）             │
  │  4. 写回 KnowledgeFile (又一个 markdown blob)               │
  │                                                             │
  │  问题:                                                      │
  │  - Curator 只处理 inbox，不主动从 PR diffs 提取知识          │
  │  - 写的还是无结构的 markdown，没有 type 区分                 │
  │  - 不知道该写到哪个模块（没有 Room 归属）                    │
  │  - curator.md 已经定义了 Room/Spec 写入逻辑，               │
  │    但后端没有对应的 model，所以全部落空                      │
  └─────────────────────────────────────────────────────────────┘
```

#### 目标：Room + Spec 层级结构

```
  ┌─────────────────────────────────────────────────────────────┐
  │              目标 KNOWLEDGE SYSTEM (hierarchical)            │
  └─────────────────────────────────────────────────────────────┘

  存储: 2 个新 MongoDB collections，知识按功能域组织
  ┌───────────────────────────────────────────────────────────┐
  │  Room collection (26 rooms)                               │
  │                                                           │
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
  ┌───────────────────────────────────────────────────────────┐
  │  Spec collection (每个 Room 多个 typed specs)             │
  │                                                           │
  │  { _id: "constraint-02-03-001",                           │
  │    roomId: "02-03-tester",      ← 归属于 Tester Room     │
  │    type: "constraint",          ← 7 种之一，语义明确      │
  │    state: "active",                                       │
  │    title: "Quick-fail 原则",                              │
  │    summary: "L1 fail 则跳过 L2/L3/L4",                   │
  │    detail: "测试层级...",                                  │
  │    provenance: {                 ← 完整溯源               │
  │      source_type: "agent_sediment",                       │
  │      confidence: 0.85,                                    │
  │      cycle_tag: "M2-C5",                                  │
  │      agentRunId: "curator-abc" },                         │
  │    qualityScore: 78,             ← 保留 feedback loop     │
  │    anchors: [{                   ← 绑定到代码             │
  │      file: "agents/tester.md",                            │
  │      symbol: "quick-fail-rule" }],                        │
  │    tags: ["tester", "L1", "L2", "L3", "L4"] }            │
  │                                                           │
  │  { _id: "decision-02-03-002",                             │
  │    roomId: "02-03-tester",                                │
  │    type: "decision",                                      │
  │    title: "L4 与 L2 并行执行",                            │
  │    summary: "PRD compliance 不依赖 integration 结果",     │
  │    provenance: { confidence: 0.9, cycle_tag: "M2-C7" },  │
  │    qualityScore: 65 }                                     │
  │                                                           │
  │  { _id: "convention-00-project-001",                      │
  │    roomId: "00-project-room",    ← 全局 convention        │
  │    type: "convention",                                    │
  │    title: "GDScript 静态类型",                            │
  │    summary: "所有代码使用 := 和 -> void 静态类型声明",     │
  │    qualityScore: 92 }            ← 被所有子 Room 继承     │
  │                                                           │
  └───────────────────────────────────────────────────────────┘

  7 种 Spec Types (vs 当前 6 种 category):
  ┌────────────────┬──────────────────────────┬────────────────────────┐
  │ Spec Type      │ 语义                     │ 旧 category 映射       │
  ├────────────────┼──────────────────────────┼────────────────────────┤
  │ intent         │ 为什么做这件事            │ ← specs (部分)         │
  │ decision       │ 为什么选 A 不选 B         │ ← decisions            │
  │ constraint     │ 不能做什么 / 边界条件      │ ← specs (部分)         │
  │ contract       │ 组件之间的接口约定         │ (新增)                 │
  │ convention     │ 团队怎么做事              │ ← skills               │
  │ change         │ 一次具体变更的记录         │ ← retrospectives       │
  │ context        │ 背景信息                  │ ← journal              │
  └────────────────┴──────────────────────────┴────────────────────────┘

  Context Builder 怎么用 (升级后):
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  1. 从 Task 定位相关 Rooms:                                 │
  │     Task title "fix tester quick-fail"                      │
  │       → keywords: [tester, quick, fail]                    │
  │       → match Room: 02-03-tester (by name + tags)           │
  │       → also: 00-project-room (always)                     │
  │                                                             │
  │  2. 收集 Specs + 继承链:                                    │
  │     02-03-tester:     3 constraints + 2 decisions           │
  │     02-agent-system:  4 constraints (inherited)             │
  │     00-project-room:  2 conventions (inherited)             │
  │                                                             │
  │  3. 按 type 分组排序注入:                                   │
  │     ┌─ constraints ──────────────────────────────┐          │
  │     │ [MUST] Quick-fail: L1 fail → skip L2/L3/L4│ score:78 │
  │     │ [MUST] GUT timeout: 3 min                  │ score:71 │
  │     │ [MUST] Container memory: 4GB               │ score:65 │
  │     ├─ decisions ────────────────────────────────┤          │
  │     │ L4 与 L2 并行执行 (M2-C7)                  │ score:65 │
  │     ├─ conventions ──────────────────────────────┤          │
  │     │ GDScript 静态类型 (:= 和 -> void)          │ score:92 │
  │     │ Agent 输出格式: stream-json NDJSON         │ score:88 │
  │     ├─ context ──────────────────────────────────┤          │
  │     │ Godot bug: headless import 偶尔 hang       │ score:45 │
  │     └────────────────────────────────────────────┘          │
  │                                                             │
  │  4. Fallback: 如果 specs 不够 token budget，                │
  │     用旧 KnowledgeFile 补齐（迁移过渡期）                   │
  │                                                             │
  │  改进:                                                      │
  │  ✓ Agent 收到的是精准的模块相关知识，不是全局 top 15        │
  │  ✓ constraints 排最前 — agent 先看 "不能做什么"             │
  │  ✓ 继承链 — 不用在每个 Room 重复写全局约定                  │
  │  ✓ 每条 spec 有溯源 — agent 知道这条规则的来源和可信度      │
  └─────────────────────────────────────────────────────────────┘

  Curator 怎么写 (升级后):
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │  Cycle retrospect 阶段:                                     │
  │  1. 读取本 cycle 所有 PR diffs                              │
  │  2. 从 diff 中提取 knowledge sediment:                      │
  │     - 每条标记 type (decision/constraint/context)           │
  │     - 标记 confidence (0.0 - 1.0)                          │
  │     - 标记 cycle_tag (M2-C5)                               │
  │     - 推断 target Room (从修改的文件路径 → Room 归属)       │
  │  3. Confidence routing:                                     │
  │     ≥0.75 → state: active (自动生效)                       │
  │     ≥0.50 → state: draft (Dashboard 上等人工确认)           │
  │     <0.50 → 丢弃                                           │
  │  4. POST /api/specs 写入对应 Room                           │
  │  5. 更新 Room metadata (last_cycle, lifecycle)              │
  │                                                             │
  │  改进:                                                      │
  │  ✓ 主动从 PR diffs 提取，不只是处理 inbox                  │
  │  ✓ 写的是 typed spec，不是 markdown blob                   │
  │  ✓ 知道该写到哪个 Room (按文件路径归属)                     │
  │  ✓ Confidence routing 防止低质量知识自动生效                │
  └─────────────────────────────────────────────────────────────┘
```

### 13.3 新 MongoDB Schemas

#### Room Collection

```typescript
// apps/server/src/models/room.ts
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

#### Spec Collection

```typescript
// apps/server/src/models/spec.ts
{
  _id: String,              // "intent-02-03-tester-001"
  roomId: String,           // → Room._id
  type: 'intent' | 'decision' | 'constraint' | 'contract'
      | 'convention' | 'change' | 'context',
  state: 'draft' | 'active' | 'archived',

  // 内容
  title: String,
  summary: String,          // 一句话摘要（替代 snippet）
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

  // Feedback loop（保留 qualityScore 机制）
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

### 13.4 Context Builder 升级

```
  ┌─────────────────────────────────────────────────────────────┐
  │         CONTEXT BUILDER — Room-Aware Selection               │
  └─────────────────────────────────────────────────────────────┘

  当前流程:
  ┌────────────┐    qualityScore DESC     ┌──────────┐
  │ All active │───────────────────────►  │ Top 15   │──► inject
  │ KnowFiles  │    + keyword boost       │ files    │
  └────────────┘                          └──────────┘

  升级流程:
  ┌──────────────────────────────────────────────────────────────┐
  │                                                              │
  │  Step 1: 确定相关 Rooms                                      │
  │  ┌───────────────────────────────────────────────────┐      │
  │  │ Task has prdRefs? → map to Rooms                  │      │
  │  │ Task title/desc keywords? → match Room names/tags │      │
  │  │ Always include: 00-project-room (global specs)    │      │
  │  └──────────────────────┬────────────────────────────┘      │
  │                         ▼                                    │
  │  Step 2: 收集 Specs (with 继承)                              │
  │  ┌───────────────────────────────────────────────────┐      │
  │  │ For each relevant Room:                           │      │
  │  │   Collect active specs from Room                  │      │
  │  │   Walk up to parent → collect constraints/convs   │      │
  │  │   (inheritance: child gets parent constraints)    │      │
  │  └──────────────────────┬────────────────────────────┘      │
  │                         ▼                                    │
  │  Step 3: 排序注入                                            │
  │  ┌───────────────────────────────────────────────────┐      │
  │  │ Priority order:                                   │      │
  │  │   1. constraints (必须遵守)                        │      │
  │  │   2. decisions (已做选择，避免重复决策)              │      │
  │  │   3. conventions (团队约定)                        │      │
  │  │   4. context (背景参考)                            │      │
  │  │   5. intent (功能目标)                             │      │
  │  │ Within each type: qualityScore DESC               │      │
  │  │ Token budget: ~8000 tokens for specs              │      │
  │  └──────────────────────┬────────────────────────────┘      │
  │                         ▼                                    │
  │  Step 4: Fallback to KnowledgeFile                          │
  │  ┌───────────────────────────────────────────────────┐      │
  │  │ If specs < token budget:                          │      │
  │  │   Fill remaining with legacy KnowledgeFile        │      │
  │  │   (qualityScore DESC, keyword boost)              │      │
  │  └───────────────────────────────────────────────────┘      │
  │                                                              │
  └──────────────────────────────────────────────────────────────┘
```

### 13.5 Curator 写入流程

```
  ┌─────────────────────────────────────────────────────────────┐
  │            CURATOR — Spec Sediment Extraction                │
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
  │       │   state: draft, confidence: 0.7      │
  │       │                                      │
  │       ├─► constraint spec                    │
  │       │   "FPS 不能低于 30 in farm scene"     │
  │       │   state: draft, confidence: 0.8      │
  │       │                                      │
  │       └─► context spec                       │
  │           "这个 workaround 是因为 Godot bug"  │
  │           state: draft, confidence: 0.6      │
  │                                              │
  │   POST /api/specs { roomId, type, ... }      │
  └──────────────────────────────────────────────┘
           │
           ▼
  Phase 2: Confidence routing
  ┌──────────────────────────────────────────────┐
  │ confidence ≥ 0.75 → state: active (自动记录) │
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

### 13.6 Feedback Loop（保留 + 升级）

```
  ┌─────────────────────────────────────────────────────────────┐
  │         SPEC-LEVEL QUALITY FEEDBACK                          │
  └─────────────────────────────────────────────────────────────┘

  Agent 完成后 contextFeedback 格式升级:

  当前:
  {
    useful: ["specs/boot.md", "skills/conventions.md"],
    unnecessary: ["journal/known-issues.md"],
    missing: ["how to handle .tscn merge conflicts"]
  }

  升级为:
  {
    useful_specs: ["intent-02-03-tester-001", "constraint-00-project-001"],
    unnecessary_specs: ["context-08-infrastructure-003"],
    useful_legacy: ["specs/boot.md"],         // 兼容旧 KnowledgeFile
    unnecessary_legacy: [],
    missing: ["how to handle .tscn merge conflicts"]
  }

  处理:
  ┌──────────────────────────────────────────────┐
  │ For each useful_spec:                        │
  │   spec.qualityScore = score * 0.95 + 1.0     │
  │   spec.lastReferencedAt = now()              │
  │                                              │
  │ For each unnecessary_spec:                   │
  │   spec.qualityScore = score * 0.95 - 1.5     │
  │   If score ≤ -10 → state: archived          │
  │                                              │
  │ For each missing:                            │
  │   Create draft spec in most relevant Room    │
  │   type: context, confidence: 0.5             │
  │   (replaces inbox mechanism)                 │
  └──────────────────────────────────────────────┘
```

### 13.7 API Routes

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    NEW API ENDPOINTS                         │
  └─────────────────────────────────────────────────────────────┘

  Rooms:
  GET    /api/rooms              List rooms (filter: parent, lifecycle, type)
  GET    /api/rooms/:id          Get room + child rooms + spec counts
  GET    /api/rooms/tree         Full tree (替代读 _tree.yaml)
  POST   /api/rooms              Create room
  PATCH  /api/rooms/:id          Update room metadata
  DELETE /api/rooms/:id          Archive room (检查 child specs)

  Specs:
  GET    /api/specs              List specs (filter: roomId, type, state, tags)
  GET    /api/specs/:id          Get single spec
  POST   /api/specs              Create spec (Curator 调用)
  PATCH  /api/specs/:id          Update spec (state transitions, content edits)
  DELETE /api/specs/:id          Archive spec

  兼容:
  GET    /api/knowledge          保留，逐步迁移到 /api/specs
  POST   /api/knowledge          保留，创建同时写入 Spec collection
```

### 13.8 Seeding（启动时同步）

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    SEED ON STARTUP                           │
  └─────────────────────────────────────────────────────────────┘

  Server startup
       │
       ├─► seedKnowledge()          (保留，知识文件 → KnowledgeFile)
       │
       └─► seedRooms()              (新增)
           │
           ├── 读取 rooms/00-project-room/_tree.yaml
           │   解析完整 Room 树
           │
           ├── For each Room in tree:
           │   ├── Upsert Room document to MongoDB
           │   └── 读取 rooms/{path}/specs/*.yaml
           │       └── Upsert Spec documents to MongoDB
           │
           └── 返回 { roomsUpserted, specsUpserted, unchanged }
```

### 13.9 Dashboard 变更

```
  ┌─────────────────────────────────────────────────────────────┐
  │              DASHBOARD — Room Tree View                      │
  └─────────────────────────────────────────────────────────────┘

  当前 Knowledge page (保留):
  ┌──────────────────────────────────────────────┐
  │ [skills] [decisions] [specs] [inbox] [...]   │  category filter
  │                                              │
  │ ID          Title        Score  Status       │  flat table
  │ specs/boot  System Boot  42     active       │
  │ ...                                          │
  └──────────────────────────────────────────────┘

  新增 Rooms page:
  ┌──────────────────────────────────────────────┐
  │ 🌳 Room Tree           │  Spec Detail       │
  │                         │                    │
  │ ▼ 00 项目总控           │  Room: 02-03-tester│
  │   ▼ 02 Agent 系统       │  Lifecycle: active │
  │     01 Orchestrator    │  Specs: 5          │
  │     02 Coder           │                    │
  │     ► 03 Tester ←      │  ┌──────────────┐  │
  │     04 Reviewer        │  │ [intent]  2  │  │
  │     05 Integrator      │  │ [decision]1  │  │
  │     06 Curator         │  │ [constraint]2│  │
  │     07 Container       │  └──────────────┘  │
  │     08 Spawner         │                    │
  │     09 Stream          │  constraint-001:   │
  │   03 任务队列           │  "Quick-fail:     │
  │   ▼ 04 知识系统         │   L1 fail →       │
  │     01 上下文构建器     │   skip L2/L3/L4"  │
  │     02 策展            │  score: 78         │
  │   05 测试管线           │  M2-C5 | 0.85     │
  │   ...                  │                    │
  └──────────────────────────────────────────────┘
```

### 13.10 实施阶段

```
  Phase 1: Foundation (不破坏现有系统)
  ┌──────────────────────────────────────────────┐
  │ □ 新增 Room model + Spec model               │
  │ □ 新增 /api/rooms + /api/specs routes        │
  │ □ 新增 seedRooms() 从 rooms/ 目录同步到 DB    │
  │ □ index.ts 启动时调用 seedRooms()             │
  │ □ packages/shared 新增 Room/Spec types        │
  │                                              │
  │ 验证: 启动后 rooms + specs 两个 collection    │
  │ 有数据，API 可查询，现有系统完全不受影响        │
  └──────────────────────────────────────────────┘

  Phase 2: Context Builder 双轨 (Room 优先，KnowledgeFile 兜底)
  ┌──────────────────────────────────────────────┐
  │ □ context-builder.ts 新增 Room-aware 选择逻辑 │
  │ □ Task → Room 映射（keyword + prdRefs）       │
  │ □ Spec 继承链（child → parent constraints）   │
  │ □ 保留 KnowledgeFile fallback                 │
  │ □ contextFeedback 升级（spec IDs + legacy）   │
  │ □ processContextFeedback 支持 Spec 更新       │
  │                                              │
  │ 验证: Agent 收到的 context 包含 Room specs    │
  │ + legacy KnowledgeFile，qualityScore 正常更新  │
  └──────────────────────────────────────────────┘

  Phase 3: Curator 集成
  ┌──────────────────────────────────────────────┐
  │ □ Curator 写入 typed Specs 到对应 Room       │
  │ □ Confidence routing (≥0.75 active, else draft)│
  │ □ Room metadata 更新 (last_cycle, lifecycle)  │
  │ □ 替代旧 inbox 机制 — missing → draft spec   │
  │                                              │
  │ 验证: Cycle retrospect 后新 specs 出现在      │
  │ 对应 Room，confidence 正确，可在 Dashboard 看到│
  └──────────────────────────────────────────────┘

  Phase 4: Dashboard + 迁移收尾
  ┌──────────────────────────────────────────────┐
  │ □ 新增 Rooms page (tree view + spec detail)  │
  │ □ 迁移 KnowledgeFile → Spec (migration 脚本)  │
  │ □ 旧 Knowledge page 标记 legacy              │
  │ □ KnowledgeFile fallback 降级为 optional      │
  │                                              │
  │ 验证: Dashboard 可浏览 Room 树，              │
  │ 所有有价值的 KnowledgeFile 已迁移到 Spec      │
  └──────────────────────────────────────────────┘
```

### 13.11 现有 Knowledge 文件逐条迁移映射

当前 `knowledge/` 目录共 22 个文件。每个文件迁移到哪个 repo 的哪个 Room、变成什么 type 的 Spec：

```
  ┌─────────────────────────────────────────────────────────────┐
  │         现有 22 个 Knowledge 文件 → Room + Spec 映射         │
  └─────────────────────────────────────────────────────────────┘

  ═══ 属于 GAME REPO 的知识（agents 做游戏时需要）═══

  conventions.md                    GDScript 静态类型、命名规范、signal、测试写法
  ──────────────────────────────────────────────────────────────
  → game/rooms/00-project-room/specs/convention-gdscript-001.yaml
    type: convention | state: active | confidence: 1.0
    source_type: human
    内容拆分为多条 spec:
      convention: "静态类型 := 和 -> void"
      convention: "snake_case 函数/变量, PascalCase 类"
      convention: "Signal 用 .emit() 不用 .call()"
      convention: "测试 extends GutTest, prefix test_"
      convention: "PRD 公式用注释标注来源"

  glossary.md                       游戏术语 + 引擎术语
  ──────────────────────────────────────────────────────────────
  → game/rooms/00-project-room/specs/context-glossary-001.yaml
    type: context | state: active | confidence: 1.0
    source_type: human
    包含: zombie types, quality tiers, 五行, 修炼境界,
          货币类型, 突变催化剂, Node/Scene/GUT 术语

  ═══ 属于 HARNESS REPO 的知识（agents 理解管线时需要）═══

  agent-container-setup.md          entrypoint 流程、Docker 网络、env vars
  ──────────────────────────────────────────────────────────────
  → harness/rooms/02-agent-system/07-container/specs/
    convention-container-setup-001.yaml
    type: convention | state: active | confidence: 1.0
    source_type: human
    anchors: [docker/agent/entrypoint.sh]

  agent-timeouts.md                 各 role 超时值、fallback、network kill
  ──────────────────────────────────────────────────────────────
  → harness/rooms/02-agent-system/08-spawner/specs/
    constraint-timeouts-001.yaml
    type: constraint | state: active | confidence: 1.0
    source_type: human
    anchors: [packages/shared/src/constants.ts:ROLE_TIMEOUT_MS]
    拆分为:
      constraint: "Orchestrator 超时 20min"
      constraint: "Coder 超时 30min"
      constraint: "Network inactivity kill 5min"

  sse-events.md                     SSE event types、filtering、data 格式
  ──────────────────────────────────────────────────────────────
  → harness/rooms/07-dashboard/01-live-stream/specs/
    contract-sse-events-001.yaml
    type: contract | state: active | confidence: 1.0
    source_type: human
    anchors: [apps/server/src/services/sse-manager.ts]

  badge-classes.md                  Dashboard badge CSS 映射
  ──────────────────────────────────────────────────────────────
  → harness/rooms/07-dashboard/specs/
    convention-badge-classes-001.yaml
    type: convention | state: active | confidence: 0.9
    source_type: human
    anchors: [apps/dashboard/src/app/globals.css]

  knowledge-api.md                  Knowledge REST API 文档
  ──────────────────────────────────────────────────────────────
  → harness/rooms/04-knowledge-system/specs/
    contract-knowledge-api-001.yaml
    type: contract | state: active | confidence: 1.0
    source_type: human
    anchors: [apps/server/src/routes/knowledge.ts]

  known-issues.md                   管线 bug 模式和解决记录 (cycle 21-33)
  ──────────────────────────────────────────────────────────────
  → harness/rooms/00-project-room/specs/
    context-known-issues-001.yaml
    type: context | state: active | confidence: 1.0
    source_type: agent_sediment (Curator 持续更新)
    拆分为多条 spec:
      context: "Retrospective chore 已自动化 (C21), 不再需要手动 plan"
      decision: "auto-approval 默认全开 (C23)"
      context: "retrospective 自动生成用 idempotent upsert (C26)"
      decision: "seed-knowledge.ts 处理 disk→DB sync (C28)"
      context: "goalCoverage + review quality metrics 用于 cycle 评估 (C33)"

  migrations.md                     Migration 规范
  ──────────────────────────────────────────────────────────────
  → harness/rooms/11-data-layer/specs/
    convention-migrations-001.yaml
    type: convention | state: active | confidence: 1.0
    anchors: [apps/server/src/migrations/]

  roadmap.md                        10 个 bootstrap phase
  ──────────────────────────────────────────────────────────────
  → harness/rooms/00-project-room/specs/
    context-roadmap-001.yaml
    type: context | state: active | confidence: 0.8
    source_type: human

  ═══ 需要拆分的知识 ═══

  boot.md                           项目概述、agent 角色、测试层级、路径
  ──────────────────────────────────────────────────────────────
  拆分为两份:

  → harness/rooms/00-project-room/specs/
    context-harness-boot-001.yaml
    type: context | state: active
    内容: 开发周期流程、agent 角色表、contextFeedback 格式

  → game/rooms/00-project-room/specs/
    context-game-boot-001.yaml
    type: context | state: active
    内容: 测试层级表、prd/ milestones/ 路径、Godot 4.6.1 版本锁定

  ═══ Retrospectives (11 个) — 批量迁移 ═══

  cycle-9-retrospective.md  ... cycle-19-retrospective.md
  ──────────────────────────────────────────────────────────────
  → harness/rooms/01-cycle-engine/specs/
    change-cycle-{N}-001.yaml (×11)
    type: change | state: active | confidence: 1.0
    source_type: agent_sediment
    provenance.cycle_tag: "C9" ... "C19"

    每个 retrospective 记录:
    - Cycle 目标和完成的 tasks
    - 改了哪些文件
    - 关键 outcomes
    - 合并结果 (conflicts / clean)

    注: 未来新 retrospective 由 Curator 自动写入，
    不再作为 knowledge file 存储
```

#### Category → Spec Type 通用映射规则

```
  KnowledgeFile.category    →    Spec.type + 目标 Room
  ──────────────────────────────────────────────────────────
  skills                    →    convention (按内容选 Room)
  decisions                 →    decision (按内容选 Room)
  specs                     →    intent 或 constraint (按内容选)
  journal                   →    context (按内容选 Room)
  inbox                     →    draft spec (按内容推断 Room)
  retrospectives            →    change (01-cycle-engine)
  pruned                    →    archived spec (保留不迁移)

  source.type               →    provenance.source_type
  ──────────────────────────────────────────────────────────
  human                     →    human
  agent                     →    agent_sediment

  字段映射:
  ──────────────────────────────────────────────────────────
  _id (path)                →    spec._id (新格式: type-room-NNN)
  content                   →    detail (保留全文)
  snippet                   →    summary (一句话摘要)
  qualityScore              →    qualityScore (保留数值)
  lastReferencedAt          →    lastReferencedAt (保留)
  status: active            →    state: active
  status: archived          →    state: archived
  status: pruned            →    state: archived + 不迁移
```

### 13.12 关键文件变更清单

```
  新增:
  apps/server/src/models/room.ts
  apps/server/src/models/spec.ts
  apps/server/src/routes/rooms.ts
  apps/server/src/routes/specs.ts
  apps/server/src/lib/seed-rooms.ts
  apps/dashboard/src/app/rooms/page.tsx
  packages/shared/src/types.ts          (追加 Room/Spec types)

  修改:
  apps/server/src/index.ts              (startup 调用 seedRooms)
  apps/server/src/services/launcher/context-builder.ts
                                         (Room-aware 选择 + Spec feedback)
  apps/server/src/services/launcher/spawner.ts
                                         (升级 contextFeedback 处理)
  agents/curator.md                      (已经写好了，可能微调)
  packages/shared/src/constants.ts       (新增 SPEC_* 常量)
  apps/server/src/routes/index.ts        (注册新 routes)

  保留不动:
  apps/server/src/models/knowledge-file.ts    (Phase 4 前保留)
  apps/server/src/routes/knowledge.ts         (Phase 4 前保留)
  apps/server/src/lib/seed-knowledge.ts       (Phase 4 前保留)
  apps/dashboard/src/app/knowledge/page.tsx   (Phase 4 前保留)
```

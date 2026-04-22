# Execution — Cycle、Container、Job Queue、Testing、SSE、Infra

执行层的所有机制：Cycle (E1)、Container (E2)、Job Queue (E3)、Testing (E4)、SSE (E5)、Docker (E6)、错误恢复 (E7)、Ludus 自测 (E8)、Auto Mode (E9)。

## E1. Cycle 状态机

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                        CYCLE LIFECYCLE (详细)                      │
  └──────────────────────────────────────────────────────────────────┘

  ══ PLAN ═════════════════════════════════════════════════════════

  ┌──────────┐      ┌───────────────┐      ┌──────────────┐
  │  Spawner │─────►│Context Builder│─────►│ Orchestrator │
  │          │      │               │      │ (container)  │
  │ 创建 job │      │ 1.Task→Room   │      │              │
  │ role:    │      │   匹配        │      │ 读 system    │
  │ orchestr.│      │ 2.收集 specs  │      │ prompt +     │
  └──────────┘      │   + 继承链    │      │ task prompt  │
                    │ 3.排序注入    │      │ + Room specs │
                    │   constraints │      │              │
                    │   先          │      │ 输出:        │
                    │ 4.拼 system   │      │ Plan JSON    │
                    │   prompt +    │      │ + questions  │
                    │   task prompt │      └──────┬───────┘
                    └───────────────┘             │
                                                  ▼
                                     ┌────────────────────┐
                                     │ questions 不为空?   │
                                     └────────┬───────────┘
                                    ┌─────────┤
                                    │         │
                                   YES        NO
                                    │         │
                                    ▼         │
                              ┌──────────┐    │
                              │ Human    │    │
                              │ Q&A      │    │
                              │          │    │
                              │ Dashboard│    │
                              │ 显示问题 │    │
                              │ +选项    │    │
                              │          │    │
                              │ 人工回答 │    │
                              └────┬─────┘    │
                                   │          │
                                   ▼          │
                              Orchestrator    │
                              带 answers      │
                              重新生成 plan   │
                              (不算 retry)    │
                                   │          │
                                   └────┬─────┘
                                        ▼
                                ┌──────────────┐
                                │plan-validator │ 确定性校验
                                │ 3-7 tasks?   │ (Server 内, 无 LLM)
                                │ 字段完整?    │
                                │ .tscn 互斥?  │
                                └──────┬───────┘
                                       │ pass
                                       ▼
                  ┌───────────────┐      ┌──────────────┐
                  │Context Builder│─────►│  Reviewer    │ LLM 质量审查
                  │               │      │  plan-review │
                  │ 注入:         │      │              │
                  │ 02-01-orch    │      │ 拆分合理?    │
                  │ Room specs    │      │ 依赖正确?    │
                  │ (plan 质量    │      │ scope 可控?  │
                  │  标准)        │      │ 覆盖度?      │
                  └───────────────┘      └──────┬───────┘
                                     ┌─────────┤
                                approved   changes-req
                                     │         │
                                     ▼         ▼
                               ┌──────────┐  replan (max 1次)
                               │ Human    │  带 reviewer 反馈
                               │ Plan     │  → 再 reject → 人工
                               │ Review   │
                               └────┬─────┘
                                    │
                          ┌─────────┤
                     [Approve]  [Request Changes]
                          │         │
                          ▼         ▼
                    ┌──────────┐  replan (消耗 retry)
                    │apply-plan│
                    │tasks→ DB │
                    └────┬─────┘
                         ▼
                    IMPLEMENT

  PLAN 阶段两个人工介入点:
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │ 1. Questions 协商 (plan 生成前)                          │
  │    ────────────────────────────────────────────          │
  │    Orchestrator 不确定时输出 questions                   │
  │    Dashboard 显示问题 + 选项，人工回答                   │
  │    Orchestrator 带 answers 重新生成 plan                 │
  │    这是正常流程，不算 retry                              │
  │                                                          │
  │    无 questions → 跳过，直接进 validator                 │
  │                                                          │
  │ 2. Human Plan Review (plan 审查后)                       │
  │    ────────────────────────────────────────────          │
  │    validator + reviewer 都通过后，人工最终确认            │
  │                                                          │
  │    [Approve]          → apply-plan → IMPLEMENT           │
  │    [Request Changes]  → replan (消耗 1 次 retry)         │
  │                         附文字反馈给 Orchestrator         │
  │                         再次 reject → 人工干预           │
  │                                                          │
  └──────────────────────────────────────────────────────────┘

  ══ IMPLEMENT ════════════════════════════════════════════════════

  对每个 task 并行:

  ┌──────────┐      ┌───────────────┐      ┌──────────────┐
  │  Spawner │─────►│Context Builder│─────►│   Coder      │
  │          │      │               │      │ (container)  │
  │ 创建 job │      │ 1.Task→Room   │      │              │
  │ role:    │      │   "mutation"  │      │ git clone    │
  │ coder    │      │   →04-03-mut  │      │ 写 GDScript  │
  │          │      │ 2.收集 specs: │      │ 写 L1 test   │
  └──────────┘      │   04-03 本身  │      │ 跑 GUT       │
                    │   +04-zombie  │      │ 创建 PR      │
                    │   (inherited) │      │              │
                    │   +00-project │      │ 输出:        │
                    │   (inherited) │      │ PR + branch  │
                    │ 3.排序:       │      │ contextFeedb.│
                    │   constraints │      └──────┬───────┘
                    │   →decisions  │             │
                    │   →conventions│             ▼
                    │   →context    │       PR created?
                    │ 4.截断:       │       ├── YES → REVIEW
                    │   ~8000 token │       └── NO → retry (max 2次)
                    │   budget      │
                    └───────────────┘

  ══ REVIEW (TEST + REVIEW) ══════════════════════════════════════

  两条并行路径:

  路径 1 — Agent 侧:

  ┌───────────────┐      ┌──────────────┐
  │Context Builder│─────►│   Tester     │
  │               │      │ (container)  │
  │ 注入:         │      │              │
  │ 02-03-tester  │      │ L2: 集成测试 │
  │ constraints   │      │ L3: 视觉测试 │
  │ + game room   │      │ L4: PRD 合规 │
  │ constraints   │      └──────┬───────┘
  └───────────────┘             │
                          ┌─────┴──────┐
                          │ ALL PASS?  │
                          │ NO → fix   │
                          │ YES ↓      │
                          └─────┬──────┘
                                ▼
  ┌───────────────┐      ┌──────────────┐
  │Context Builder│─────►│  Reviewer    │
  │               │      │  code-review │
  │ 注入:         │      │              │
  │ 02-04-reviewer│      │ 7-item check │
  │ conventions   │      │ verdict:     │
  │ + game room   │      │ approved /   │
  │ decisions     │      │ changes-req  │
  └───────────────┘      └──────┬───────┘
                                │
                     approved → task 待合并
                     changes-req → retry coder (带反馈)

  路径 2 — 基础设施侧 (并行):

  ┌──────────────┐      ┌──────────────┐
  │ wait-for-ci  │      │  Human Gate  │
  │ (infra job)  │      │ (如果涉及    │
  │              │      │  protected   │
  │ 轮询 GitHub  │      │  paths)      │
  │ Actions CI   │      │              │
  │              │      │ Dashboard    │
  │ pass/fail    │      │ approve/     │
  │              │      │ reject       │
  └──────┬───────┘      └──────┬───────┘
         │                     │
         └──────────┬──────────┘
                    ▼
         两条都 pass → task approved
         等待所有 tasks approved → INTEGRATE

  ══ INTEGRATE ═══════════════════════════════════════════════════

  ┌───────────────┐      ┌──────────────┐
  │Context Builder│─────►│  Integrator  │
  │               │      │ (container)  │
  │ 注入:         │      │              │
  │ 02-05-integr  │      │ 按 topo 排序 │
  │ constraints   │      │ 逐个 merge:  │
  │ (.tscn 处理   │      │              │
  │  topo 排序)   │      │ 1. dry-run   │
  └───────────────┘      │ 2. pass →    │
                         │    merge     │
                         │ 3. conflict →│
                         │    尝试解决  │
                         │ 4. 解决不了→ │
                         │    re-queue  │
                         │              │
                         │ 全部完成 →   │
                         │ RETROSPECT   │
                         └──────────────┘

  Integrator 冲突处理流程:
  ┌──────────────────────────────────────────────────────────┐
  │ 对每个 PR (按 topo 排序):                                │
  │                                                          │
  │ Step 1: git merge --no-commit (dry-run)                  │
  │   ├─ 无冲突 → git commit → PR merged → 下一个           │
  │   └─ 有冲突 → Step 2                                    │
  │                                                          │
  │ Step 2: Integrator (LLM) 尝试自己解决冲突               │
  │   读取冲突文件的 <<<< ==== >>>> markers                  │
  │   理解两边改动的意图                                     │
  │   尝试合并 → 跑 godot --headless --import 验证           │
  │   ├─ 解决成功 + import 通过 → commit → merged            │
  │   └─ 解决失败 (无法合并 / import 失败) → Step 3         │
  │                                                          │
  │ Step 3: re-queue task                                    │
  │   task status → conflict-requeued                        │
  │   SSE 事件: task:conflict_requeued                       │
  │   Dashboard Tasks 页面显示 ⚠ 冲突标记 + 冲突文件列表    │
  │   新 Coder spawn 在最新 main 上重写                      │
  │   re-queue 最多 2 次 → 之后标记 blocked                  │
  │                                                          │
  │ 成本对比:                                                │
  │   旧: 冲突 → re-queue → Coder $5 + Tester $5 + Review $5│
  │   新: 冲突 → Integrator 自己解决 → $0 额外成本           │
  │       (Integrator 反正已经在跑，解决冲突是它的工作)      │
  └──────────────────────────────────────────────────────────┘

  ══ RETROSPECT ══════════════════════════════════════════════════

  ┌───────────────┐      ┌──────────────┐
  │Context Builder│─────►│   Curator    │
  │               │      │ (container)  │
  │ 注入:         │      │              │
  │ 当前 Room +   │      │ 读 PR diffs  │
  │ Spec 数据     │      │ 提取 sediment│
  │ _tree.yaml    │      │              │
  │ 文件归属映射  │      │ decision:    │
  └───────────────┘      │  "选 A 不选B"│
                         │ constraint:  │
                         │  "FPS≥30"    │
                         │ context:     │
                         │  "Godot bug" │
                         │              │
                         │ confidence   │
                         │ routing:     │
                         │ ≥0.75→active │
                         │ 0.50→draft   │
                         │ <0.50→丢弃   │
                         │              │
                         │ POST /api/   │
                         │ specs 写入   │
                         │ 对应 Room    │
                         └──────┬───────┘
                                │
                                ▼
                         cycle: completed
                         → next-cycle job

  ══ FAILURE PATH ════════════════════════════════════════════════

  All tasks failed in review?
      │
      ▼
  cycle.status = 'failed'
  No Integrator spawned
  next-cycle job with requiresApproval: true
```

### E1.1 Context Builder 注入逻辑

```
  ┌─────────────────────────────────────────────────────────────┐
  │      CONTEXT BUILDER — 每次 agent spawn 前执行               │
  │      Server 端确定性逻辑，无 LLM                             │
  └─────────────────────────────────────────────────────────────┘

  Step 1: 确定相关 Rooms
  ┌──────────────────────────────────────────────────────────┐
  │ 输入: Task (title, description, prdRefs[])              │
  │                                                          │
  │ 匹配规则:                                                │
  │  • prdRefs → 映射到 game Room                           │
  │    (如 prdRef "03-zombie-growth" → Room 04-01-growth)   │
  │  • Task title/desc 关键词 → 匹配 Room names/tags        │
  │    (如 "tester" → Room 02-03-tester)                    │
  │  • Agent role → 匹配 harness Room                       │
  │    (如 role=coder → Room 02-02-coder)                   │
  │  • 始终包含: 00-project-room (全局 specs)                │
  │                                                          │
  │ 输出: [Room] 相关 Room 列表                              │
  └──────────────────────────────────────────────────────────┘
                         │
                         ▼
  Step 2: 收集 Specs + 继承
  ┌──────────────────────────────────────────────────────────┐
  │ 对每个相关 Room:                                         │
  │  • 收集该 Room 的 active specs                           │
  │  • 沿 parent 链向上收集 constraints + conventions        │
  │                                                          │
  │ 例: Task 关于 Tester                                     │
  │   02-03-tester specs (direct)         ← 3 constraints    │
  │ + 02-agent-system constraints (parent) ← 4 constraints   │
  │ + 00-project-room conventions (root)   ← 2 conventions   │
  │                                                          │
  │ 继承规则:                                                │
  │  • constraints: 全部继承 (必须遵守)                      │
  │  • conventions: 全部继承 (子 Room 可 override)           │
  │  • decisions/context/intent: 不继承 (仅 direct Room)     │
  └──────────────────────────────────────────────────────────┘
                         │
                         ▼
  Step 3: 排序 + 截断
  ┌──────────────────────────────────────────────────────────┐
  │ 排序 (type 优先级):                                      │
  │  1. constraints  (必须遵守)                               │
  │  2. decisions    (已做选择，不重复决策)                    │
  │  3. conventions  (团队约定)                               │
  │  4. context      (背景参考)                               │
  │  5. intent       (功能目标)                               │
  │ 同 type 内: qualityScore DESC                            │
  │                                                          │
  │ 截断 (~8000 token budget):                               │
  │  • constraints 全部保留 (不截断)                          │
  │  • decisions 按 score 截断                                │
  │  • conventions/context/intent 填满剩余空间               │
  │  • 超出 budget → 低 score 的 spec 被丢弃                 │
  └──────────────────────────────────────────────────────────┘
                         │
                         ▼
  Step 4: 拼装 Prompt
  ┌──────────────────────────────────────────────────────────┐
  │ system-prompt.md =                                       │
  │   agents/{role}.md (角色定义)                             │
  │ + 00-project-room specs (全局约定, 来自继承)              │
  │ + 相关 Room specs (按上述排序)                            │
  │                                                          │
  │ task-prompt.md =                                         │
  │   task 描述 (title, description, filesToModify)          │
  │ + retry context (如果是重试: 上次失败原因 + 反馈)        │
  │ + 额外上下文 (PR diff / Plan JSON / test results)        │
  │                                                          │
  │ → 打包为 tar → putArchive 注入容器                       │
  │   /home/agent/context/system-prompt.md                   │
  │   /home/agent/context/task-prompt.md                     │
  └──────────────────────────────────────────────────────────┘

  Step 5: 反馈闭环
  ┌──────────────────────────────────────────────────────────┐
  │ Agent 完成后 emit contextFeedback:                       │
  │ {                                                        │
  │   useful_specs:      ["constraint-02-03-001", ...]       │
  │   unnecessary_specs: ["context-08-infra-003", ...]       │
  │   missing:           ["how to handle .tscn conflicts"]   │
  │ }                                                        │
  │                                                          │
  │ 处理:                                                    │
  │  useful     → spec.qualityScore += 1.0                   │
  │  unnecessary→ spec.qualityScore -= 1.5                   │
  │  missing    → create draft spec in best Room             │
  │  score ≤ -10 → spec.state = archived (退出循环)          │
  │                                                          │
  │ 效果: 下次 spawn 时同一 Room 的 spec 排序会变化          │
  │  有用的排更前，没用的被截断掉或最终 archived             │
  └──────────────────────────────────────────────────────────┘
```

### E1.2 各阶段 Input / Output 总结

```
  ┌─────────────────────────────────────────────────────────────┐
  │              PHASE INPUT / OUTPUT                             │
  └─────────────────────────────────────────────────────────────┘

  ┌─────────────┬──────────────────────────┬──────────────────────────┐
  │ Phase       │ Input                    │ Output                   │
  ├─────────────┼──────────────────────────┼──────────────────────────┤
  │ PLAN        │ milestone goal           │ Plan JSON (3-7 tasks)    │
  │             │ + Room specs (via CB)    │ → validator → reviewer   │
  │             │ + 上轮 cycle 结果        │ → approved → apply-plan  │
  │             │ + codebase               │                          │
  ├─────────────┼──────────────────────────┼──────────────────────────┤
  │ IMPLEMENT   │ task 描述                │ PR (branch + GDScript    │
  │             │ + Room specs (via CB)    │  + L1 test)              │
  │             │ + codebase               │ + contextFeedback        │
  │             │ + retry context          │                          │
  ├─────────────┼──────────────────────────┼──────────────────────────┤
  │ TEST        │ PR branch                │ TestResult (L2/L3/L4)    │
  │             │ + Room specs (via CB)    │ + Screenshots            │
  │             │ + PRD 文档               │ fail → fix-task → retry  │
  ├─────────────┼──────────────────────────┼──────────────────────────┤
  │ REVIEW      │ PR diff                  │ verdict: approved /      │
  │ (code)      │ + Room specs (via CB)    │ changes-requested        │
  │             │                          │ reject → retry coder     │
  ├─────────────┼──────────────────────────┼──────────────────────────┤
  │ INTEGRATE   │ approved PR branches     │ merged commits on main   │
  │             │ + Room specs (via CB)    │ conflict → LLM 尝试解决  │
  │             │ + _tree.yaml 归属        │ → 解决不了 → re-queue    │
  ├─────────────┼──────────────────────────┼──────────────────────────┤
  │ RETROSPECT  │ merged PR diffs          │ new Specs (sediment)     │
  │             │ + Room/Spec data (via CB)│ → active / draft / 丢弃  │
  │             │ + _tree.yaml 归属        │ + Room metadata 更新     │
  └─────────────┴──────────────────────────┴──────────────────────────┘

  CB = Context Builder (每个阶段 spawn agent 前都会执行)

  每个 agent 的 prompt 构成:
  ┌──────────────────────────────────────────────────────────┐
  │ system-prompt.md                                         │
  │ ┌─ agents/{role}.md ──────────────────────────────────┐ │
  │ │ 角色定义 (你是 Coder / Tester / Reviewer / ...)     │ │
  │ └─────────────────────────────────────────────────────┘ │
  │ ┌─ 00-project-room specs (继承) ──────────────────────┐ │
  │ │ convention: GDScript 静态类型                        │ │
  │ │ convention: signal 规范                              │ │
  │ │ context: 项目概述                                    │ │
  │ │ context: 术语表                                      │ │
  │ └─────────────────────────────────────────────────────┘ │
  │ ┌─ Task 相关 Room specs ──────────────────────────────┐ │
  │ │ constraint: "概率≤15%" (from 04-03-mutation)        │ │
  │ │ decision: "用 Resource 不用 Dict" (from 04-03)      │ │
  │ │ convention: "PR body JSON" (from 02-02-coder)       │ │
  │ └─────────────────────────────────────────────────────┘ │
  │                                                          │
  │ task-prompt.md                                           │
  │ ┌─ Task 描述 + 上下文 ───────────────────────────────┐ │
  │ │ title, description, prdRefs, filesToModify          │ │
  │ │ + retry feedback (如果是重试)                        │ │
  │ │ + PR diff / Plan JSON / test results (按阶段不同)   │ │
  │ └─────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────┘
```

## E2. Container 生命周期（9 步）

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
  │                                 │
  │ → Save contextSnapshot on       │
  │   AgentRun:                     │
  │   { specIds, roomIds,           │
  │     knowledgeFiles,             │
  │     tokenCount, truncated }     │
  └──────────────┬──────────────────┘
                 ▼
  Step 2: CREATE
  ┌─────────────────────────────────┐
  │ docker.createContainer({        │
  │   Image: 'godot-agent:4.6.1',  │
  │   Env: [TASK_ID, CYCLE_ID,     │
  │         GITHUB_TOKEN, ...],     │
  │   Labels: {harness: agent},     │
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
  │   00-project-room specs         │
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

## E3. Job Queue 架构

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
  │  plan-review          │    │  reload               │
  │  curate-specs         │    │  cleanup-prs          │
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
  │    agents/, prd/, rooms/00-project-room/, docker/,           │
  │    rooms/_tree.yaml, project.godot, export_presets.cfg       │
  └─────────────────────────────────────────────────────────────┘

  Job Status Flow:
  pending ──► active ──► completed
                    └──► failed (+ retry if retryCount < maxRetries)

  并发模型:
  ┌──────────────────────────────────────────────────────────────┐
  │ 单进程模型 — 一个 Node.js 进程，一个 poll loop              │
  │                                                              │
  │ Job Claiming (原子操作):                                      │
  │  findOneAndUpdate({ status: 'pending' }, { status: 'active'})│
  │  MongoDB 原子性保证不会 double-claim                         │
  │                                                              │
  │ Poll 重入防护:                                                │
  │  processing = true/false boolean flag                        │
  │  当前 poll 未完成 → 下次 poll 跳过                           │
  │                                                              │
  │ 系统模式传播:                                                 │
  │  control.mode === 'killed' | 'paused'                        │
  │    → poll 立即返回，不 claim 任何 job                        │
  │                                                              │
  │ 多实例限制:                                                   │
  │  ✗ 不支持多 server 实例 — 会导致 job double-claim            │
  │  ✗ 无分布式锁                                                │
  │  当前设计: 单实例 + Docker Compose                           │
  └──────────────────────────────────────────────────────────────┘
```


## E4. 测试管线流程

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


## E5. SSE Event 架构

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

## E6. Docker Compose Stack

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


## E7. 错误恢复策略

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

### E7.1 启动恢复序列

```
  Server 重启时按顺序执行:
  ┌──────────────────────────────────────────────────────────────┐
  │ 0. control.startupReady = false                              │
  │    GET /api/health 返回 { startupReady: false }              │
  │    Dashboard 显示 "系统恢复中" banner                        │
  │    禁止创建新 cycle 直到 ready                               │
  │                                                              │
  │ 1. failInterruptedJobs()                                     │
  │    所有 status=active 的 jobs → 标记为 failed                │
  │    (server 崩溃时正在处理的 job 不可能完成)                   │
  │                                                              │
  │ 2. reconcileOrphans()                                        │
  │    扫描 Docker: 带 harness=agent label 的运行中容器          │
  │    匹配 AgentRun 文档 → 移除容器 → 如果预算内创建 retry job  │
  │                                                              │
  │ 3. reconcileSpending()                                       │
  │    从 AgentRun.costUsd 重新聚合实际花费                      │
  │    修正 Control.spentUsd 漂移                                │
  │                                                              │
  │ 4. recoverStaleTasks()                                       │
  │    找到 in-progress/in-review 但 agent run 已终止的 tasks    │
  │    → 创建 retry 或 advance job                               │
  │                                                              │
  │ 5. control.startupReady = true                               │
  │    recovery 摘要写入 DB:                                     │
  │    { orphansFound, jobsFailed, tasksRecovered, spentRecalc } │
  │    Dashboard Home 显示上次 recovery 摘要                     │
  │    → 开始正常 poll loop                                      │
  └──────────────────────────────────────────────────────────────┘
```

### E7.2 运行时错误处理

```
  ┌──────────────┬────────────────────────┬──────────────────────┐
  │ 错误          │ 检测                    │ 处理                  │
  ├──────────────┼────────────────────────┼──────────────────────┤
  │ OOM          │ exit code 137          │ status: failed       │
  │              │                        │ → retry (不增内存)    │
  │              │                        │                      │
  │ Timeout      │ role-based deadline    │ container.kill()     │
  │              │ (ROLE_TIMEOUT_MS map)  │ status: timeout      │
  │              │                        │ → retry              │
  │              │                        │                      │
  │ Rate limit   │ stdout 扫描:           │ Control.mode=paused  │
  │              │ "hit your limit" /     │ 全系统暂停           │
  │              │ "rate limit" /         │ 不 retry（需人工恢复）│
  │              │ "overloaded"           │                      │
  │              │                        │                      │
  │ Stale job    │ 每次 poll 检查 job age │ 超过 role timeout    │
  │              │ vs role timeout        │ → 标记 failed        │
  └──────────────┴────────────────────────┴──────────────────────┘
```

### E7.3 重试策略

```
  ┌──────────────────────────────────────────────────────────────┐
  │ 重试上限 (所有 retry 最多 2 次):                              │
  │  Orchestrator:    MAX_PLAN_RETRIES = 2 (validator/reviewer)  │
  │  Coder 重试:      MAX_RETRY_CODER_RUNS = 2                  │
  │  Review 循环:     MAX_REVIEW_CYCLES = 2                      │
  │  Test 重试:       MAX_TEST_RETRIES = 2                       │
  │  全局重试帽:      MAX_GLOBAL_RETRIES = 4 (TEST + REVIEW 合计)│
  │  Job 级重试:      maxRetries = 2 per job                     │
  │                                                              │
  │ 重试方式: 立即重新入队，无 exponential backoff                │
  │ 重试关系: 新建 AgentRun，关联到同一个 Task                   │
  │ 超限后:   Task 标记 blocked，需人工干预                      │
  └──────────────────────────────────────────────────────────────┘
```

### E7.4 预算保护

```
  ┌──────────────────────────────────────────────────────────────┐
  │ 双层保护:                                                     │
  │                                                              │
  │ Layer 1 — Per-run budget ($5 default)                        │
  │  Claude Code CLI 内置 --max-cost 参数                        │
  │                                                              │
  │ Layer 2 — Global spending cap                                │
  │  ┌─────────────────────────────────────────────────────┐     │
  │  │ 80% threshold → system auto-pause                   │     │
  │  │   SSE broadcast: system:spending_warning             │     │
  │  │   action: 'paused'                                   │     │
  │  │                                                      │     │
  │  │ 100% threshold → hard cap                           │     │
  │  │   SSE broadcast: system:spending_warning             │     │
  │  │   action: 'hard_cap'                                 │     │
  │  │   所有新 job 拒绝执行                                │     │
  │  └─────────────────────────────────────────────────────┘     │
  │                                                              │
  │ Startup 校准: reconcileSpending() 从 AgentRun 重新聚合      │
  └──────────────────────────────────────────────────────────────┘
```

## E8. Ludus 自测架构

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  HARNESS SELF-TESTING                         │
  └─────────────────────────────────────────────────────────────┘

  测试框架: Vitest
  测试目录: apps/server/tests/ (镜像 src/ 结构)
  CI:       .github/workflows/ci.yml (TypeScript lint + test)

  Game-side 测试 (由 Tester agent 在容器内执行):
  ┌──────────────────────────────────────────────────────────────┐
  │ L1: GUT 单元测试     godot --headless, 3 min timeout       │
  │ L2: 集成测试         headless + node tree snapshot          │
  │ L3: 视觉测试         screenshots + AI analysis              │
  │ L4: PRD 合规         formula / threshold check              │
  └──────────────────────────────────────────────────────────────┘

  当前覆盖 gap:
  ┌──────────────────────────────────────────────────────────────┐
  │ ✗ 无 Agent 行为 integration test (agent 输出不可预测)       │
  │ ✗ 无 e2e test (full cycle: plan→code→test→review→merge)     │
  │ ✗ Context Builder 选择逻辑无专门测试                        │
  │ ✗ Plan Validator constraint 覆盖不完整                      │
  └──────────────────────────────────────────────────────────────┘
```

## E9. Auto Mode

```
  ┌─────────────────────────────────────────────────────────────┐
  │                    AUTO MODE — 无人值守运行                    │
  └─────────────────────────────────────────────────────────────┘

  目标: 系统能完全自动跑，每个"等人"的场景都有合理默认行为。
  人可以随时介入 override，但不介入时系统不会卡死。

  Dashboard Control 页面切换:
  ┌──────────────────────────────────────────────────────────┐
  │ Operation Mode: [Auto ▼]                                 │
  │                                                          │
  │   Auto     — 全自动，所有场景有默认行为，不等人          │
  │   Supervised — 关键操作等人审批，其他自动                 │
  │   Manual   — 所有操作都等人审批                          │
  └──────────────────────────────────────────────────────────┘

  ══ 每个场景的 Auto 默认行为 ═════════════════════════════════

  ┌──────────────────────┬──────────────┬──────────────┬──────────────┐
  │ 场景                  │ Auto         │ Supervised   │ Manual       │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Job 审批              │ auto-approve │ 看 category: │ 全等人       │
  │ (普通 job)           │              │ protected →  │              │
  │                      │              │ 等人, 其他   │              │
  │                      │              │ auto-approve │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Job 审批              │ auto-approve │ 等人         │ 等人         │
  │ (protected paths)    │ (信任 agent) │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Plan review          │ reviewer     │ 等人确认     │ 等人确认     │
  │ (Orchestrator plan)  │ approved →   │              │              │
  │                      │ auto-approve │              │              │
  │                      │ (跳过 human  │              │              │
  │                      │  review)     │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Plan questions       │ 用 default   │ 等人回答     │ 等人回答     │
  │ (Orchestrator 问题)  │ answers      │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Draft spec 确认      │ auto-archive │ 等人确认     │ 等人确认     │
  │ (Curator conf       │ after 5      │              │              │
  │  0.50-0.74)         │ cycles       │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Rate limit           │ pause →      │ pause →      │ pause →      │
  │                      │ 等 10 min →  │ 等人 unpause │ 等人 unpause │
  │                      │ auto-resume  │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Spending 80%         │ pause →      │ pause →      │ pause →      │
  │                      │ 通知 Discord │ 等人决定     │ 等人决定     │
  │                      │ 不 auto-     │              │              │
  │                      │ resume (钱   │              │              │
  │                      │ 的事要人管)  │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Cycle 失败           │ auto-create  │ 等人审批     │ 等人审批     │
  │ (all tasks failed)   │ next-cycle   │ next-cycle   │ next-cycle   │
  │                      │ (retry 同    │              │              │
  │                      │  milestone)  │              │              │
  ├──────────────────────┼──────────────┼──────────────┼──────────────┤
  │ Cycle 完成           │ auto-create  │ auto-create  │ 等人决定     │
  │ → next cycle         │ next-cycle   │ next-cycle   │ 是否继续     │
  └──────────────────────┴──────────────┴──────────────┴──────────────┘

  ══ Auto Mode 安全边界 ══════════════════════════════════════

  即使 Auto Mode，以下永远不会自动通过:
  ┌──────────────────────────────────────────────────────────┐
  │ • Spending 80% — 钱的决定必须人做                       │
  │   auto-pause + Discord 通知，但不 auto-resume            │
  │                                                          │
  │ • per-task spending > $20 — 标记 blocked，不再 retry    │
  │   单个 task 不能无限烧钱                                 │
  │                                                          │
  │ • MAX_GLOBAL_RETRIES = 4 — retry 上限仍然有效           │
  │   auto mode 不会绕过 retry cap                          │
  │                                                          │
  │ • 连续 2 个 cycle 失败 → auto 降级为 supervised         │
  │   可能有系统性问题，需要人看                             │
  └──────────────────────────────────────────────────────────┘

  ══ Rate Limit Auto-Resume ══════════════════════════════════

  Auto Mode 下 rate limit 的恢复流程:
  ┌──────────────────────────────────────────────────────────┐
  │ rate limit detected                                      │
  │   │                                                      │
  │   ▼                                                      │
  │ mode: paused                                             │
  │ 记录: pausedAt = now, pauseReason = "rate_limit"         │
  │   │                                                      │
  │   ▼                                                      │
  │ 等待 RATE_LIMIT_COOLDOWN_MS (default: 10 min)            │
  │   │                                                      │
  │   ▼                                                      │
  │ auto-resume: mode = "running"                            │
  │ Discord 通知: "系统已自动恢复 (rate limit cooldown)"     │
  │   │                                                      │
  │   ▼                                                      │
  │ 如果再次 rate limit → cooldown × 2 (exponential backoff) │
  │ 连续 3 次 rate limit → 不再 auto-resume，等人            │
  │ Discord: "连续 rate limit，需人工检查"                   │
  └──────────────────────────────────────────────────────────┘

  ══ 配置 ════════════════════════════════════════════════════

  ┌──────────────────────────────────────────────────────────┐
  │ OPERATION_MODE=auto | supervised | manual                │
  │                                                          │
  │ # Auto mode 参数                                         │
  │ RATE_LIMIT_COOLDOWN_MS=600000        # 10 min            │
  │ RATE_LIMIT_MAX_AUTO_RESUME=3         # 连续 3 次后停     │
  │ DRAFT_SPEC_AUTO_ARCHIVE_CYCLES=5     # 5 cycle 后清理    │
  │ FAILED_CYCLE_AUTO_RETRY=true         # 失败后自动重来    │
  │ CONSECUTIVE_FAIL_DOWNGRADE=2         # 连续失败降级阈值  │
  │                                                          │
  │ # 所有 mode 共享                                         │
  │ DISCORD_WEBHOOK_URL=                 # 通知              │
  │ SPENDING_CAP_USD=500                 # 预算上限          │
  └──────────────────────────────────────────────────────────┘
```


# Zombie Farm AI Ludus — PRD

## 1. 产品概述

一个 **AI 驱动的游戏开发管线**，6 个专业 AI agent 协作开发 Zombie Farm（Godot 4.6.1 僵尸农场游戏）。系统在有限的人工监督下自主运行开发周期：规划任务、编写 GDScript 代码、测试、审查、合并、提炼知识 — 循环往复。

### 核心理念

**系统构建自身。** 人工完成 bootstrap 后，agents 维护和改进自己的代码、prompts 和流程。人类在每个决策点保持参与，系统通过证明可靠性来逐步赢得自主权。

### 目标用户

- **主用户：** 项目 owner（Victor），通过 Dashboard 监控和审查 agent 工作
- **间接用户：** 6 个 AI agents，作为系统的执行者消费 PRD、knowledge 和 Feature Room specs

## 2. 核心问题

### 为什么需要这个系统

手动开发一个完整游戏耗时巨大。AI agents 可以 24/7 并行工作，但需要：
- **结构化流程** 防止 agents 产生低质量或偏离目标的代码
- **人工审查** 防止架构漂移和微妙 bug 积累
- **持久化知识** 让 agents 不重复犯同样的错误
- **成本控制** 防止 agent spending 失控

### Erika v1 的教训

| v1 失败 | v2 应对 |
|---------|--------|
| 浅层可观测性 — 只看到状态，看不到推理过程 | Structured JSON streaming 捕获每个 tool call 和决策 |
| Human intervention 太窄太晚 — 只能 approve/reject 成品 | 每个 PR 都有 diff + agent reasoning 并排展示 |
| PR 自动合并导致架构漂移 | Bootstrap 期间每个 PR 人工审查 |
| 过度基础设施复杂度 | 简化到 9 步容器生命周期，standalone MongoDB |
| 无成本可见性 | 从 day one 内建 cost tracking |

## 3. Agent 团队

| Agent | 职责 | 输入 | 输出 |
|-------|------|------|------|
| **Orchestrator** | 读取 milestones/PRD/Room specs，生成 3-7 task plan | Cycle goal, knowledge context | Structured plan JSON |
| **Coder** | 实现 GDScript 代码 + L1 GUT 单元测试 | Task spec, Room constraints | Branch + PR with structured body |
| **Tester** | 执行 L2/L3/L4 测试，失败时创建 fix tasks | PR branch, test config | TestResult + Screenshots |
| **Reviewer** | 7-item checklist 评审 PR | PR diff, task spec | Verdict (approved / changes-requested) |
| **Integrator** | 拓扑排序合并 approved PRs，解决冲突 | Approved PRs list | Merged branches |
| **Curator** | 从 PR diffs 提炼 knowledge，写入 Feature Rooms | Cycle diffs, knowledge inbox | Updated Room specs |

## 4. 开发周期

每个 cycle 是一个有明确目标的 bounded work unit，包含 3-7 个 tasks。

### 5 个 Phase

```
plan → implement → review → integrate → retrospect
```

1. **Plan** — Orchestrator 分解 cycle goal 为 3-7 个 tasks with dependencies
2. **Implement** — Coder agents 并行在隔离 branches 上实现 tasks
3. **Review** — Tester 执行 L2-L4 测试 → Reviewer 评审 PR → Human 最终审查
4. **Integrate** — Integrator 按依赖顺序合并 approved PRs，解决冲突
5. **Retrospect** — 自动生成 retrospective，Curator 处理 knowledge inbox

### Cycle 失败路径

所有 tasks 都失败 → cycle 标记 `failed` → 不 spawn integrator → 创建 `next-cycle` job（需 human approval）

## 5. 测试管线

4 层测试，Quick-fail 原则：

| Layer | 什么 | 谁执行 | Timeout |
|-------|------|--------|---------|
| L1 | GUT 单元测试 | Coder (pre-PR) | 3 min |
| L2 | Headless 集成测试 | Tester | 2 min |
| L3 | Visual 测试 + 截图 (Phase 5+) | Tester | 5 min |
| L4 | PRD compliance（公式验证） | Tester | 与 L2 并行 |

- L1 fail → 跳过 L2/L3/L4
- L2 fail → 跳过 L3
- L4 与 L2 独立并行

## 6. 人工审查

### Bootstrap 期间
- **每个 change** 都经过人工审查
- Dashboard 展示 PR diff + agent reasoning 并排

### Progressive Autonomy
- `autoApprovalCategories` 控制哪些 task type 可以跳过人工审查
- 第一个候选：`chore`（依赖更新、格式化、config 调整）
- **不可变规则：** 结构性变更、agent 自我修改、guardrail 变更 **永远需要** human approval
- Protected paths：`agents/`, `prd/`, `knowledge/boot.md`, `docker/`, `rooms/_tree.yaml`

## 7. 知识系统

### 持久化知识类别

| Category | 用途 |
|----------|------|
| skills | 可复用的问题解决模式 |
| decisions | 架构选择 + 被拒绝的替代方案 |
| specs | Feature Room 规格 |
| journal | 过程日志 |
| inbox | Agents 标记的待处理条目 |
| retrospectives | 自动生成的 cycle 总结 |

### Quality Score Feedback Loop

每次 agent run 后解析 `contextFeedback`：
- 标记 useful → +1.0
- 标记 unnecessary → -1.5
- `score = score * 0.95 + delta`，clamp 到 [-10, 100]

高分文件优先注入 context，低分文件逐步淘汰。

## 8. Feature Rooms

Agents 产生和消费的 game design knowledge layer：

```
rooms/{room-name}/
├── room.yaml          # 元数据
├── spec.md            # Human Projection（decisions, constraints, context, interface）
├── progress.yaml      # 进度追踪
└── specs/             # Spec Objects (intent, decision, constraint, contract, convention, change, context)
```

- Curator 在 retrospect 阶段写入 decisions/constraints
- Orchestrator 和 Coder 在 planning/implementation 时读取
- `_tree.yaml` 是 Room 树唯一索引

## 9. 成本控制

- 每次 agent run 有 budget cap（默认 $5，CLI `--max-budget-usd`）
- `Control.spentUsd` 原子递增
- **80% 软警告：** emit SSE event，auto-pause
- **100% 硬上限：** block new spawns，需 human approval 继续
- Startup 时 reconciliation：sum 所有 `AgentRun.costUsd` vs `Control.spentUsd`

## 10. 可观测性

### Dashboard Pages

| Page | 功能 |
|------|------|
| Home | 系统状态、active cycle、spending、mode |
| Cycles | Cycle 列表、phase 进度、task 状态 |
| Tasks | 可排序任务列表、依赖关系、retry history |
| Agents | Agent run 列表、live stream viewer |
| Tests | L1-L4 测试结果、performance metrics |
| Jobs | Queue 状态、approve/reject interface |
| Knowledge | 按 category 浏览、quality scores |
| Review | PR diff + agent reasoning 并排审查 |
| Milestones | M0-M15 进度追踪 |
| Assets | Godot asset 验证和清单 |
| Control | System mode、spending cap、kill agents |

### 实时 Streaming

- Claude Code `stream-json` NDJSON → 后端实时解析 → SSE 推送到 Dashboard
- Event types：text, tool_use, tool_result, error, completion, system
- 只持久化 complete turns，streaming deltas 只通过 SSE 广播

## 11. 技术约束

| 决策 | 选择 | 理由 |
|------|------|------|
| 语言 | TypeScript (strict) | v1 验证过，agents 推理良好 |
| 数据库 | MongoDB standalone | 灵活 schema，无 replica set |
| 后端 | Express | 最小表面积 |
| 前端 | Next.js (App Router) | SSR + streaming |
| 实时 | SSE | 单向推送，原生浏览器重连 |
| LLM | Claude Code CLI | 完整工具访问 |
| Agent 隔离 | Docker | 不可协商的安全边界 |
| CI/CD | GitHub Actions | PR 自动测试 |
| Game Engine | Godot 4.6.1 | 锁定版本，全环境一致 |
| 测试框架 | GUT 9.x | GDScript 原生测试 |

## 12. 里程碑映射

Ludus 系统服务于 Zombie Farm 游戏的 M0-M15 里程碑：

- M0-M7：已完成（React 版本）
- M8：Mutations & Evolution（开发中）
- M9a-M15：待 Godot 版本实现

Ludus 的每个 cycle 对应一个或多个 milestone 的子任务。Orchestrator 从 `milestones/` 读取当前目标。

## 13. 成功标准

1. **Cycle 完成率 > 70%** — 大多数 cycle 至少有 1 个 task 成功
2. **First-pass review rate > 50%** — 一半以上 PR 首次通过 Reviewer
3. **成本可预测** — 单 cycle 成本在 $10-50 范围内
4. **知识积累** — quality score 前 10 的 knowledge files 保持稳定有用
5. **Progressive autonomy** — 3 个月内 `chore` 类任务 earn auto-approval

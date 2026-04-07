# Known Issues — 已知问题与解决方案

实际使用中会遇到的问题、影响、解决方案。按严重程度排序。

## 严重 — 会卡住系统

### I2. .tscn Merge Conflict

```
  实际风险很低，因为有多层防线:
  ┌──────────────────────────────────────────────────────────────┐
  │ Layer 1: Orchestrator — plan 时避免文件重叠              │
  │ Layer 2: plan-validator — .tscn 重叠 warn               │
  │ Layer 3: Reviewer (plan-review) — 审查 task 依赖合理性  │
  │ Layer 4: Integrator — 冲突时 LLM 尝试自己解决           │
  │ Layer 5: re-queue — Coder 在新 baseline 重写 (max 2次)  │
  └──────────────────────────────────────────────────────────────┘

  能到达 Integrator 的冲突已经很少。
  Integrator 能自己解决大部分（读 conflict markers + import 验证）。
  解决不了 → re-queue 1 次通常搞定（新 baseline 含已 merge 的改动）。
  re-queue 2 次仍失败 → task: blocked → 说明 task 拆分有问题。

  前端可见:
  ┌──────────────────────────────────────────────────────────────┐
  │ SSE: task:conflict_requeued { taskId, conflictFiles }   │
  │ Dashboard Tasks 页面: ⚠ 冲突标记 + 文件列表 + attempt   │
  └──────────────────────────────────────────────────────────────┘

  进一步优化 (optional):
  ┌──────────────────────────────────────────────────────────────┐
  │ plan-validator: .tscn 互斥从 warn → block               │
  │ .tscn tasks 强制 blockedBy 串行                         │
  └──────────────────────────────────────────────────────────────┘
```

### I4. 一个 Broken Task 吃掉大量预算

```
  问题:
  ┌──────────────────────────────────────────────────────────────┐
  │ MAX_GLOBAL_RETRIES=3 是全 cycle 共享，不是 per-task      │
  │ 单 task 最多 retry 1 次 (MAX_TEST_RETRIES=1)            │
  │ 但仍可能 2 个 broken tasks 各用 1 次吃掉全局额度        │
  └──────────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────────┐
  │ 1. per-task retry cap (已实现):                           │
  │    MAX_TEST_RETRIES = 1, MAX_REVIEW_CYCLES = 1           │
  │    单个 task 最多 retry 1 次 → 再失败直接 blocked       │
  │                                                          │
  │ 2. global cap 作为安全网 (已实现):                       │
  │    MAX_GLOBAL_RETRIES = 3                                │
  │    per-task 1 + global 3 = 双重保护                     │
  │                                                          │
  │ 3. per-task spending cap:                                │
  │    单个 task 累计花费 > $20 → 标记 blocked              │
  │                                                          │
  │ 4. Dashboard: 显示 per-task 花费，异常标红              │
  └──────────────────────────────────────────────────────────────┘
```

## 中等 — 用久了会出问题（1-3 个月后）

### I6. Spec 互相矛盾没有检测

```
  问题:
  ┌──────────────────────────────────────────────────────────────┐
  │ 00-project-room: constraint "FPS ≥ 30"                  │
  │ 02-03-tester:    constraint "FPS ≥ 60"  (Curator 新写)  │
  │                                                          │
  │ Agent 收到两条 constraint，不知道听谁的                  │
  └──────────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────────┐
  │ 1. Context Builder 注入时去重:                           │
  │    子 Room spec 覆盖父 Room 的同类 spec (更具体的优先)  │
  │                                                          │
  │ 2. Curator 写入时:                                       │
  │    新 spec 标记 supersedes: old-spec-id                  │
  │    旧 spec 自动 archived                                 │
  │                                                          │
  │ 3. Dashboard: 检测到潜在冲突 → ⚠ 标记                   │
  └──────────────────────────────────────────────────────────────┘
```

### I7. 僵尸 Spec — 没人引用的 spec 永远 active

```
  保险机制 — 正常情况下 Curator 会通过 supersedes 更新旧 spec。
  衰退只是给 Curator 覆盖不到的边缘 spec 兜底。

  问题:
  ┌──────────────────────────────────────────────────────────────┐
  │ 正常退场: Curator 写新 spec + supersedes 旧 spec → 旧的 │
  │ archived。大部分知识通过这个机制自然更新。               │
  │                                                          │
  │ 边缘情况: 某条 spec 长期没有相关 task → Curator 也不会   │
  │ 碰它 → 没有 useful/unnecessary 反馈 → 永远 active       │
  │ 例: "farm scene FPS ≥ 30" 但 farm 已重构，无人再碰      │
  └──────────────────────────────────────────────────────────────┘

  保险机制:
  ┌──────────────────────────────────────────────────────────────┐
  │ 1. 引用衰减 (自动):                                      │
  │    连续 10 cycle 未被任何 agent 引用                     │
  │    → qualityScore 每 cycle -0.5                          │
  │    → 最终 score ≤ -10 → archived                        │
  │    优先级低 — Curator supersedes 是主要退场机制          │
  │                                                          │
  │ 2. Dashboard 批量清理 (手动):                            │
  │    Rooms 页面 [Archive All Stale] 一键清理               │
  └──────────────────────────────────────────────────────────────┘
```

### I13. Implement 阶段任务依赖串行瓶颈 🆕

```
  来源: Cycle 17 实际运行数据

  问题:
  ┌──────────────────────────────────────────────────────────────┐
  │ Cycle 17 implement 阶段 20 min（占总时间 45%）:          │
  │                                                          │
  │ 04:24  TASK-033 开始 (无依赖)                            │
  │ 04:28  TASK-033 完成 → unblock 034 + 036                 │
  │ 04:28  TASK-034 + TASK-036 并行开始                      │
  │ 04:37  034 + 036 完成 → unblock 035                      │
  │ 04:37  TASK-035 开始                                     │
  │ 04:44  TASK-035 完成                                     │
  │                                                          │
  │ 3 级串行关键路径: 033 → (034|036) → 035                  │
  │ Agent pool = 2 槽位，4 个任务最多 2 个并行               │
  │                                                          │
  │ 如果 4 个任务完全并行，implement 约 8 min 而非 20 min    │
  └──────────────────────────────────────────────────────────────┘

  解决方向:
  ┌──────────────────────────────────────────────────────────────┐
  │ 1. Orchestrator 拆分任务时减少不必要的依赖               │
  │    在 orchestrator.md 强调: 能并行就并行，              │
  │    只有真正的数据依赖才加 blockedBy                      │
  │                                                          │
  │ 2. 动态 agent pool:                                      │
  │    implement 阶段临时扩到 3-4 槽位                       │
  │    review/integrate 阶段回到 2 槽位                      │
  │                                                          │
  │ 3. 监控: 记录 implement 关键路径长度                     │
  │    Analytics 页面显示 parallelism ratio                  │
  │    (实际并行度 / 理想并行度)                              │
  └──────────────────────────────────────────────────────────────┘
```

### I14. Discord 通知未实现阻碍 Auto Mode 🆕

```
  问题:
  ┌──────────────────────────────────────────────────────────────┐
  │ Auto Mode (E9) 设计上依赖 Discord webhook 通知:          │
  │   • rate limit auto-resumed                              │
  │   • spending 80% paused                                  │
  │   • cycle failed → auto-retry                            │
  │   • 连续 2 cycle 失败 → 降级为 supervised                │
  │                                                          │
  │ 但 Discord webhook 从未实现。                             │
  │ Auto Mode 运行时如果出问题，人完全不知道。               │
  │                                                          │
  │ 影响: Auto Mode 实际是 "盲跑" — 无法放心启用             │
  └──────────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────────┐
  │ 实现量约 50 行 TypeScript:                               │
  │ 1. 新建 apps/server/src/services/notifier.ts             │
  │ 2. 监听 SSE 关键事件 → POST Discord webhook             │
  │ 3. 配置: DISCORD_WEBHOOK_URL 在 .env                     │
  │ 4. 空则不发 (graceful no-op)                             │
  │                                                          │
  │ P0 — Auto Mode 的前置条件                                │
  └──────────────────────────────────────────────────────────────┘
```

## 一般 — 体验不好但不致命

### I8. Context 不确定性，Debug 困难

```
  实际风险:
  ┌──────────────────────────────────────────────────────────────┐
  │ 低。同一 cycle 内 specs 不变:                            │
  │  • Curator 只在 RETROSPECT 阶段写 spec                  │
  │  • IMPLEMENT 阶段多个 Coder 并行时 specs 不会变化       │
  │  • 唯一例外: 人工在 Dashboard 中途改了 spec              │
  │    (但这是你主动的操作，你知道改了什么)                   │
  └──────────────────────────────────────────────────────────────┘

  仍建议做 context 快照 (方便回溯 debug):
  ┌──────────────────────────────────────────────────────────────┐
  │ AgentRun 记录注入了哪些 specs:                           │
  │ agentRun.contextSnapshot = {                             │
  │   specIds: [...], roomIds: [...],                        │
  │   tokenCount, truncated: [...]                           │
  │ }                                                        │
  │                                                          │
  │ Dashboard Agents 页面: 显示 agent 看到了哪些 specs       │
  └──────────────────────────────────────────────────────────────┘
```

### I9. 容器 Orphan 只有启动时检测

```
  问题: 运行中 container 死了 → Launcher 不知道 → 等 timeout

  解决方案:
  ┌──────────────────────────────────────────────────────────────┐
  │ Spawner WAIT 阶段每 30s docker inspect container        │
  │ 不是 running → 立即标记 failed + retry                  │
  └──────────────────────────────────────────────────────────────┘
```

### I10. 不区分永久错误和临时错误

```
  问题: 永久错误 (task 描述错) 也 retry 2 次，浪费 $10

  解决方案:
  ┌──────────────────────────────────────────────────────────────┐
  │ Agent completion 附带 error_type:                        │
  │   permanent → 不 retry，直接 blocked                    │
  │   transient → 正常 retry                                │
  │   unknown → retry 1 次，相同错误 → blocked              │
  └──────────────────────────────────────────────────────────────┘
```

### I15. Retry 无 Exponential Backoff 🆕

```
  问题:
  ┌──────────────────────────────────────────────────────────────┐
  │ 当前: agent 失败后立即 retry (job 入 pending 队列)       │
  │ 如果失败原因是外部依赖不可用 (GitHub API / Claude API)   │
  │ 立即 retry 大概率再次失败，浪费 cost                     │
  │                                                          │
  │ F5 已知 gap: "✗ 无 exponential backoff"                  │
  │ "重试立即执行，可能加剧 rate limit"                       │
  └──────────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────────┐
  │ Job 增加 notBefore 字段:                                 │
  │   retry 1 → notBefore = now + 30s                        │
  │   retry 2 → notBefore = now + 2min                       │
  │   retry 3 → notBefore = now + 10min                      │
  │                                                          │
  │ Poll loop 过滤: status=pending AND notBefore ≤ now       │
  │ 实现量: ~10 行改动 (Job schema + poll query)             │
  └──────────────────────────────────────────────────────────────┘
```

---

## 已归档 — 已在设计/实现中解决

<details>
<summary>展开查看已解决的问题</summary>

### ~~I1. 系统暂停了没人知道~~ ✅ 已解决

Auto Mode (E9) 处理: rate limit → pause → auto-resume (exponential backoff), cycle 失败 → auto-retry, draft spec → 5 cycle auto-archive, plan questions → default answers, job 审批 → auto-approve。Discord 通知拆分为 I14 单独跟踪。

### ~~I3. Orchestrator Q&A 后被 Validator Reject 导致卡死~~ ✅ 已解决

02-execution.md E1 修复: Q&A → plan → validator fail → 回到 Q&A (附 validator 错误信息)，不消耗 retry。只有 Human Review 的 [Request Changes] 消耗 retry。

### ~~I5. Draft Specs 积灰无人处理~~ ✅ 已解决

Auto Mode (E9): draft 超过 5 个 cycle 未处理 → auto-archive。Supervised/Manual 模式下仍需人工确认。

### ~~I11. Dashboard 缺少关键视图~~ ✅ 已解决

整合到 06-dashboard.md D1: Home (pending approvals + draft specs + cycle 花费), Analytics (per-task spending + 失败原因 top 5 + spec 变更历史), Rooms ([Archive All Stale] + spec 时间线)。Dashboard 已实现 9 个页面视图。

### ~~I12. 重启后恢复不透明~~ ✅ 已解决

整合到 02-execution.md E7.1 + 01-architecture.md A6: startupReady flag, GET /api/health 返回 startupReady + lastRecovery, Home 页面 "系统恢复中" banner。

</details>

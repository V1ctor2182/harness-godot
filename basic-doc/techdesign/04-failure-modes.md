# Failure Modes — 故障模式与恢复

故障分类 (F1)、级联场景 (F2)、外部依赖 (F3)、并发风险 (F4)、已知 gap (F5)。

## F1. 故障分类

```
  ┌──────────────────┬─────────────────────────┬──────────────────────┬──────────┬──────────────────────────────────────────┐
  │ 故障类型          │ 检测机制                 │ 恢复策略              │ 重试上限  │ 边界情况                                  │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Container OOM    │ exit code 137           │ retry                │ 2        │ 如果反复 OOM 说明任务本身超出内存，        │
  │ (exit 137)       │                         │                      │          │ 无 memory 自动升级                        │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Container        │ role-based deadline     │ kill + retry         │ 2        │ timeout 后容器可能已产出部分输出            │
  │ timeout          │ (ROLE_TIMEOUT_MS)       │                      │          │ （如 PR），需检查 partial output           │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Rate limited     │ stdout 文本扫描          │ 全系统 pause，       │ 0        │ 需人工 unpause，in-flight 容器继续运行      │
  │                  │ ("hit your limit" /     │ 不 retry             │          │ 直到自然结束                              │
  │                  │  "rate limit" /         │                      │          │                                          │
  │                  │  "overloaded")          │                      │          │                                          │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Orphan container │ startup label scan      │ 移除容器 +           │ —        │ 仅 startup 检测，运行时无心跳              │
  │                  │ (harness=agent)     │ 创建 retry job       │          │                                          │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Stale job        │ 每次 poll 检查 job age  │ 标记 failed          │ —        │ 如果 timeout 值配置错误会误判              │
  │                  │ vs role timeout         │                      │          │                                          │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Merge conflict   │ Integrator git merge    │ 重新排队 task        │ —        │ 可能循环冲突                              │
  │                  │ --no-commit dry-run     │                      │          │                                          │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Plan invalid     │ plan-validator          │ 1 次 replan → 人工   │ 1        │ Orchestrator 理解错误会反复 invalid        │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Plan review      │ Reviewer plan-review    │ Replan with feedback │ 1        │ Reviewer 和 validator 各自独立                │
  │ rejected         │ verdict: changes-req    │ (1 retry) → 人工     │          │ reject — 合计 Orchestrator 最多跑 2 次       │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ All tasks failed │ review phase check      │ cycle=failed +       │ —        │ 人工不介入则系统停滞                       │
  │                  │                         │ 人工审批 next-cycle  │          │                                          │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ Spending overrun │ 80%/100% threshold      │ 80% auto-pause,     │ —        │ 如果单次 run 超过剩余额度，               │
  │                  │ check                   │ 100% hard block     │          │ 会先执行再报超                            │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ PR body invalid  │ validate_pr_body.py     │ retry with feedback  │ 2        │ 格式错误可能每次都犯                       │
  ├──────────────────┼─────────────────────────┼──────────────────────┼──────────┼──────────────────────────────────────────┤
  │ No PR created    │ output parse 无 PR URL  │ retry with explicit  │ 2        │ Coder 可能理解任务为"不需要 PR"            │
  │                  │                         │ instruction          │          │                                          │
  └──────────────────┴─────────────────────────┴──────────────────────┴──────────┴──────────────────────────────────────────┘
```

## F2. 级联故障场景

### F2.1 Budget 耗尽

一个 broken task 的最坏情况花费链:

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    WORST-CASE COST CHAIN (1 task)                       │
  └─────────────────────────────────────────────────────────────────────────┘

  Attempt 1:
  ┌──────────┐  fail  ┌──────────┐
  │  Coder   │──────►│  Coder   │  2 coder runs × $5
  │  run 1   │ retry │  run 2   │  = $10
  └──────────┘       └────┬─────┘
                              │ PR created (finally)
                              ▼
                       ┌──────────┐  fail
                       │  Tester  │──────► create-fix-task
                       │  run 1   │        $5
                       └──────────┘

  Attempt 2 (fix task):
  ┌──────────┐  PR   ┌──────────┐  fail  ┌──────────┐  reject
  │  Coder   │─────►│  Tester  │──────►│ fix-task  │────────►
  │  run 3   │ $5   │  run 2   │  $5   │  Coder 4  │  $5
  └──────────┘      └──────────┘       └────┬──────┘
                                            │
                                            ▼
                                     ┌──────────┐  pass  ┌──────────┐  reject
                                     │  Tester  │──────►│ Reviewer │────────►
                                     │  run 3   │  $5   │  run 1   │  $5
                                     └──────────┘       └──────────┘

  ... cycle continues ...

  ┌──────────────────────────────────────────────────────────────────────────┐
  │ Worst case per task:                                                     │
  │   ~12 agent runs × $5/run = $60                                         │
  │                                                                          │
  │ Chain: coder fail → retry → test fail → retry → review reject →         │
  │        retry coder → test → review → ... until cap                      │
  │                                                                          │
  │ 两层保护:                                                                │
  │   1. MAX_GLOBAL_RETRIES = 4 — caps total TEST + REVIEW retries per task │
  │   2. Spending cap 80% auto-pause — 全局最终安全网                        │
  └──────────────────────────────────────────────────────────────────────────┘
```

### F2.2 Rate Limit 连锁

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    RATE LIMIT CASCADE                                    │
  └─────────────────────────────────────────────────────────────────────────┘

  正常运行中，3 个 agent 容器并行执行
       │
       │  Coder-2 stdout 检测到 "rate limit"
       ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Stream Capture 检测到 rateLimited                                    │
  │   → Control.mode = 'paused'                                         │
  │   → SSE broadcast: system:rate_limited                              │
  │   → Poll loop 停止 claim 新 job                                     │
  └──────────────────────────────────────────────┬───────────────────────┘
                                                 │
               ┌─────────────────────────────────┤
               │                                 │
               ▼                                 ▼
  ┌──────────────────────┐          ┌──────────────────────┐
  │ Coder-1 (in-flight)  │          │ Tester-1 (in-flight) │
  │ 继续运行直到完成      │          │ 继续运行直到完成      │
  │ 或 timeout (15 min)  │          │ 或 timeout (10 min)  │
  └──────────┬───────────┘          └──────────┬───────────┘
             │ timeout / complete               │ timeout / complete
             ▼                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 容器自然结束，但 system 仍 paused                                    │
  │ 已完成的 job 被标记 completed/failed                                 │
  │ 无新 job 被 claim                                                   │
  └──────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 │ 人工 unpause
                                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Server 恢复:                                                         │
  │   1. reconcileOrphans() — 扫描残留容器，创建 retry jobs              │
  │   2. Poll loop 恢复 claim                                           │
  │   3. Retry jobs 开始执行                                             │
  └──────────────────────────────────────────────┬───────────────────────┘
                                                 │
                                                 │ 如果 rate limit 仍未解除
                                                 ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │ 新 agent 再次检测到 rate limit → 立即 re-pause                      │
  │ 循环: pause → unpause → rate limit → pause                         │
  │ 需等待 API 限额恢复后再 unpause                                     │
  └──────────────────────────────────────────────────────────────────────┘

  关键特性: Rate limit 只 pause，不 retry，防止无限循环。
  需人工判断 API 限额何时恢复再 unpause。
```

### F2.3 Merge Conflict 循环

```
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                    MERGE CONFLICT LOOP                                   │
  └─────────────────────────────────────────────────────────────────────────┘

  Task-A 和 Task-B 都涉及 farm.tscn

  ┌──────────────┐     ┌──────────────┐
  │  Coder (A)   │     │  Coder (B)   │     并行执行
  │  修改 farm   │     │  修改 farm   │
  │  .tscn L50   │     │  .tscn L55   │
  └──────┬───────┘     └──────┬───────┘
         │ PR-A               │ PR-B
         ▼                    ▼
  ┌──────────────────────────────────────────────────────────────┐
  │                    INTEGRATE phase                            │
  │                                                              │
  │  Integrator merges PR-A ✓                                    │
  │                                                              │
  │  Integrator merges PR-B:                                     │
  │    git merge --no-commit (dry-run) → CONFLICT in farm.tscn  │
  │                                                              │
  │  Result: Task-B re-queued                                    │
  └──────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  新 Coder 为 Task-B spawn                                    │
  │    → checkout main (包含 PR-A 变更)                          │
  │    → 重新实现 Task-B                                         │
  │    → 但 .tscn diff 可能再次与 PR-A 后的 farm.tscn 冲突       │
  │       (Godot .tscn 是 text-based 但 merge-hostile)           │
  └──────────────────────────────┬───────────────────────────────┘
                                 │
                                 ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Integrator 再次尝试 → 再次 CONFLICT                         │
  │                                                              │
  │  循环: re-queue → Coder → Integrator → CONFLICT → re-queue  │
  │                                                              │
  │  Conflict 不算 "failure"，global retry cap 不计数            │
  │  但 re-queue 有隐式上限 (MAX_GLOBAL_RETRIES=4 最终拦截)      │
  └──────────────────────────────────────────────────────────────┘

  缓解措施:
  ┌──────────────────────────────────────────────────────────────┐
  │ 当前: 无专门缓解。Orchestrator 被要求规划独立任务以减少      │
  │       文件重叠，但无 enforce。                                │
  │                                                              │
  │ .tscn 特殊性: Plan Validator 检查 .tscn mutex 但无实际锁。   │
  │ Global retry cap (MAX_GLOBAL_RETRIES=4) 是最终拦截。         │
  └──────────────────────────────────────────────────────────────┘
```

## F3. 外部依赖故障

```
  ┌──────────────────┬─────────────────────────┬──────────────────────┬────────────┬──────────────────────────────────┐
  │ 依赖              │ 检测方式                 │ 系统行为              │ 自动恢复?   │ 已知问题                          │
  ├──────────────────┼─────────────────────────┼──────────────────────┼────────────┼──────────────────────────────────┤
  │ MongoDB          │ health endpoint returns │ poll loop throws on  │ 部分       │ Mongoose auto-reconnect 处理     │
  │                  │ degraded                │ findOneAndUpdate →   │            │ transient drops。                 │
  │                  │                         │ Node.js unhandled    │            │ 无 graceful degradation mode。   │
  │                  │                         │ rejection            │            │ 长时间断开 → 所有 job 失败。     │
  ├──────────────────┼─────────────────────────┼──────────────────────┼────────────┼──────────────────────────────────┤
  │ Docker daemon    │ health endpoint returns │ container creation   │ 否         │ Docker daemon 不可用时           │
  │                  │ degraded                │ fails → job fails    │            │ 所有 agent spawn 失败。          │
  │                  │                         │                      │            │ 无 Docker-level 自动 retry。     │
  ├──────────────────┼─────────────────────────┼──────────────────────┼────────────┼──────────────────────────────────┤
  │ GitHub API       │ 无专门检测              │ PR creation fails → │ 间接       │ 无 GitHub rate limit 检测。      │
  │                  │                         │ Coder retry。        │            │ CI polling fails → wait-for-ci  │
  │                  │                         │ CI polling fails →   │            │ job retries，但无 backoff。     │
  │                  │                         │ wait-for-ci retries  │            │                                  │
  ├──────────────────┼─────────────────────────┼──────────────────────┼────────────┼──────────────────────────────────┤
  │ Claude API       │ Rate limit: stdout 扫描 │ Rate limit → 全系统 │ 否         │ Rate limit 需人工 unpause。      │
  │                  │ Other errors: agent     │ pause。              │            │ 非 rate limit errors → agent    │
  │                  │ exits with error        │ Other errors →       │            │ retry，可能遇到同样错误。        │
  │                  │                         │ agent retry          │            │                                  │
  └──────────────────┴─────────────────────────┴──────────────────────┴────────────┴──────────────────────────────────┘
```

## F4. 并发风险

### F4.1 .tscn 文件冲突

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ .tscn 文件并发写入风险                                                │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Plan Validator 提到 .tscn mutex 但无实际锁实现。                     │
  │  多个 Coder 可能同时修改相关 .tscn 文件。                             │
  │                                                                      │
  │  Godot .tscn 特性:                                                   │
  │    - Text-based (可 git diff)                                        │
  │    - 但 merge-hostile (node ID、resource path 交叉引用)               │
  │    - 手动 merge 困难，自动 merge 几乎不可能                           │
  │                                                                      │
  │  当前缓解:                                                           │
  │    Orchestrator 被要求规划独立任务，减少文件重叠。                     │
  │    但无 enforce — Plan Validator 仅警告，不 block。                   │
  │                                                                      │
  │  风险等级: 高（尤其是多任务涉及同一 scene 时）                        │
  └──────────────────────────────────────────────────────────────────────┘
```

### F4.2 Job Queue Poll 重入

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Poll 重入风险                                                        │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  Poll 间隔: 5s                                                       │
  │  单次处理可能 >5s（如 context building 涉及多次 MongoDB 查询）        │
  │                                                                      │
  │  防护:                                                               │
  │    processing = true   ← poll 开始                                   │
  │    ... do work ...                                                   │
  │    processing = false  ← poll 结束                                   │
  │    下次 poll: if (processing) return;                                │
  │                                                                      │
  │  限制:                                                               │
  │    ✓ 单进程有效 — boolean flag 防止同一 event loop 重入              │
  │    ✗ 多 server 实例会绕过 — 无分布式锁                               │
  │    ✗ 当前设计: 单实例 + Docker Compose                               │
  └──────────────────────────────────────────────────────────────────────┘
```

### F4.3 多 Cycle 并行

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Cycle 并行风险                                                       │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  设计意图: 同一时间只有一个 active cycle                              │
  │                                                                      │
  │  保证机制:                                                           │
  │    next-cycle job 在当前 cycle 完成后才创建                           │
  │    advance-cycle 检查所有 task 是否已结束                             │
  │                                                                      │
  │  风险:                                                               │
  │    无 explicit guard (如 DB unique constraint on active cycle)       │
  │    手动通过 Dashboard 或 API 创建 cycle 可能导致并行                  │
  │    两个 cycle 的 Coder 可能同时修改同一 branch                       │
  │                                                                      │
  │  当前状态: 未发生过，但无 hard prevention                            │
  └──────────────────────────────────────────────────────────────────────┘
```

### F4.4 Room Spec 写入竞争

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │ Spec 写入竞争                                                        │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  场景: 多个 Curator 或 human 同时写同一 Room 的 specs                │
  │                                                                      │
  │  MongoDB 保证:                                                       │
  │    ✓ 单文档级原子操作 — 单条 spec 的 create/update 是安全的          │
  │    ✗ 无跨文档事务 — 两条 conflicting specs 可能同时 active           │
  │                                                                      │
  │  示例:                                                               │
  │    Curator-A 写入: constraint "FPS ≥ 30"                             │
  │    Curator-B 写入: constraint "FPS ≥ 60"                             │
  │    两条 spec 都 state=active，互相矛盾                               │
  │                                                                      │
  │  当前缓解: Curator 通常每个 cycle 只 spawn 一次，竞争概率低          │
  └──────────────────────────────────────────────────────────────────────┘
```

## F5. 已知 Gap 列表

```
  ┌──────────────────────────────────────────────────────────────────────┐
  │                    KNOWN GAPS — 系统未覆盖的能力                      │
  ├──────────────────────────────────────────────────────────────────────┤
  │                                                                      │
  │  ✗ 无 circuit breaker                                                │
  │    外部 API 持续失败会持续 retry 直到上限                             │
  │                                                                      │
  │  ✗ 无 exponential backoff                                            │
  │    重试立即执行，可能加剧 rate limit                                  │
  │                                                                      │
  │  ✗ 无 alerting                                                       │
  │    系统暂停/失败无通知（需盯 Dashboard）                              │
  │                                                                      │
  │  ✗ 无 distributed tracing                                            │
  │    无法跨 agent run 关联追踪                                         │
  │                                                                      │
  │  ✗ 无容器网络隔离                                                    │
  │    agent 可访问任意外部地址                                           │
  │                                                                      │
  │  ✗ 无 graceful degradation                                           │
  │    系统只有 running / paused / killed 三态                           │
  │                                                                      │
  │  ✗ 无运行时容器健康检查                                               │
  │    仅 startup orphan recovery，运行中容器无心跳                      │
  │                                                                      │
  │  ✗ 无 Rollback 机制                                                  │
  │    bad spec 需手动 archive，bad merge 需手动 git revert              │
  │                                                                      │
  │  ✗ 无人工紧急停止单个 agent                                          │
  │    只能 pause 全系统或手动 docker kill                               │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘
```

## F6. Rollback 策略

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  ROLLBACK MECHANISMS                          │
  └─────────────────────────────────────────────────────────────┘

  Bad Spec (Curator 写了错误/低质量的 spec):
  ┌──────────────────────────────────────────────────────────────┐
  │ 自动路径:                                                     │
  │  Agent contextFeedback 标记为 unnecessary                    │
  │  → qualityScore 持续下降                                     │
  │  → score ≤ -10 → state: archived (自动退出循环)              │
  │  约需 7 次 "unnecessary" 反馈，即 ~3-4 个 cycle              │
  │                                                              │
  │ 手动路径:                                                     │
  │  PATCH /api/specs/:id { state: "archived" }                  │
  │  → 立即从 Context Builder 选择中排除                         │
  │  → disk sync 更新 yaml 状态                                  │
  │                                                              │
  │ 注意: archived 是 soft delete，数据保留可追溯                │
  └──────────────────────────────────────────────────────────────┘

  Bad Merge (Integrator 合并了有问题的 PR):
  ┌──────────────────────────────────────────────────────────────┐
  │ 回滚流程:                                                     │
  │  1. PATCH /api/control { mode: "paused" }  — 暂停系统        │
  │  2. git revert <commit> on main branch                       │
  │  3. 推送 revert commit                                       │
  │  4. 手动将相关 tasks 标记 failed                              │
  │  5. PATCH /api/control { mode: "running" } — 恢复系统        │
  │                                                              │
  │ 无自动 rollback — 需要人工判断 revert 范围                   │
  │ Integrator 按 topo 排序合并，revert 可能需要连锁 revert      │
  └──────────────────────────────────────────────────────────────┘
```

## F7. 人工干预操作

```
  ┌─────────────────────────────────────────────────────────────┐
  │                  HUMAN INTERVENTION MENU                      │
  └─────────────────────────────────────────────────────────────┘

  系统级控制:
  ┌──────────────────────────────────────────────────────────────┐
  │ 暂停系统     PATCH /api/control { mode: "paused" }          │
  │ 恢复系统     PATCH /api/control { mode: "running" }         │
  │ 终止系统     PATCH /api/control { mode: "killed" }          │
  │ 调整预算     PATCH /api/control { spendingCapUsd: N }       │
  │ 切换审批     PATCH /api/control { autoApprovalCategories }  │
  └──────────────────────────────────────────────────────────────┘

  Job 级控制:
  ┌──────────────────────────────────────────────────────────────┐
  │ 审批 job     POST /api/jobs/:id/approve                     │
  │ 拒绝 job     POST /api/jobs/:id/reject { reason }          │
  │ (所有 requiresApproval=true 的 job 需人工操作)              │
  └──────────────────────────────────────────────────────────────┘

  知识干预:
  ┌──────────────────────────────────────────────────────────────┐
  │ 归档 bad spec    PATCH /api/specs/:id { state: "archived" } │
  │ 激活 draft spec  PATCH /api/specs/:id { state: "active" }   │
  │ 编辑 spec 内容   PATCH /api/specs/:id { title, detail }     │
  │ 创建人工 spec    POST /api/specs { source_type: "human" }   │
  │ Override Curator  归档其 spec + 创建人工 spec 替代           │
  └──────────────────────────────────────────────────────────────┘

  紧急操作:
  ┌──────────────────────────────────────────────────────────────┐
  │ 停止单个 agent   docker kill <container-id>                  │
  │                  (orphan recovery 会在下次 startup 清理)     │
  │                  或 PATCH /api/control { mode: "paused" }    │
  │                  暂停全系统（更安全）                         │
  │                                                              │
  │ 回滚 bad merge   见 F6. Rollback 策略                       │
  │                                                              │
  │ 清理 orphan      重启 server → orphan recovery 自动执行     │
  │ 手动清理容器     docker rm -f $(docker ps -q -f label=harness=agent) │
  └──────────────────────────────────────────────────────────────┘

  当前缺失的人工干预能力:
  ┌──────────────────────────────────────────────────────────────┐
  │ ✗ 无法通过 API 停止单个 agent (只能 docker kill 或全局暂停) │
  │ ✗ 无法修改正在运行的 cycle 的任务列表                       │
  │ ✗ 无法强制跳过某个 phase (如跳过 test 直接 review)          │
  │ ✗ 无 Dashboard UI 做上述操作 — 需 curl 或 API client        │
  └──────────────────────────────────────────────────────────────┘
```

# Known Issues — 已知问题与解决方案

实际使用中会遇到的问题、影响、解决方案。按严重程度排序。

## 严重 — 会卡住系统

### I1. 系统暂停了没人知道

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ Rate limit 半夜触发 → mode: paused → 没有通知           │
  │ Spending 80% 触发 → mode: paused → 没有通知             │
  │ 你早上起来发现整晚没跑                                   │
  │                                                          │
  │ Dashboard 有 SSE 事件 system:spending_warning            │
  │ 但你关了浏览器就收不到                                   │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ Discord webhook 从 "Future Feature" 提升为 P0:           │
  │                                                          │
  │ Server 端新增 NotificationService:                       │
  │  • 监听 SSE 全局事件                                     │
  │  • 关键事件 → POST Discord webhook                       │
  │  • 触发: mode:paused, spending_warning, cycle:failed,    │
  │    job:requires_approval, plan:questions                  │
  │                                                          │
  │ 配置: DISCORD_WEBHOOK_URL 在 .env                        │
  │ 实现量: ~50 行 TypeScript，1-2 小时                      │
  │                                                          │
  │ 临时方案 (0 成本):                                       │
  │  cron job 每 5 分钟 curl /api/control                    │
  │  如果 mode !== "running" → 发通知                        │
  └──────────────────────────────────────────────────────────┘
```

### I2. .tscn Merge Conflict 死循环

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ Task-A 改 farm.tscn line 50 → merged                    │
  │ Task-B 改 farm.tscn line 55 → Integrator 冲突           │
  │ → re-queue → Coder 重写 → 还是冲突 → re-queue           │
  │ → 烧钱直到 MAX_GLOBAL_RETRIES=4                         │
  │                                                          │
  │ plan-validator 检测 .tscn 互斥但不 block，只 warn        │
  │ Orchestrator 被要求最小化重叠但无 enforce                │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. plan-validator 升级: .tscn 互斥从 warn → block       │
  │    两个 task 的 filesToModify 含同一 .tscn → reject plan │
  │    Orchestrator 必须把它们合并为一个 task 或串行依赖     │
  │                                                          │
  │ 2. Integrator 冲突计数: 同一 task 冲突 2 次 →            │
  │    标记 task: conflict-blocked (不再 re-queue)           │
  │    通知人工: "Task-B 和 Task-A 在 farm.tscn 冲突，       │
  │    需手动决定合并顺序"                                   │
  │                                                          │
  │ 3. .tscn 串行策略:                                       │
  │    plan 中 .tscn 相关 tasks 强制 blockedBy 串行         │
  │    先合 Task-A → 再跑 Task-B (基于 Task-A 的代码)       │
  └──────────────────────────────────────────────────────────┘
```

### I3. Orchestrator Q&A 后被 Validator Reject 导致卡死

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ 你回答 questions → Orchestrator 重新 plan              │
  │ → validator reject (scope 太大)                         │
  │ → 消耗 retry → retry 用完                               │
  │ → 需人工干预，但 cycle 是 active 状态                   │
  │ → 没法创建新 orchestrator job                           │
  │ → 卡死                                                   │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. Q&A 后的 plan 走 validator 失败 → 不消耗 retry      │
  │    只有 Human Review 的 [Request Changes] 消耗 retry    │
  │    validator reject 直接回到 Q&A (让你修改 answers)     │
  │                                                          │
  │ 2. 流程调整:                                             │
  │    Q&A → Orchestrator plan → validator                  │
  │      ├─ pass → reviewer → human review                  │
  │      └─ fail → 回到 Q&A (附 validator 错误信息)         │
  │              你可以修改 answers 或 feedback              │
  │              不消耗 retry，因为是 validator 格式问题     │
  │                                                          │
  │ 3. 增加 Dashboard 操作:                                  │
  │    cycle 卡死时 → [Force Replan] 按钮                   │
  │    重置 retry 计数，重新 spawn Orchestrator              │
  │    相当于 "这个 plan 不要了，从头来"                     │
  └──────────────────────────────────────────────────────────┘
```

### I4. 一个 Broken Task 吃掉大量预算

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ MAX_GLOBAL_RETRIES=4 是全 cycle 共享，不是 per-task      │
  │ Task-1 反复 fail 用了 3 次 retry                        │
  │ → Tasks 2-5 只剩 1 次 retry 机会                        │
  │                                                          │
  │ 一个 broken task 最多花:                                 │
  │   Coder $5 × 2 + Tester $5 × 2 + Reviewer $5 = $25     │
  │ 5 个 task 的 cycle 最坏: $25 × 5 = $125                 │
  │ 但 global retry cap 实际上限制不住 per-task 花费         │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. 增加 per-task retry cap:                              │
  │    MAX_TASK_RETRIES = 2                                  │
  │    单个 task 连续失败 2 次 → 标记 blocked               │
  │    不影响其他 task 的 retry 额度                         │
  │                                                          │
  │ 2. 保留 global cap 作为安全网:                           │
  │    MAX_GLOBAL_RETRIES = 4 仍然有效                       │
  │    per-task 2 + global 4 = 双重保护                     │
  │                                                          │
  │ 3. per-task spending cap:                                │
  │    单个 task 累计花费 > $20 → 标记 blocked              │
  │    不管 retry 了几次，钱到了就停                         │
  │                                                          │
  │ 4. Dashboard spending 细化:                              │
  │    显示 per-task 花费，不只是 per-cycle                  │
  │    task 花费异常高时在 Jobs 页面标红                     │
  └──────────────────────────────────────────────────────────┘
```

## 中等 — 用久了会出问题（1-3 个月后）

### I5. Draft Specs 积灰无人处理

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ Curator 生成 conf 0.50-0.74 的 draft spec               │
  │ → Dashboard Rooms 页面有 ⚠ 标记                         │
  │ → 你忘了看 → 几十个 draft 堆积                          │
  │ → 没有 SLA 或提醒                                       │
  │ → 3 个月后 50 个 draft，不知道哪个该留                   │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. Draft spec 超时:                                      │
  │    draft 超过 5 个 cycle 未处理 → auto-archive           │
  │    如果没人关心，说明不重要                               │
  │                                                          │
  │ 2. Dashboard 提醒:                                       │
  │    Home 页面显示 "N 个 draft specs 等待确认"             │
  │    Discord 通知: "有 5 个 draft specs 等了 3 个 cycle"   │
  │                                                          │
  │ 3. Cycle 开始前检查:                                     │
  │    Orchestrator plan 前 → Server 检查 draft 数量         │
  │    > 10 个 draft → 弹 warning 到 Dashboard               │
  │    "建议先处理 draft specs 再开新 cycle"                  │
  └──────────────────────────────────────────────────────────┘
```

### I6. Spec 互相矛盾没有检测

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ 00-project-room: constraint "FPS ≥ 30"                  │
  │ 02-03-tester:    constraint "FPS ≥ 60"  (Curator 新写)  │
  │                                                          │
  │ Agent 收到两条 constraint，不知道听谁的                  │
  │ 没有冲突检测、没有 warning、没有优先级                   │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. Curator 写入时查重:                                   │
  │    POST /api/specs 前检查同 Room + 继承链                │
  │    是否已有语义相近的 constraint                         │
  │    有 → Curator 输出 supersedes 关系                     │
  │    新 spec 标记 supersedes: old-spec-id                  │
  │    旧 spec 自动 archived                                 │
  │                                                          │
  │ 2. Context Builder 注入时去重:                           │
  │    继承链收集后，检测同 type 的 specs                    │
  │    子 Room 的 spec 覆盖父 Room 的 (更具体的优先)        │
  │    注入时只保留最具体的那条                               │
  │                                                          │
  │ 3. Dashboard Rooms 页面:                                 │
  │    检测到潜在冲突 → 标 ⚠ "和 00-project-room 的         │
  │    constraint-001 可能冲突"                               │
  │    人工决定: 更新旧 spec / archive 新 spec / 两者共存   │
  └──────────────────────────────────────────────────────────┘
```

### I7. 知识衰退太慢，Bad Spec 长期存在

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ bad spec 需要 ~7 次 "unnecessary" → score ≤ -10 → archived │
  │ 大约 10-15 个 cycle (2-3 个月)                           │
  │ 如果没人引用这条 spec，它收不到反馈，永远 active          │
  │                                                          │
  │ 没人引用 = 没被选中注入 = 不会收到 unnecessary 反馈     │
  │ 但也不会被 archived → 僵尸 spec                          │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. 引用衰减:                                             │
  │    spec 连续 N 个 cycle 未被任何 agent 引用              │
  │    → qualityScore 每 cycle 自动 -0.5                    │
  │    未引用 = 不相关 → 逐渐衰减到 archived                │
  │    N = 10 cycles (避免误杀低频但重要的 spec)             │
  │                                                          │
  │ 2. Staleness flag → 自动降级:                            │
  │    当前: stale 只是 flag，不做任何事                     │
  │    改为: stale flag 后 5 个 cycle 仍无更新               │
  │    → state: draft (从 active 降级)                       │
  │    → 不再注入 agent，但保留数据                          │
  │                                                          │
  │ 3. Dashboard 批量操作:                                   │
  │    Rooms 页面增加 [Archive All Stale] 批量按钮           │
  │    一键清理所有 stale specs                              │
  └──────────────────────────────────────────────────────────┘
```

### I8. Context 不确定性，Debug 困难

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ 两个 agent 30 秒内 spawn                                │
  │ 中间 Curator 写了新 spec                                │
  │ → 两个 agent 拿到的 context 不一样                      │
  │                                                          │
  │ Debug 时无法复现 "agent 当时看到了什么 specs"            │
  │ 因为 context 是临时生成的，不持久化                      │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. Context 快照持久化:                                   │
  │    Context Builder 每次运行后                            │
  │    将注入的 spec IDs + 排序 保存到 AgentRun 文档:       │
  │    agentRun.contextSnapshot = {                          │
  │      specIds: ["constraint-02-03-001", ...],             │
  │      roomIds: ["02-03-tester", "00-project-room"],       │
  │      tokenCount: 7200,                                   │
  │      truncated: ["context-08-infra-003"]                 │
  │    }                                                     │
  │                                                          │
  │ 2. Dashboard Agents 详情页:                              │
  │    显示 "这个 agent 看到了哪些 specs"                    │
  │    可对比两个 agent run 的 context diff                  │
  │                                                          │
  │ 3. 成本: 每个 AgentRun 多存 ~1KB JSON                   │
  │    30 天 TTL 随 AgentEvent 一起清理                      │
  └──────────────────────────────────────────────────────────┘
```

## 一般 — 体验不好但不致命

### I9. 容器 Orphan 只有启动时检测

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ 运行中 container 死了 (Docker hang / OOM killer)         │
  │ Launcher 不知道 — 没有运行时心跳                        │
  │ 只有 restart 后 orphan recovery 才清理                   │
  │ 中间 $5 白花，cycle 卡住等 timeout                      │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. 运行时健康检查:                                       │
  │    Spawner 在 WAIT 阶段定期 docker inspect container    │
  │    container 状态不是 running → 提前标记 failed          │
  │    不用等 timeout                                        │
  │                                                          │
  │ 2. 检查间隔: 30s (复用 SSE heartbeat interval)          │
  │    实现: WAIT 阶段的 Promise.race 加一个 health poller  │
  │                                                          │
  │ 3. 检测到 dead container:                                │
  │    → 立即标记 AgentRun: failed, reason: container-died  │
  │    → 创建 retry job (如果 retry 额度内)                  │
  │    → 不用等 restart                                      │
  └──────────────────────────────────────────────────────────┘
```

### I10. 不区分永久错误和临时错误

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ task 描述写错了 (永久错误)                               │
  │ → Coder fail → retry → 同样的错 → retry                 │
  │ → 浪费 2 次 × $5 = $10                                  │
  │ 应该第一次就识别出来                                     │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. 错误分类:                                             │
  │    Agent 输出 completion event 时附带 error_type:        │
  │    "transient" (rate limit, timeout, network)            │
  │    "permanent" (invalid task, impossible requirement)    │
  │    "unknown" (默认)                                      │
  │                                                          │
  │ 2. permanent → 不 retry，直接标记 blocked               │
  │    transient → 正常 retry                                │
  │    unknown → retry 1 次，连续相同错误 → 标记 blocked    │
  │                                                          │
  │ 3. "连续相同错误" 检测:                                  │
  │    对比 retry 前后的 error message                       │
  │    相似度 > 80% → 认为是同一个 permanent 错误            │
  │    → 停止 retry，通知人工                                │
  └──────────────────────────────────────────────────────────┘
```

### I11. Dashboard 缺少关键视图

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ 没有:                                                    │
  │  • 上个 cycle 改了哪些 spec (spec audit trail)          │
  │  • 所有 pending approval 汇总 (跨 job type)             │
  │  • per-task 花费分析                                     │
  │  • 失败原因聚合 (哪类错误最多)                           │
  │  • 批量 spec 操作 (archive all stale)                   │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ Dashboard 增强:                                          │
  │                                                          │
  │ Home 页面增加:                                           │
  │  • Pending approvals 数量 (点击跳转 Jobs 页面)          │
  │  • Draft specs 数量 (点击跳转 Rooms 页面)               │
  │  • 本 cycle 花费 vs 预算                                 │
  │                                                          │
  │ Analytics 页面增加:                                      │
  │  • per-task spending breakdown                           │
  │  • 失败原因 top 5 (按 error message 聚合)               │
  │  • spec 变更历史 (哪个 cycle 加了/改了/删了哪些 spec)   │
  │                                                          │
  │ Rooms 页面增加:                                          │
  │  • [Archive All Stale] 批量操作                         │
  │  • spec 变更时间线                                       │
  └──────────────────────────────────────────────────────────┘
```

### I12. 重启后恢复不透明

```
  问题:
  ┌──────────────────────────────────────────────────────────┐
  │ docker compose up 后:                                    │
  │  • orphan recovery 在跑，但多久完成？                    │
  │  • pending job 还在吗？能 approve 吗？                   │
  │  • recovery 还没完就开新 cycle → 可能 double spend      │
  └──────────────────────────────────────────────────────────┘

  解决方案:
  ┌──────────────────────────────────────────────────────────┐
  │ 1. Startup readiness flag:                               │
  │    Server 启动时 control.startupReady = false            │
  │    orphan recovery 全部完成 → startupReady = true        │
  │    GET /api/health 返回 startupReady 状态                │
  │                                                          │
  │ 2. Dashboard 显示:                                       │
  │    startupReady = false → 顶部 banner                   │
  │    "系统恢复中... orphan recovery 进行中"                │
  │    禁止创建新 cycle 直到 ready                           │
  │                                                          │
  │ 3. Recovery 日志:                                        │
  │    orphan recovery 结果写入 DB:                          │
  │    { orphansFound: 2, jobsRetried: 1, tasksRecovered: 3 }│
  │    Dashboard Home 页面显示上次 recovery 摘要             │
  └──────────────────────────────────────────────────────────┘
```

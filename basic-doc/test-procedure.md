# M0–M7 验证测试流程

本文档定义了 M0–M7 所有新功能的端到端验证步骤。按顺序执行，每步标注预期结果。

---

## 0. 环境准备

### 0.1 启动 MongoDB

```bash
# 方式 A：Docker (推荐)
docker run -d --name zombie-mongo -p 27017:27017 mongo:7

# 方式 B：docker-compose (完整栈)
docker-compose up -d mongodb
```

### 0.2 配置 Server .env

```bash
# apps/server/.env
MONGODB_URI=mongodb://localhost:27017/zombie-farm
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/你的ID/你的TOKEN
# 以下可选（不启动 agent 的话不需要）
# CLAUDE_CODE_OAUTH_TOKEN=...
# GH_TOKEN=...
# GITHUB_REPO_URL=...
```

### 0.3 启动 Server + Dashboard

```bash
# Terminal 1: Server
npm run dev:server

# Terminal 2: Dashboard
npm run dev:dashboard
```

预期：Server 输出：
```
Seeding knowledge base...
Knowledge base seeded
Seeding rooms...
[seed-rooms] Done. Rooms: 26, Specs: N
Rooms seeded
Startup recovery complete
Server started { port: 3001 }
```

---

## 1. M0: Room + Spec 数据基础

### 1.1 seedRooms 验证

启动 Server 后检查日志，确认 `Rooms: 26` (或实际 room 数量) 和 `Specs: N`。

### 1.2 Rooms API

```bash
# 列出所有 rooms
curl -s http://localhost:3001/api/rooms | jq length
# 预期: 26

# 获取 room tree
curl -s http://localhost:3001/api/rooms/tree | jq '.[0]._id, .[0].children | length'
# 预期: "00-project-room", 子节点数 > 0

# 获取单个 room
curl -s http://localhost:3001/api/rooms/02-agent-system | jq '._id, .children | length'
# 预期: "02-agent-system", children 含 9 个子 room

# 获取 room 的 spec 计数
curl -s http://localhost:3001/api/rooms/00-project-room | jq '.specs'
# 预期: { "draft": N, "active": M } 或类似
```

### 1.3 Specs API

```bash
# 列出某 room 的 specs
curl -s "http://localhost:3001/api/specs?roomId=00-project-room" | jq length
# 预期: >= 1 (至少有 intent spec)

# 创建新 spec
curl -s -X POST http://localhost:3001/api/specs \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "00-project-room",
    "type": "decision",
    "title": "Test Decision",
    "summary": "Test summary",
    "detail": "This is a test decision for verification",
    "provenance": { "source_type": "human", "confidence": 1.0 }
  }' | jq '._id, .state'
# 预期: 返回生成的 _id, state: "draft"

# 修改 spec state
SPEC_ID=$(curl -s "http://localhost:3001/api/specs?roomId=00-project-room&type=decision" | jq -r '.[0]._id')
curl -s -X PATCH "http://localhost:3001/api/specs/$SPEC_ID" \
  -H "Content-Type: application/json" \
  -d '{"state": "active"}' | jq '.state'
# 预期: "active"

# 归档 spec
curl -s -X PATCH "http://localhost:3001/api/specs/$SPEC_ID" \
  -H "Content-Type: application/json" \
  -d '{"state": "archived"}' | jq '.state'
# 预期: "archived"
```

### 1.4 Tests API

```bash
curl -s http://localhost:3001/api/tests | jq length
# 预期: 0 (如果没运行过 cycle) 或 >= 1
```

### 1.5 SSE 重放验证

```bash
# Terminal A: 先触发几个事件（创建 spec 等已经触发了 broadcast）
# Terminal B: 连接 SSE 并观察重放
curl -s -N http://localhost:3001/api/events/stream
# 预期: 收到之前缓存的事件 (如果有的话)
# Ctrl+C 断开，重新连接应再次收到缓存事件
```

---

## 2. M1: Room-Aware Context Builder

> 注意：完整验证需要实际 spawn agent (需要 Docker + Claude token)。以下是无 agent 的数据验证。

### 2.1 验证 Spec 被 seed 到 DB

```bash
# 检查 00-project-room 有 constraint specs (从 YAML constraints[] 展开)
curl -s "http://localhost:3001/api/specs?roomId=00-project-room&type=constraint" | jq length
# 预期: >= 1 (如果 YAML 有 constraints)
```

### 2.2 验证 Context Snapshot (需要 agent run)

如果有 agent run 记录：
```bash
# 获取最近的 agent run
curl -s "http://localhost:3001/api/agents?role=orchestrator" | jq '.[0].contextSnapshot'
# 预期: { specIds: [...], roomIds: [...], tokenCount: N, truncated: [...] }
```

---

## 3. M2: Plan Review & Q&A

> 完整验证需要 orchestrator agent 输出 questions。以下验证 API 端点。

### 3.1 Answer 端点验证

```bash
# 创建一个模拟 plan-qa job
curl -s -X POST http://localhost:3001/api/jobs \
  -H "Content-Type: application/json" \
  -d '... '  # 注意: 没有直接创建 job 的公开 API
```

> plan-qa job 只能通过 orchestrator agent 输出 questions 创建。Dashboard 验证见 M4。

### 3.2 Curator 置信度路由

当 curator agent 完成后（需要实际运行），检查 DB：
```bash
# 高置信度 spec → state: active
curl -s "http://localhost:3001/api/specs?state=active" | jq '[.[] | select(.provenance.source_type == "agent_sediment")] | length'

# 低置信度 spec → state: draft
curl -s "http://localhost:3001/api/specs?state=draft" | jq '[.[] | select(.provenance.source_type == "agent_sediment")] | length'
```

---

## 4. M3: Dashboard Rooms 页面 + Tests 页面

### 4.1 Rooms 页面

打开浏览器: `http://localhost:3000/rooms`

**预期 UI:**
- [ ] 左栏显示 Room 树 (00-project-room → 01-cycle-engine, 02-agent-system → 6 个 agent 子 room...)
- [ ] 每个节点旁边有 spec count badge
- [ ] 点击 room → 右栏显示 spec 列表
- [ ] Filter 按钮 (All / constraint / decision / convention / context / intent / contract / change) 正常工作
- [ ] "Draft only" toggle 正常
- [ ] Draft spec 旁边有黄色 ⚠ 图标
- [ ] 点击 [+ New Spec] → 弹出表单，填写后创建成功
- [ ] 点击 [Activate] → spec state 变为 active
- [ ] 点击 [Archive] → spec state 变为 archived
- [ ] 点击 [Edit] → 内联编辑，保存后更新
- [ ] 点击 [Archive All Stale] → 提示归档数量
- [ ] API 错误时显示红色 error banner (可 dismiss)

### 4.2 Tests 页面

打开: `http://localhost:3000/tests`

**预期 UI:**
- [ ] 顶部 4 个 stats 卡片 (Total Runs, Pass Rate, Passed, Failed)
- [ ] L1-L4 layer breakdown 卡片
- [ ] 测试结果表格 (Task, Layer, Result, Tests, Duration)
- [ ] 点击某行 → 右栏显示详情 (包含 failure 信息)
- [ ] 如果无数据 → 显示 "No test results yet"
- [ ] API 失败时显示红色 error banner

### 4.3 导航

- [ ] 顶部导航栏出现 "Rooms" 链接 (FolderTree 图标)
- [ ] 点击跳转到 /rooms

---

## 5. M4: Dashboard Q&A、Plan Review、Control

### 5.1 Jobs 页面 — Plan Q&A

打开: `http://localhost:3000/jobs` (需要有 plan-qa job)

如果存在 `type: plan-qa` 且 `approvalStatus: pending` 的 job：
- [ ] 显示蓝色 Q&A 面板 (不是普通的 Approve/Reject)
- [ ] 问题列表 + radio button 选项
- [ ] default 选项预选
- [ ] 可选 feedback 文本框
- [ ] [Submit Answers] 按钮，点击后 disabled 显示 "Replanning..."
- [ ] 提交后 job 列表刷新

### 5.2 Jobs 页面 — Plan Approval

如果存在 `type: plan-approval` 且 `approvalStatus: pending` 的 job：
- [ ] 显示 plan summary (pre 格式，monospace)
- [ ] 如果有 reviewerFeedback → 黄色高亮区
- [ ] 如果 forcedByReviewerRejection → 红色警告
- [ ] [Approve] / [Reject] 按钮正常
- [ ] Reject 展开 textarea，确认后 orchestrator 重新规划

### 5.3 Control 页面 — Operation Mode

打开: `http://localhost:3000/control`

**预期 UI:**
- [ ] System Mode 卡片 (active/paused/killed) — 现有功能，不变
- [ ] **Operation Mode 卡片** (auto/supervised/manual) — 新增
  - [ ] 3 个 radio button，描述文字
  - [ ] 切换后自动保存 (显示 "Saving..." → "Operation mode updated")
  - [ ] 刷新页面后保持选择
- [ ] **Recent Events Log** (底部) — 新增
  - [ ] 显示最近 20 条 SSE 事件
  - [ ] 每条: 时间戳 + 事件类型 badge + 摘要

### 5.4 Operation Mode 后端验证

```bash
# 设置为 auto
curl -s -X PATCH http://localhost:3001/api/control \
  -H "Content-Type: application/json" \
  -d '{"operationMode": "auto"}' | jq '.operationMode'
# 预期: "auto"

# 验证 health 端点返回 operationMode
curl -s http://localhost:3001/api/health | jq '.startupReady'
# 预期: true

# 设置回 supervised
curl -s -X PATCH http://localhost:3001/api/control \
  -H "Content-Type: application/json" \
  -d '{"operationMode": "supervised"}' | jq '.operationMode'
# 预期: "supervised"
```

---

## 6. M5: 重试韧性 & 容器健康检查

### 6.1 notBefore 验证 (需要数据库)

```bash
# 检查是否有带 notBefore 的 job (重试过的)
mongosh zombie-farm --eval "db.jobs.find({ notBefore: { \$exists: true } }).limit(3).toArray()" 2>/dev/null
# 预期: 如果有重试过的 job，显示 notBefore 时间戳
```

### 6.2 错误分类 (需要 agent run)

当 agent 输出 `errorType: 'permanent'`：
- [ ] 对应 task 状态变为 `blocked`
- [ ] 不创建 follow-up jobs

### 6.3 容器健康检查 (需要 Docker)

> 可通过手动 kill 容器验证：健康检查应在 30s 内检测到容器死亡。

---

## 7. M6: Discord 通知

### 7.1 验证 Webhook 连通

```bash
# 直接测试 webhook
curl -s -X POST "$DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"content": "🧪 Harness system test notification"}' -w "\n%{http_code}"
# 预期: HTTP 204, Discord 频道收到消息
```

### 7.2 通知触发点

以下事件应触发 Discord 消息：

| 触发条件 | 消息 |
|----------|------|
| 创建需审批的 job | ⏳ Job requires approval: **{type}** |
| Spending ≥ 80% | 💰 Spending at **N%** of cap |
| Rate limit | ⚠️ Rate limited — system paused |
| Cycle 完成 | ✅ Cycle **N** completed |
| Cycle 失败 | ❌ Cycle **N** failed |
| Orchestrator 提问 | ❓ Orchestrator has questions for Cycle **N** |

### 7.3 Webhook URL 为空时不报错

```bash
# 移除 DISCORD_WEBHOOK_URL 后重启 server
# 预期: 启动正常，无 Discord 相关错误
```

---

## 8. M7: Analytics、迁移、清理

### 8.1 新增 Analytics 端点

```bash
# Spec 变更历史
curl -s http://localhost:3001/api/analytics/specs | jq .
# 预期: 数组，每项 { cycleId, created, active, draft, archived }

# 每 task 花费
curl -s http://localhost:3001/api/analytics/spending-by-task | jq .
# 预期: 数组，每项 { taskId, totalCostUsd, runCount }

# 增强的 tasks analytics (含 successRate)
curl -s http://localhost:3001/api/analytics/tasks | jq '.byType[0]'
# 预期: 包含 successRate 字段
```

### 8.2 启动恢复透明

```bash
curl -s http://localhost:3001/api/health | jq '{ startupReady, lastRecovery }'
# 预期:
# {
#   "startupReady": true,
#   "lastRecovery": {
#     "orphansFound": 0,
#     "jobsFailed": 0,
#     "roomsSeeded": 26
#   }
# }
```

### 8.3 Knowledge API Deprecation

```bash
curl -s -I http://localhost:3001/api/knowledge 2>&1 | grep -i deprecation
# 预期:
# Deprecation: true
# Sunset: 2026-06-01
# Link: </api/specs>; rel="successor-version"
```

### 8.4 Migration 018 验证

```bash
# 检查迁移是否执行
mongosh zombie-farm --eval "db.migrations.find({ _id: /018/ }).toArray()" 2>/dev/null
# 预期: 显示 018-migrate-knowledge-to-specs 记录

# 检查 KnowledgeFile 是否被标记为 archived
mongosh zombie-farm --eval "db.knowledgefiles.find({ status: 'archived' }).count()" 2>/dev/null
# 预期: >= 1 (如果有之前的 KnowledgeFile)

# 检查迁移产生的 Spec
curl -s "http://localhost:3001/api/specs" | jq '[.[] | select(._id | startswith("migrated-"))] | length'
# 预期: >= 1
```

### 8.5 Context Builder 清理验证

```bash
# 确认 KnowledgeFileModel 不再被 context-builder 引用
grep -c "KnowledgeFileModel" apps/server/src/services/launcher/context-builder.ts
# 预期: 0

# 确认 KNOWLEDGE_DIR 不再存在
grep -c "KNOWLEDGE_DIR" apps/server/src/services/launcher/context-builder.ts
# 预期: 0
```

---

## 9. 集成验证 Checklist

### 9.1 Dashboard 全页面巡检

| 页面 | URL | 检查项 |
|------|-----|--------|
| Dashboard | / | Stats 卡片, 最近 cycles, 事件流 |
| Milestones | /milestones | 页面加载 |
| Cycles | /cycles | 列表显示 |
| Tasks | /tasks | 列表显示 |
| Tests | /tests | **新**：直接从 TestResult 加载 |
| Agents | /agents | 列表显示 |
| Knowledge | /knowledge | 正常显示 (带 deprecation header) |
| **Rooms** | **/rooms** | **新**：Room 树 + Spec 管理 |
| Assets | /assets | 页面加载 |
| Analytics | /analytics | 图表显示 |
| Review | /review | 页面加载 |
| Control | /control | **新**：Operation Mode + Recent Events |

### 9.2 数据一致性

```bash
# Room 数量: DB vs 磁盘
echo "DB rooms: $(curl -s http://localhost:3001/api/rooms | jq length)"
echo "Disk rooms: $(find rooms/ -name room.yaml | wc -l)"
# 预期: 两个数字一致

# Spec 数量: DB vs 磁盘
echo "DB specs: $(curl -s http://localhost:3001/api/specs | jq length)"
echo "Disk specs: $(find rooms/ -path '*/specs/*.yaml' | wc -l)"
# 预期: DB >= Disk (DB 可能还有 constraint 展开 + migration 产生的 specs)
```

### 9.3 Typecheck 全通过

```bash
npm run typecheck
# 预期: 3 个 workspace 全部通过，无错误
```

---

## 10. 已知限制

- **Plan Q&A / Plan Review**: 需要实际 orchestrator agent 运行才能产生 plan-qa/plan-approval jobs，无法纯 API 模拟
- **容器健康检查**: 需要 Docker daemon + agent 镜像
- **Curator 置信度路由**: 需要实际 curator agent 运行
- **Error Classification**: 需要 agent 输出 `errorType: 'permanent'`
- **notBefore 退避**: 需要 job 实际失败并重试

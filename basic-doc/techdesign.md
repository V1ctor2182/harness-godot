# Zombie Farm AI Harness — Tech Design

6 个文档，按关注点拆分。Prefix 编号避免跨文件冲突。

## 文档索引

| Doc | 内容 | Sections |
|-----|------|----------|
| [01-architecture](techdesign/01-architecture.md) | 系统架构总览、Feature Rooms、数据流、项目结构、安全边界、可观测性 | A1-A6 |
| [02-execution](techdesign/02-execution.md) | Cycle 状态机、Container 9步、Job Queue+并发、测试管线、SSE、Docker、错误恢复、Harness 自测 | E1-E8 |
| [03-knowledge](techdesign/03-knowledge.md) | Room + Spec 知识系统：结构、生命周期、Schemas、Context Builder、Curator、API、Dashboard | K1-K8 |
| [04-failure-modes](techdesign/04-failure-modes.md) | 故障分类、级联场景、外部依赖、并发风险、已知 gap、Rollback、人工干预 | F1-F7 |
| [05-api-contracts](techdesign/05-api-contracts.md) | REST API 端点、SSE 事件合约、并发模型、Authentication 现状 | P1-P4 |
| [06-dashboard](techdesign/06-dashboard.md) | 页面结构、人工干预、数据流、Rooms、Control、Plan 交互、通知 | D1-D7 |

## 术语表

| 术语 | 定义 |
|------|------|
| Room | 功能域的知识容器（原 "Feature Room"），树形结构，子 Room 继承父 Room 的 constraints |
| Spec | Room 内的单条知识，7 种类型: intent / decision / constraint / contract / convention / change / context |
| Sediment | Curator 从 PR diffs 中提取的知识结晶，写入为 Spec |
| Launcher Service | Express 后端（:3001），负责 Job Queue、Spawner、Context Builder 等（文档中也称 "Server"）|
| Cycle | 一轮完整的 Plan→Implement→Test→Review→Integrate→Retrospect 流程 |
| Agent Run | 一个 Agent 在一个容器内的一次完整执行 |

## 架构一句话

```
Human ──Dashboard──► Launcher Service ──Docker──► 6 Agents ──► Game Repo
                         │                           │
                    MongoDB (DB 为主)            Feature Rooms
                    rooms + specs               (harness: 怎么工作)
                    cycles + tasks              (game: 做什么)
                    quality feedback             Curator 写回
```

## 关键 Design Decisions

1. **DB 为主 + Disk 镜像** — MongoDB 是 source of truth，rooms/*.yaml 是 DB 的自动投影（Git 版本化）
2. **双 Repo Feature Rooms** — harness rooms (26) + game rooms (~32)，同一个 MongoDB，`repo` 字段区分
3. **7 种 Spec Types** — intent / decision / constraint / contract / convention / change / context，替代旧的 6 种 flat category
4. **Room-aware Context Builder** — 从 Task 定位 Room → 收集 specs + 继承链 → 按 type 排序注入（constraints 先，context 后）
5. **qualityScore 保留** — 在 Spec 级别维护 feedback loop，batch sync 回 disk

## 相关文档

- [prd.md](prd.md) — 产品需求
- [rooms.md](rooms.md) — 完整 Room 列表（harness 26 + game ~32）

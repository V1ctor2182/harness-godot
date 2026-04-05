# Feature Rooms 总览

两个 repo 各有自己的 Feature Rooms，存储在同一个 MongoDB 中，`repo` 字段区分来源。

## Harness Rooms（26 rooms）— "怎么工作"

管线自身的 constraints、decisions、conventions。告诉 agents 如何执行开发流程。

```
00-project-room                [Project] 项目总控
│   跨模块 conventions、技术栈决策、系统级 constraints
│   TypeScript strict, Node 22, Monorepo, Godot 4.6.1 locked
│
├── 01-cycle-engine            [Epic] Cycle 引擎
│   plan→implement→review→integrate→retrospect 五阶段流转
│   task 生命周期, cycle failure path, phase transitions
│
├── 02-agent-system            [Epic] Agent 系统
│   6 agent 在隔离容器中可靠执行，自动错误恢复
│   │
│   ├── 01-orchestrator        [Feature] Orchestrator Agent
│   │   3-7 task plan, dependency 设计, milestone/PRD 读取
│   │
│   ├── 02-coder              [Feature] Coder Agent
│   │   GDScript 实现, L1 GUT 测试, PR body JSON
│   │
│   ├── 03-tester             [Feature] Tester Agent
│   │   L2-L4 测试, quick-fail, fix task 创建
│   │
│   ├── 04-reviewer           [Feature] Reviewer Agent
│   │   7-item checklist, verdict, severity 分级
│   │
│   ├── 05-integrator         [Feature] Integrator Agent
│   │   拓扑排序合并, dry-run conflict, .tscn 特殊处理
│   │
│   ├── 06-curator            [Feature] Curator Agent
│   │   knowledge sediment 提取, Room spec 写入, inbox review
│   │
│   ├── 07-container          [Feature] 容器生命周期
│   │   Docker 9步 lifecycle, image, entrypoint, orphan recovery
│   │
│   ├── 08-spawner            [Feature] Agent 调度器
│   │   dispatch, follow-up, retry, OOM/timeout recovery
│   │
│   └── 09-stream-capture     [Feature] 流式输出捕获
│       NDJSON 解析, event 持久化, rateLimited 检测
│
├── 03-job-queue               [Epic] 任务队列
│   polling 5s, dual pool (agent:3 / infra:2), approval gates
│
├── 04-knowledge-system        [Epic] 知识系统
│   institutional memory, quality feedback loop
│   │
│   ├── 01-context-builder    [Feature] 上下文构建器
│   │   Room-aware 选择, spec injection, retry context
│   │
│   └── 02-curation           [Feature] 知识策展
│       inbox 处理, staleness detection, spec extraction
│
├── 05-testing-pipeline        [Epic] 测试管线
│   L1 GUT → L2 integration → L3 visual → L4 PRD compliance
│   quick-fail, TestResult/Screenshot 持久化
│
├── 06-plan-validation         [Feature] 计划校验
│   task count 3-7, circular deps, .tscn mutex, pre-merge conflict
│
├── 07-dashboard               [Epic] 控制面板
│   │
│   ├── 01-live-stream        [Feature] 实时流
│   │   SSE subscription, real-time agent event feed
│   │
│   ├── 02-review-panel       [Feature] 审查面板
│   │   PR diff + agent reasoning, approve/reject
│   │
│   └── 03-analytics          [Feature] 数据分析
│       metrics, spending, milestones, test results
│
├── 08-infrastructure          [Epic] 基础设施
│   Docker compose, CI/CD, GitHub integration, migrations, health check
│
├── 09-spending                [Feature] 成本控制
│   per-run $5 cap, 80% warning, 100% hard block, reconciliation
│
├── 10-game-rooms              [Epic] 游戏 Feature Rooms
│   Meta layer — game rooms 的管理机制本身
│
└── 11-data-layer              [Epic] 数据层
    MongoDB 13 collections, schemas, migrations, seeding
```

## Game Rooms（~20 rooms）— "做什么"

游戏逻辑的 constraints、decisions、conventions。告诉 agents 实现什么游戏功能、遵守什么规则。

```
00-project-room                [Project] 全局约定
│   GDScript conventions, Godot 4.6.1 约束, 资源命名规范
│   signal 命名, 静态类型, 测试写法, commit 格式
│
├── 01-core-systems            [Epic] 基础架构
│   │
│   ├── 01-scene-management   [Feature] 场景管理
│   │   场景切换, 加载, 生命周期
│   │
│   ├── 02-save-system        [Feature] 存档系统
│   │   序列化, 版本兼容, Resource save
│   │
│   └── 03-event-bus          [Feature] 事件总线
│       全局 signal bus, Autoload 注册
│
├── 02-player                  [Epic] 玩家系统 (M0, M8)
│   │
│   ├── 01-movement           [Feature] 移动 (M0)
│   │   CharacterBody2D, 碰撞, 输入映射
│   │
│   └── 02-progression        [Feature] 成长 (M8)
│       等级, 技能树, 成就
│
├── 03-farm                    [Epic] 农场系统 (M1, M5, M6, M7)
│   │
│   ├── 01-planting           [Feature] 种植 (M1)
│   │   种植周期, 作物系统, 收获判定
│   │
│   ├── 02-grid               [Feature] 网格 (M7)
│   │   自由放置, farm 扩展, 16×16 tiles
│   │
│   ├── 03-buildings          [Feature] 建筑 (M5)
│   │   功能建筑, 建造/升级, 效果 buff
│   │
│   └── 04-harvest            [Feature] 收获 (M6)
│       收获质量, 肥料, 品质 tier 计算
│
├── 04-zombie                  [Epic] 僵尸系统 (M2, M3, M8, M9)
│   │
│   ├── 01-growth             [Feature] 成长 (M2)
│   │   成长阶段, 隐藏基因 (≤5), 杂交概率
│   │
│   ├── 02-types              [Feature] 种族 (M3)
│   │   Shambler/Runner/Brute/Spitter, 属性差异
│   │
│   ├── 03-mutation           [Feature] 突变 (M8)
│   │   突变概率 (≤15%), 进化公式, 催化剂
│   │
│   ├── 04-ai-personality     [Feature] AI 与性格 (M9b)
│   │   行为状态机, 性格特征, 关系系统
│   │
│   └── 05-care-decay         [Feature] 照顾与衰老 (M9a)
│       饥饿/心情, 衰老, 死亡, 墓碑
│
├── 05-combat                  [Epic] 战斗系统 (M4, M12, M13)
│   │
│   ├── 01-auto-battler       [Feature] 自动战斗 (M4)
│   │   站位, AI, dmg = base_atk × (1 + tier_bonus)
│   │
│   ├── 02-difficulty         [Feature] 难度 (M12)
│   │   难度曲线, 征服压力, risk estimation
│   │
│   └── 03-defense            [Feature] 防御 (M13)
│       基地防御, 入侵波次, 防线布置
│
├── 06-economy                 [Epic] 经济系统 (M5)
│   │
│   ├── 01-resources          [Feature] 资源
│   │   Dark Coins, Spirit Stones, 产出/消耗平衡
│   │
│   └── 02-trading            [Feature] 交易
│       商店, NPC 交易, 价格波动
│
├── 07-world                   [Epic] 世界系统 (M10, M11)
│   │
│   ├── 01-day-night          [Feature] 日夜 (M10)
│   │   日夜循环, 天气, 季节效果
│   │
│   ├── 02-exploration        [Feature] 探索 (M11)
│   │   世界地图, PvE 副本, 试炼塔
│   │
│   └── 03-npcs               [Feature] NPC
│       对话系统, 任务, 商人
│
├── 08-wuxing                  [Epic] 五行修炼 (M8)
│   金木水火土, 相生相克, 15 个法术, 修炼境界
│
├── 09-ui                      [Epic] 界面系统
│   │
│   ├── 01-hud                [Feature] HUD
│   │   血条, 资源显示, 小地图
│   │
│   ├── 02-menus              [Feature] 菜单
│   │   背包, 图鉴, 族谱树, 设置
│   │
│   └── 03-tutorial           [Feature] 新手引导
│       15 步 onboarding, 渐进式解锁
│
└── 10-art-audio               [Epic] 美术音效 (M15)
    素材标准, 动画规范, 音效约定, 像素密度
```

## 统计

| | Harness | Game | Total |
|---|---|---|---|
| Top-level rooms | 12 | 11 | 23 |
| Sub-rooms | 14 | 21 | 35 |
| **Total rooms** | **26** | **~32** | **~58** |

## MongoDB 存储

```
rooms collection:
  { _id: "harness/02-03-tester",  repo: "harness", parent: "harness/02-agent-system", ... }
  { _id: "game/04-03-mutation",   repo: "game",    parent: "game/04-zombie", ... }

specs collection:
  { _id: "constraint-h-02-03-001", roomId: "harness/02-03-tester", type: "constraint", ... }
  { _id: "decision-g-04-03-001",   roomId: "game/04-03-mutation",  type: "decision", ... }
```

两个 repo 的 rooms 在同一个 DB，`repo` 字段区分。Context Builder 查询时合并两边的 specs 注入 agent。

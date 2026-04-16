---
name: plan-milestones
description: >
  开发前的必经步骤：为 Feature Room 重新拆分 milestones。读 Tech Design + 已有 specs + 已完成模块的模式，
  生成适合实际开发的 milestone 列表。遇到不确定的拆分会询问开发者。
  触发词："拆 milestone"、"plan milestones user-auth"、"重新拆分 payment-flow 的步骤"、
  "准备开发 search-index"。在 dev skill 之前使用。
---

# Plan Milestones — 开发前的 Milestone 拆分

Feature Room 的 milestones 最初由 room-init 从 PRD 机械生成，粒度不适合实际开发。
这个 skill 在开发前重新拆分，确保每个 milestone = 一个合理的 commit 单位。

## 何时触发

- 开发一个新 Feature Room 之前（必经步骤）
- 用户说 "拆 milestone"、"plan milestones {room}"、"准备开发 {room}"
- dev skill 检测到 milestones 粒度不合理时建议先运行此 skill

## 前置条件

- Room 已由 room-init 创建（有 room.yaml, progress.yaml, spec.md）
- Tech Design 文档存在（tech-design/ 目录）
- 至少一个同类 Room 已完成（用作参考模式）

## 执行步骤

### Phase 0: 确认 Branch

在做任何事之前，**必须先确认开发者在正确的 branch 上**：

1. 运行 `git branch --show-current` 获取当前 branch
2. 运行 `git status` 检查是否有未提交的变更
3. 验证：
   - 当前 branch **不是 main** → 如果是 main，提示开发者先创建 feature branch
   - 当前 branch 名称和目标 Room **对得上** → 如果不对，提醒开发者确认
   - 工作区**干净**（无未提交变更） → 如果有未提交，提示先 commit 或 stash

```
示例输出：

⚠️ Branch 检查:
  当前 branch: main
  目标 Room: user-auth

  你在 main 上，建议先创建 feature branch:
    git checkout -b user-auth

  要我帮你创建吗？(y/n)
```

4. **等待开发者确认或切换 branch 后再继续**

### Phase 1: 收集信息

1. 读取目标 Room 的当前状态：
   - `room.yaml`（依赖、优先级）
   - `progress.yaml`（现有 milestones）
   - `spec.md` + `specs/*.yaml`（intent, constraints）

2. 读取 Tech Design 中该 Room 相关的章节：
   - 从 intent spec 的 `provenance.source_ref` 定位 Tech Design 段落
   - 提取具体的技术要求、数据结构、接口定义

3. 读取已完成的**同类 Room** 的实际实现模式：
   - 文件结构（哪些文件、每个文件的职责）
   - milestone 实际粒度（每个 milestone 的代码量和范围）
   - 测试结构

   ```
   例如开发 payment-flow 前，参考已完成的 user-auth:
   - session.ts (SessionStore)                 ← m1
   - login.ts (LoginService)                   ← m2
   - middleware.ts (AuthMiddleware)            ← m3
   - oauth.ts + sync.ts                        ← m4
   - test_user_auth.ts                         ← m5
   ```

4. 读取 `src/{shared}/interfaces.ts` 中该 Room 对应的接口定义

### Phase 2: 生成 Milestone 方案

5. 基于收集的信息，生成 milestone 拆分方案。每个 milestone 应满足：

   **拆分原则**：
   | 原则 | 说明 |
   |------|------|
   | **一个 milestone = 一个可独立运行的产出** | 不是半成品，而是可以测试的完整单元 |
   | **50-200 行代码** | 太小浪费 commit，太大难 review |
   | **明确的输入/输出** | 下一个 milestone 知道从哪里接手 |
   | **测试作为独立 milestone 或合并到最后** | 视代码量决定 |
   | **顺序 = 依赖关系** | m2 可以 import m1 的产出 |

   **复杂度估算修正**（基于实际开发数据）：

   原始 PRD/Tech Design 的行数估算通常**系统性低估**以下方面：

   | 低估来源 | 实际倍数 | 说明 |
   |----------|---------|------|
   | **Error handling** | 代码量 +30-50% | retry/backoff、parse fallback、graceful degradation 单独可占 1/3 代码 |
   | **外部 API 依赖** | 代码量 +40-60% | lazy import、key 管理、异常层级、mock 基础设施。项目首个外部 API 尤其重 |
   | **设计决策** | 编码前 +1-2 轮交互 | 需要锁定的选项越多，规划时间越长。每个未决问题都应识别出来 |
   | **测试** | 通常 = 1-2x 代码量 | 尤其是需要 mock 外部依赖的模块 |

   估算时应用修正：
   - 纯内部逻辑（无外部依赖）：原始估算 × 1.3
   - 有外部 API/SDK 依赖：原始估算 × 2.0-2.5
   - 首次引入新依赖（项目中无先例）：原始估算 × 2.5-3.0

   > 实例：某 Room 的 LLM 分析 milestone 原估 120 行 → 实际 270 行 (2.25x)，因为 error handling
   > (~95 行) + prompt 工程 + 多层 parse 的复杂度被低估。

   **典型的 milestone 模式**（服务层 Room）：
   ```
   m1: 核心实现（本地/内存模式）
   m2: 数据模型/Schema（DB 表或存储结构）
   m3: 核心业务逻辑（计算、转换、筛选）
   m4: 外部 API/SDK 集成
   m5: 同步管道（编排 m1-m4）
   m6: 测试
   ```

   但不是所有 Room 都适合这个模式 — **根据实际复杂度调整**。

6. 对每个 milestone 生成：
   ```yaml
   - id: "m{N}-{short-name}"
     name: "{中文描述}"
     status: pending
     estimated_files: ["src/{module}/{file}.ts"]           # 预估产出文件
     estimated_lines: 100-150                                # 预估代码量（已修正）
     depends_on: []                                          # 依赖哪些前置 milestone
     complexity_flags: []                                    # 见下方复杂度标记
     open_questions: []                                      # 需要开发者决定的问题
     description: |
       {2-3 句话描述这个 milestone 要做什么}
   ```

   **complexity_flags** 用于标记该 milestone 的复杂度来源：
   ```yaml
   complexity_flags:
     - "external_api"        # 依赖外部 API/SDK
     - "first_of_kind"       # 项目中首次引入某类依赖
     - "error_handling_heavy" # 需要 retry/fallback/degradation
     - "design_decisions"     # 有需要锁定的设计选项
     - "prompt_engineering"   # 涉及 LLM prompt 设计
   ```

   **open_questions** 列出该 milestone 开始前必须回答的设计问题：
   ```yaml
   open_questions:
     - "LLM 分析用便宜模型还是高质量模型？(成本 vs 质量)"
     - "metadata 字段现在加还是 defer？(无消费者)"
     - "错误消息用哪种语言？(跟随用户 locale)"
   ```

### Phase 2.5: 多方案对比（关键 milestone）

对于带有 `complexity_flags` 的 milestone，必须生成 **至少 2 个实施方案** 供开发者选择并 **思考是否应该拆成更多milestone**。


方案对比维度：

| 维度 | 说明 |
|------|------|
| **实施顺序** | Bottom-up (先造零件再组装) vs Top-down (先跑通最短路径再加层) |
| **Scope 取舍** | 完整版 vs 精简版 (defer 非必要功能) |
| **依赖策略** | 直接集成 vs mock 先行 |

每个方案需列出：
```
Plan A: {名称}
  思路: {1-2 句}
  步骤: {numbered sub-tasks}
  预估: {行数} code + {行数} test
  优点: ...
  缺点: ...

Plan B: {名称}
  ...
```

然后给出推荐和理由，但 **最终由开发者选择**。

> 实例：某 analyzer milestone 提供了 Plan A (Bottom-Up, 7 步) vs Plan B (Top-Down Vertical Slice, 5 步)。
> 开发者选择 Plan B 并进一步合并为 4 步，因为 ~160 行代码不值得 7 步精细拆分。

**对每个方案中的设计问题，使用 sub-agent 分析**：
- 如果现在做 vs 后续修改的工作量/复杂度/风险
- 哪些决策可以轻松翻转（1-5 行改动），哪些需要现在锁定（涉及 DB schema / 数据格式）
- 展示可逆性分析表供开发者决策

### Phase 3: 交互确认（核心）

7. 展示方案并**逐项和开发者确认**：

```
📋 Milestone Plan: user-auth (用户认证)
────────────────────────────────────────────

参考模式: notification-service (已完成, 5 milestones, 6 files)
Tech Design: §2.3 认证模块

现有 milestones (room-init 生成):
  ❌ m1-sessions 表设计          → 粒度太细，只有表定义
  ❌ m2-登录入库                  → 和 m1 高度耦合
  ❌ m3-权限字段存储              → 概念不清
  ❌ m4-测试                      → OK

建议重新拆分:

  m1: SessionStore — sessions 表 + CRUD
      ├── DB schema, sessions 表设计
      ├── 实现 SessionStore 接口 (create, verify, revoke)
      ├── 支持按 userId/时间/状态查询
      └── ~150 行, 1 file

  m2: 登录/注销流程
      ├── 密码校验、token 生成、去重
      ├── 审计日志记录 — 接口预留，Phase 1 用简单实现
      └── ~120 行, 1 file

  m3: OAuth 集成 + 第三方登录
      ├── OAuth SDK 集成
      ├── 账户关联 + 去重写入 DB
      └── ~130 行, 1 file

  m4: AuthMiddleware 中间件
      ├── 编排: verify → refresh → attach user → pass
      └── ~80 行, 1 file

  m5: 测试
      ├── CRUD, 流程, 去重, 过期查询
      └── ~200 行, 1 file

总计: ~680 行, 5 files, 5 milestones

─────────────────────────────────
有疑问的地方 (需要你决定):

  ❓ 密码策略: Phase 1 用 bcrypt，还是直接上 argon2？
     → bcrypt 成熟稳定
     → argon2 更安全但依赖更新

  ❓ 多因素认证 MFA: 是否包含在这个 Room？
     → Tech Design 说 MFA 用 TOTP
     → 建议 Phase 2，这个 Room 只做密码+OAuth

请确认方案，或调整任何 milestone。
```

8. **等待开发者回答疑问和确认**。开发者可以：
   - 直接确认 "OK"
   - 调整某个 milestone（"m2 和 m3 合并"）
   - 回答疑问（"先用 bcrypt，MFA 不做"）
   - 增删 milestone（"加一个 m6 做审计日志集成"）

9. 如果开发者修改了方案，展示修改后的版本再次确认。
   循环直到开发者说 OK。

### Phase 4: 写入

10. 确认后，更新 `progress.yaml`：
    - 替换全部 milestones（旧的机械生成的被新方案替换）
    - 所有新 milestone 状态为 `pending`
    - 保留已有的 commits 记录（如果有）

11. 更新 `spec.md`：
    - 在 "当前进度" 段落反映新的 milestone 列表

12. **不动** room.yaml, _tree.yaml, specs/*.yaml（这些是 dev/commit-sync 的职责）

### Phase 5: 输出

13. 展示最终确认：
```
✅ user-auth milestones 已更新 (4 → 5 milestones)

可以开始开发了:
  → "做 user-auth m1" 或 "dev user-auth/m1"
```

## 什么时候问开发者

| 场景 | 问什么 |
|------|-------|
| **Phase 1 的技术方案有多种选择** | "密码用 bcrypt 还是 argon2？" |
| **某个功能是否属于这个 Room** | "MFA 放这个 Room 还是单独 Room？" |
| **milestone 粒度不确定** | "这两个合成一个 milestone，还是分开？" |
| **外部依赖不确定** | "这个 milestone 需要 API key 才能测试，要 mock 还是跳过？" |
| **Phase 归属不确定** | "审计日志是 Phase 1 还是 Phase 2？" |
| **发现 Tech Design 和 PRD 不一致** | "Tech Design 说 19 个字段，但外部 API 只能映射 17 个，怎么处理？" |
| **字段/功能有消费者吗** | "metadata 现在没有下游模块消费，先加还是 defer？" |
| **实施方案有多种路径** | 必须展示 ≥2 个方案 + 推荐理由，开发者最终选择 |
| **设计决策的可逆性不同** | 用 sub-agent 分析：现在做 vs 后续改的工作量/风险，哪些必须锁定，**哪些优化可以 defer 到 phase 2**。defer 的条目先记入 spec.md 的 Deferred 章节（planning loop 内部，无外部副作用）；Phase 4 用户最终确认后，再由开发者决定是否人工提 github issue——**禁止在 Phase 3 草稿阶段直接 `gh issue create`**，避免每次迭代产生重复/失效 ticket |

**不问的情况**：
- 文件命名、目录结构 → 参考已完成 Room 的模式
- 代码风格 → 参考已完成 Room 的代码
- 测试是否独立 milestone → 根据代码量自动判断
- 可逆性极高的决策（1-3 行改动）→ 先用默认值，后续轻松调整

## 和其他 skill 的关系

```
room-init → plan-milestones → dev (循环) → commit-sync
  创建 Room    拆分 milestone    逐个开发      逐个提交
  (一次)       (开发前一次)     (每个 m 一次)  (内置在 dev 中)
                    │
                    ├── Phase 2: 生成 milestones (含复杂度修正)
                    ├── Phase 2.5: 多方案对比 (≥2 plans per complex milestone)
                    │     ├── sub-agent: 可逆性分析
                    │     └── 开发者选择方案
                    └── Phase 3: 交互确认 (锁定 open_questions)
```

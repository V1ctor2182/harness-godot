# Tech Design 优化 Plan

基于架构评审报告（综合 7.2/10），对 techdesign/ 下所有文档的问题标注和修改建议。

---

## 一、结构性问题

### 1. ~~章节编号混乱~~ ✅ 已完成
01-architecture.md → A1-A6, 02-execution.md → E1-E8, 03-knowledge.md → K1-K8

### 2. ~~Section 12 重复~~ ✅ 已完成
02-execution.md 中的 Section 12 已删除，统一在 01-architecture.md A5。

### 3. ~~techdesign.md 索引需同步更新~~ ✅ 已完成
索引已更新为 5 个文档 + prefix 编号 + 术语表。

### 4. ~~CLAUDE.md 引用路径错误~~ ✅ 已完成
已改为 `[basic-doc/techdesign/](./basic-doc/techdesign/)`。

### 5. ~~03-knowledge.md + 04-knowledge-upgrade.md 合并~~ ✅ 已完成
已合并为单一 03-knowledge.md (K1-K8)。

---

## 二、缺失章节 — P0

### 6. ~~缺少故障模式与恢复设计~~ ✅ 已完成
新建 04-failure-modes.md (F1-F5): 故障分类表、级联场景、外部依赖、并发风险、已知 gap。

### 7. ~~安全边界过于粗略~~ ✅ 已完成
01-architecture.md A5 已扩展为 A5.1 当前约束 + A5.2 已知 gap + A5.3 风险评估。

---

## 三、缺失章节 — P1

### 8. ~~缺少 Harness 自身的测试架构~~ ✅ 已完成
02-execution.md 新增 E8: Harness 自测架构。

### 9. ~~缺少并发模型说明~~ ✅ 已完成
02-execution.md E3 已补充并发模型子节 + 05-api-contracts.md P3。

### 10. ~~缺少 API contract 摘要~~ ✅ 已完成
新建 05-api-contracts.md (P1-P4): REST API 端点、SSE 合约、并发模型、Auth 现状。

### 11. ~~缺少可观测性设计~~ ✅ 已完成
01-architecture.md 新增 A6: 可观测性。

---

## 四、需扩展的现有内容 — P1

### 12. ~~02-execution.md 错误恢复表太简略~~ ✅ 已完成
已扩展为 E7.1 启动恢复 + E7.2 运行时错误 + E7.3 重试策略 + E7.4 预算保护。

### 13. ~~01-architecture.md 数据同步缺少异常路径~~ ✅ 已完成
已增加 "异常与边界情况" 子节 (syncToDisk 失败、不一致窗口、反向同步)。

### 14. ~~01-architecture.md MongoDB 缺少 HA 讨论~~ ✅ 已完成
已增加 Design Decision 块 (standalone 原因、风险、升级路径)。

### 15. ~~01-architecture.md 双 Repo 同步缺少 enforce 机制~~ ✅ 已完成
已增加命名规则、冲突防范、seed 时机说明。

---

## 五、Quality Polish — P2

### 16. ~~术语不统一~~ ✅ 已完成
techdesign.md 索引页已增加术语表 (Room, Spec, Sediment, Launcher Service, Cycle, Agent Run)。

### 17. ~~资源限制缺少 rationale~~ ✅ 已完成
01-architecture.md A5.1 后新增 "资源限制 Rationale" (Memory/CPU/$5/poll/timeouts/qualityScore 全部解释)。

### 18. ~~Context Builder 缺少性能/容量讨论~~ ✅ 已完成
03-knowledge.md K4 末尾新增 "容量规划" (当前规模、增长预估、截断策略、瓶颈分析)。

### 19. ~~缺少 Rollback 策略~~ ✅ 已完成
04-failure-modes.md 新增 F6: Rollback 策略 (bad spec auto/manual path + bad merge revert 流程)。

### 20. ~~人工干预接口不完整~~ ✅ 已完成
04-failure-modes.md 新增 F7: 人工干预操作 (系统/Job/知识/紧急 4 类操作 + 缺失能力列表)。

---

## 执行状态

```
Round 1: 结构修复 (问题 1-5)     ✅ 全部完成
Round 2: P0 缺失章节 (问题 6-7)  ✅ 全部完成
Round 3: P1 章节+扩展 (问题 8-15) ✅ 全部完成
Round 4: P2 打磨 (问题 16-20)    ✅ 全部完成
```

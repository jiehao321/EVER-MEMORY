# EverMemory 连贯记忆与记忆衰减整改方案

## 1. 背景与问题定义

基于 2026-03-13 的本机运行排查，EverMemory 当前已具备数据库、工具、debug、reflection、rules、archive/review/restore 等基础能力，但尚未达到“真实连续记忆系统”的预期。

排查结论：

- 插件已加载，数据库已落地，`evermemory_status` / `evermemory_recall` / `evermemory_store` 可用
- 当前 `memory_items` 中有效数据几乎都是 E2E / smoke / shared-scope 测试样本
- 当前真实对话已被系统处理，但主要沉淀为 `debug_events`、`experience_logs`、`reflection_records`，而不是高价值 `memory_items`
- `boot_briefings` 已生成，但当前 session 的 `sections_json` 基本为空：
  - `identity=[]`
  - `constraints=[]`
  - `recentContinuity=[]`
  - `activeProjects=[]`
- 对“项目进展 / 当前阶段 / phase 6 / phase 7”这类真实项目问题执行 recall 时，返回 `No relevant memories found`

因此，当前 EverMemory 更接近“具备理解/反思/规则治理能力的记忆内核”，尚未形成“可持续沉淀真实项目上下文、并以 briefing/recall 方式提供连续性”的产品闭环。

---

## 2. 本次整改目标

本轮整改只聚焦三个结果导向目标：

### 2.1 连续性目标
系统在新会话或连续会话中，应能自动提供：
- 当前活跃项目状态
- 最近关键决策
- 最近用户纠正与执行教训
- 当前高优先级风险与下一步

### 2.2 自动沉淀目标
系统应能自动从真实交互中提炼高价值记忆，而不是依赖人工调用 `evermemory_store`。

### 2.3 衰减治理目标
系统应具备可解释的记忆生命周期与衰减机制：
- 短期工作记忆自动淡出
- 阶段性项目状态可被 supersede
- 长期稳定事实留存
- 长期无用低价值内容归档

---

## 3. 当前缺口

### 3.1 自动记忆沉淀缺口
当前自动链路：
- `sessionStart()`
- `messageReceived()`
- `sessionEnd()`

其中：
- `messageReceived()` 负责 intent / retrieval / behavior rules
- `sessionEnd()` 负责 experience / reflection / behavior promotion

**缺失关键环节：**
- interaction -> memory candidate extraction
- candidate -> deterministic acceptance
- accepted candidate -> `memory_items`

### 3.2 Briefing 空洞缺口
`boot_briefings` 当前可生成，但内容为空，说明 briefing builder 未从真实 memory / profile / project state 中产出有效结构化摘要。

### 3.3 Recall 语料缺口
真实 recall 路径存在，但项目语料不足，导致项目型问题的 recall 返回 0。

### 3.4 衰减机制缺口
当前 memory lifecycle 仅有 baseline：
- dedupe / merge
- archive / review / restore
- manual consolidate

缺失：
- 基于时间/使用频率/价值的自动 decay
- lifecycle 自动迁移
- supersede-driven 项目阶段更新

---

## 4. 总体设计原则

### 4.1 不推倒重来
复用已有能力：
- SQLite / migrations / repository
- deterministic write policy
- retrieval service
- experience / reflection / behavior rules
- archive/review/restore
- debug / status / explain

### 4.2 先做“有用”，再做“聪明”
优先修复真实连续性，不优先扩展更多 fancy capability。

### 4.3 项目记忆优先
优先支持：
- 项目状态
- 用户边界与偏好
- 高价值纠正
- 决策与下一步

而不是试图记住所有闲聊。

---

## 5. 整改方案

## Phase A — 自动沉淀真实记忆

### A1. 引入 Interaction Memory Extraction
在 `sessionEnd` 之后增加自动提炼层，从交互中生成 memory candidates。

输入：
- `inputText`
- `assistantText`
- `intent`
- `experience`
- `reflection`
- `scope`

输出候选类型至少包括：
- `project_state`
- `active_project`
- `decision`
- `explicit_constraint`
- `user_preference`
- `correction_lesson`

### A2. Candidate 接受策略
对 candidate 复用并扩展 deterministic acceptance：

必收：
- 用户明确偏好/约束
- 项目阶段结论
- 当前高优先级项目状态
- 明确下一步决策
- 高价值纠正与长期教训

不收：
- 低价值短句
- 客套性话语
- 无持续价值的重复 chatter

### A3. 在 `sessionEnd()` 自动写 memory
目标：在自动流程中补齐 “interaction -> memory_items” 链路。

### A4. 区分测试数据与生产数据
建议细化 source kind：
- `test`
- `runtime_user`
- `runtime_project`
- `reflection_derived`
- `imported`

默认 recall 降低测试数据权重。

---

## Phase B — 连续性与 Briefing 重构

### B1. 重构 boot briefing
至少输出：
- `identity`
- `constraints`
- `recentContinuity`
- `activeProjects`
- `operatorReminders`

### B2. 增加项目 summary memory
为每个活跃项目生成单独的 summary memory：
- 当前阶段
- 已完成
- 风险
- 下一步

### B3. 注入优先级调整
`before_agent_start` 注入顺序建议调整为：
1. active project summaries
2. recent corrections / explicit constraints
3. top recalled memory
4. behavior rules

### B4. 增加项目进展专项 recall 路由
当 intent 命中项目进展类问题时，优先召回：
- `active_project_summary`
- `project_state`
- `decision`
- `milestone`

---

## Phase C — 记忆衰减与生命周期

### C1. 明确 lifecycle 迁移目标
统一 lifecycle 层级：
- `working`
- `episodic`
- `semantic`
- `archive`

### C2. 增加 decay score
建议综合以下信号计算：
- recency
- lastAccessedAt
- retrievalCount
- accessCount
- importance
- confidence
- explicitness
- lifecycle
- superseded state

### C3. 自动迁移
- `working -> episodic`
- `episodic -> semantic`
- `episodic -> archive`
- `superseded -> archive`

### C4. consolidate 分层
- `light`: working cleanup / small dedupe
- `daily`: stale episodic archive / project summary recompute
- `deep`: phase supersede / semantic rebalance / archive normalization

### C5. recall 反向强化
每次 recall 命中后更新：
- `retrievalCount`
- `lastAccessedAt`

形成“越有用越留得住”的闭环。

---

## 6. 实施优先级

### P0（立刻做）
1. 自动 memory candidate extraction
2. `sessionEnd()` 自动写 memory
3. briefing builder 重构，确保不为空
4. 项目 summary memory

### P1（紧接着做）
5. 项目 intent recall 路由
6. 测试数据与生产数据隔离
7. lifecycle 自动迁移 baseline

### P2（再做）
8. decay score 动态模型
9. consolidate 自动化深化
10. recall 反向强化

---

## 7. 验收标准

### 7.1 连续性验收
新会话问：
- “项目进展”
- “刚才说到哪了”
- “你为什么答错”

系统应能自动给出：
- 当前项目阶段
- 最近关键纠正
- 当前整改目标
- 下一步动作

### 7.2 自动沉淀验收
真实对话后，`memory_items` 中应能看到生产记忆，而不再只有 E2E / smoke 数据。

### 7.3 衰减验收
经过多轮对话后：
- working memory 明显减少
- 旧阶段状态被 supersede
- 高频记忆保留
- archive / review / restore 可解释

---

## 8. 文档同步要求

本方案落地后，必须同步更新以下文档：
- `README.md`
- `docs/evermemory-phase-roadmap.md`
- `docs/evermemory-v1-boundary.md`
- `docs/evermemory-capability-matrix.md`
- `docs/evermemory-troubleshooting.md`
- `docs/evermemory-installation-guide.md`（若 operator 行为变化）
- `docs/evermemory-operator-runbook.md`（若已存在）

同步原则：
- 区分“代码已实现”与“插件已注册”
- 区分“实验能力”与“默认生产能力”
- 不夸大当前成熟度

---

## 9. 结论

EverMemory 目前并非无效，而是缺少最后一层最关键的产品闭环：
- 自动沉淀真实项目记忆
- 形成可用的 continuity briefing
- 让记忆具备自然衰减与可解释治理

本方案旨在以最小破坏方式，利用现有成熟基础，补齐这三项能力，使 EverMemory 从“记忆内核”升级为“可持续使用的连续记忆系统”。

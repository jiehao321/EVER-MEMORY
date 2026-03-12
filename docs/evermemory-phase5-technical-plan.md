# EverMemory Phase 5 详细技术方案

## 1. 文档定位

本文档定义 EverMemory Phase 5（Retrieval & Lifecycle Optimization）的详细技术方案。

Phase 5 的目标不是继续扩更多“新能力名词”，
而是把已经建立起来的 memory / understanding / reflection / behavior substrate 做质量与治理层面的增强。

换句话说：

**Phase 5 是“把系统变得更准、更稳、更长期可用”的阶段。**

---

## 2. 为什么 Phase 5 排在后面

在前几个阶段还没稳定之前，过早做 retrieval optimization / lifecycle optimization 会有两个问题：

1. 你不知道优化的是不是正确对象
2. 你会过早引入复杂度（semantic search、archive、summaries、merge logic）

因此 Phase 5 必须建立在以下前提上：
- Phase 1 foundation 稳定
- Phase 2 understanding 稳定
- Phase 3 reflection 有结构化输出
- Phase 4 behavior rules 已具备最小闭环

只有这样，优化层才不会优化错方向。

---

## 3. Phase 5 核心目标

Phase 5 主要解决四类问题：

1. **提升 recall 质量**
   - 从 keyword baseline 过渡到更稳的 hybrid retrieval

2. **降低记忆噪音**
   - 通过 dedupe / merge / archive / summarize 改善长期 memory quality

3. **增强 lifecycle 管理**
   - working / episodic / semantic / archive 不只是标签，而是进入真正治理

4. **加强 profile / retrieval / rule 的协同**
   - 让 retrieval 不只是“找文本”，而是“找最有帮助的记忆”

---

## 4. 范围定义

## 4.1 Scope In

Phase 5 应包含：
- optional semantic retrieval sidecar
- hybrid retrieval service
- ranking policy refinement
- dedupe / merge baseline
- summarize / archive baseline
- lifecycle promotion improvements
- projected profile refinement
- retrieval/lifecycle related tools（必要时）
- debug events
- tests/docs/quality

## 4.2 Scope Out

Phase 5 不应包含：
- 大型 operator UI
- 云同步 / external SaaS
- graph-native reasoning platform
- 无边界的 analytics dashboard
- autonomous long-horizon self-management

---

## 5. Retrieval Optimization 设计

## 5.1 当前问题（Phase 1~4 后）

如果停留在 keyword + structured baseline，问题会逐渐出现：
- memory 总量变大后，keyword recall 噪音增加
- 某些语义相关但词面不相似的记忆召回不到
- ranking 无法充分利用 rule / profile / confidence / importance

## 5.2 Phase 5 Retrieval 目标

要从：
- “能 recall”

提升到：
- “更可能 recall 到真正有帮助的 memory”

## 5.3 推荐层次

### Layer 1 — Structured Filtering
先按：
- scope
- type
- lifecycle
- active / archived
做结构过滤

### Layer 2 — Keyword Retrieval
保留 keyword baseline 作为 deterministic backbone

### Layer 3 — Optional Semantic Retrieval
引入 optional embedding sidecar：
- 不强制依赖重型 vector DB
- 可以本地 sidecar table / local index 方式实现

### Layer 4 — Hybrid Ranking
按加权方式融合：
- keyword score
- semantic score
- recency
- importance
- confidence
- explicitness
- scopeMatch
- typePriority
- behavior relevance

---

## 6. Lifecycle Optimization 设计

## 6.1 当前问题

当 memory 规模增长后，如果没有 lifecycle 治理，会出现：
- episodic 堆积
- semantic 污染
- superseded memory 不退场
- retrieval 被旧噪音污染

## 6.2 Phase 5 目标

让 lifecycle 真正承担治理功能：
- promote
- summarize
- merge
- archive
- restore（最小可恢复）

## 6.3 推荐子系统

### promotion refinement
更明确控制：
- episodic -> semantic
- inferred -> durable

### dedupe / merge
识别：
- duplicate facts
- repeated preferences
- same-intent repeated corrections

### summarize
把老 episodic traces 压缩成 event-like summary memory

### archive
把低价值、过时、已 superseded 内容放入 archive

---

## 7. Profile Refinement 设计

Phase 5 才适合强化 profile projection，因为此时已有：
- memory
- understanding
- reflection
- behavior rules

### Phase 5 profile refinement 重点
- stable fields 与 derived fields 分离
- derived confidence 明确
- behavior hints 更可信
- 规则和 profile 不互相打架

### 核心原则
- projected profile 仍不是 source of truth
- 任何 derived field 不得覆盖 explicit stable fact

---

## 8. 存储设计建议

## 8.1 新增/扩展内容

可能新增：
- `memory_embeddings` sidecar
- archive-related state / repo
- summarize artifacts
- dedupe metadata

## 8.2 仍坚持的原则
- canonical source 仍优先 SQLite
- debug artifacts 继续保持 JSONL/structured logs
- 不急着上 graph DB

---

## 9. Tool 规划

Phase 5 可考虑新增或增强：
- `evermemory_profile`
- `evermemory_consolidate`
- `evermemory_explain`（如后面需要）

但建议控制住：
先做 retrieval/lifecycle 真能力，
不要急着把 tool 面做得很花。

---

## 10. Debug & Explainability 设计

Phase 5 至少应新增/增强：
- `retrieval_executed` 细化 payload
- `memory_promote_decision`
- `memory_merge_decision`
- `memory_archive_decision`
- `profile_recomputed`

必须保证后续可以回答：
- 为什么这条 memory 被召回？
- 为什么这条 memory 被 promote？
- 为什么这条 memory 被 archive？
- 为什么 profile 出现了这个 hint？

---

## 11. 测试策略

至少需要：
- retrieval ranking tests
- hybrid recall tests
- dedupe/merge tests
- archive/summarize tests
- profile projection safety tests

重点不是测“高级感”，
而是测：
- 不错召回
- 不乱晋升
- 不乱归档
- 不让 profile 污染 canonical truth

---

## 12. 风险

### 风险 1：为了 semantic retrieval 过早复杂化
控制：
- semantic sidecar optional
- keyword baseline 永远保留

### 风险 2：archive/summarize 误伤有用信息
控制：
- archive 先保守
- restore path 最小存在
- supersede 优于硬删除

### 风险 3：profile derived field 污染行为
控制：
- derived 与 stable 分离
- evidence/confidence 明确

---

## 13. 完成定义

Phase 5 完成时，应满足：
- recall relevance 明显比 baseline 更好
- lifecycle noise 被显著控制
- dedupe/merge/archive/summarize 至少有最小闭环
- profile refinement 跑通且不污染 canonical truth
- debug/test/docs 收口完成

---

## 14. 结论

Phase 5 不是“再加一堆新 feature”，
而是：

**让 EverMemory 从“会工作”进化到“长期工作得更好”。**

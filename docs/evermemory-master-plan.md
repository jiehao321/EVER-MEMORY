# EverMemory 全项目总规划

## 1. 文档定位

本文档是 EverMemory 的总规划文档，目标是把项目从 Phase 1 已完成的稳定基础，扩展为一套后续可以持续推进的完整工程路线图。

它服务三个对象：

1. **项目负责人 / 总监**
   - 用来判断边界是否清楚
   - 用来判断阶段是否合理
   - 用来控制实现顺序和风险

2. **实现代理（如 Codex）**
   - 用来理解项目全貌
   - 用来知道下一阶段该做什么、不该做什么
   - 用来避免乱扩 scope

3. **未来维护者**
   - 用来理解 EverMemory 为什么这样设计
   - 用来区分稳定基线、增强层、实验层

本文档不是某一个 phase 的 task list，而是整个项目的总控文档。

---

## 2. 项目目标

EverMemory 的目标，不是做一个“把聊天记录都存起来”的工具，
而是给 OpenClaw 提供一个：

- **持久化**
- **可治理**
- **可解释**
- **可检索**
- **可逐步进化**

的 agent memory system。

### 2.1 核心目标

EverMemory 需要让 agent 具备以下能力：

1. **跨 session 连续性**
   - 重启后仍能恢复必要上下文
   - 减少重复提问
   - 保留长期有效的用户偏好、约束、决策、项目状态

2. **结构化记忆**
   - 不是只存原始日志
   - 而是把有价值的信息提炼为结构化 memory items

3. **可控写入**
   - 不是“看到什么都记”
   - 要能区分高价值/低价值
   - 要能给出 accept/reject 的可解释理由

4. **高质量召回**
   - 在正确的时机召回正确的 memory
   - 尽量减少噪音和错召回

5. **记忆生命周期管理**
   - working / episodic / semantic / archive
   - promotion / summarize / archive / supersede

6. **智能增强，但受治理**
   - 后续逐步加入 intent、reflection、behavior rules、profile
   - 但必须是受控的、证据驱动的，不是黑箱自演化

---

## 3. 非目标

为了防止项目无限膨胀，EverMemory 明确不以这些为核心目标：

1. **不是一个全能 agent brain**
   - 不负责最终回复生成
   - 不负责通用任务编排
   - 不负责替代主模型

2. **不是 SaaS 数据平台**
   - 不以云同步、多租户控制台、外部协作为当前目标

3. **不是图数据库优先项目**
   - 关系层可以逐步增强
   - 但不以 graph-first 为前提

4. **不是一开始就做 autonomous self-improvement**
   - 自我进化必须是受治理、分阶段、可解释的

5. **不是产品 UI 项目优先**
   - 当前重点是 memory substrate + runtime usefulness
   - 不是先做漂亮控制面板

---

## 4. 当前项目状态（更新于 2026-03-11）

## 4.1 已完成状态

EverMemory 当前已完成：
- **Phase 1 Foundation**
- **Phase 2 Understanding baseline**
- **Phase 3 Reflection baseline**
- **Phase 4 Behavior Evolution baseline**

当前已交付能力包含：
- typed config
- SQLite bootstrap + idempotent migrations
- repositories（memory / intent / experience / reflection / briefing / debug）
- deterministic write policy baseline
- memory service
- keyword retrieval baseline
- boot briefing service
- runtime session context helpers
- session_start + message_received + session_end minimal paths
- intent analysis（heuristics + optional LLM enrich + strict parser/fallback）
- reflection records + candidate rules + governed promotion
- behavior rules schema/repo/service（promotion + applicability + ranking）
- tool surface（store/recall/briefing/status/intent/reflect/rules）
- README / operator notes + key-path tests

### 4.2 当前工程位置

当前项目不再处于“从 0 到 1”的搭建状态，
而是处于：

- **Phase 4 baseline 已完成（行为规则治理闭环）**
- **Phase 5A/5B/5C/5D/5E/5F 已完成，Phase 6A/6B/6C/6D/6E（status/debug + explainability + import/export + archive restore/review + docs/troubleshooting/operator）已落地；Phase 6 已完成**

### 4.3 已完成文档基线

目前已有的重要文档包括：
- `docs/evermemory-technical-design.md`
- `docs/evermemory-technical-design-v2.md`
- `docs/evermemory-v2-implementation-plan.md`
- `docs/evermemory-phase1-dev-task-list.md`
- `PHASE1_COMPLETION_SUMMARY.md`

这些文档提供了基础设计与 Phase 1 完成状态。

本文档的作用，是在此基础上输出一套更完整的“全项目规划包”。

---

## 5. 总体架构原则

EverMemory 的总体架构必须遵守以下原则：

### 5.1 分层清晰

建议稳定分为以下层：

1. **storage layer**
   - db
   - migrations
   - repos

2. **core domain layer**
   - memory
   - intent
   - reflection
   - behavior
   - profile
   - briefing

3. **retrieval layer**
   - keyword
   - semantic
   - hybrid
   - ranking

4. **runtime integration layer**
   - hooks
   - runtime context
   - state helpers

5. **tool surface layer**
   - store
   - recall
   - briefing
   - intent
   - reflect
   - rules
   - status

### 5.2 canonical memory 优先

所有派生物（profile、rules、summaries）都不应成为第一真相源。
真正的 source of truth 应优先是：
- canonical memory
- structured records
- evidence-backed records

### 5.3 deterministic baseline 优先

每个能力都优先先做：
- deterministic
- 可解释
- 可验证

然后再加：
- LLM enrichment
- semantic retrieval
- reflection / evolution

### 5.4 快路径与慢路径分离

必须强制区分：

#### fast path
用于首回复关键路径，只允许：
- scope resolve
- minimal intent precheck
- lightweight recall
- rule lookup
- minimal continuity inject

#### slow path
必须尽量异步或后置：
- deep analysis
- reflection
- candidate rule generation
- profile recompute
- archive / summarize jobs

### 5.5 证据驱动，不允许黑箱长期写入

任何长期 memory / rule / profile 推断，都必须：
- 有 evidence
- 有 confidence
- 可解释
- 可调试

---

## 6. 分阶段路线图

项目后续建议采用以下路线：

### Phase 1 — Foundation
**状态：已完成**

目标：
- 打好 deterministic persistence + continuity 基础

### Phase 2 — Understanding
目标：
- 建立 intent analysis 和 message-time memory need estimation
- 把 recall 从“显式调用”推进到“按理解结果定向调用”

### Phase 3 — Reflection
目标：
- 引入 experience logs
- 从 correction / success / repeated patterns 中提取 reflection records
- 形成 candidate lessons / candidate rules

### Phase 4 — Behavior Evolution
目标：
- 建立行为规则层
- 让被治理的 rules 影响未来 continuity / retrieval / runtime judgment

### Phase 5 — Retrieval & Lifecycle Optimization
目标：
- hybrid retrieval
- semantic ranking
- dedupe / merge / archive / summarize 优化
- profile projection refinement

### Phase 6 — Extended Operations
目标：
- 进一步加强 explainability / operator tooling / import/export / optional integration

---

## 7. 各 Phase 目标与边界

## 7.1 Phase 1（已完成）

### 已完成范围
- config
- db/migrations
- repositories
- memory service
- deterministic write policy baseline
- keyword retrieval baseline
- boot briefing
- runtime session context
- session_start
- minimal tools
- docs/tests

### 不应重开事项
除非有明确 bug 或架构阻塞，否则不要重开：
- persistence schema foundations
- minimal tool contracts
- deterministic write result contract
- session_start continuity contract

---

## 7.2 Phase 2 — Understanding

### 目标
让 EverMemory 获得“理解当前输入是否需要 memory、需要哪类 memory”的能力。

### 应交付内容
- intent record schema
- intent service
- heuristic precheck
- optional structured LLM intent analysis
- retrieval hints
- message_received 最小接线
- targeted recall by intent
- intent tool
- intent-related debug events

### 不做的事
- 不进入 reflection promotion
- 不直接做 behavior auto-evolution
- 不让 intent 直接写长期规则

### 成功标准
- 新消息进入时，系统能输出结构化 intent record
- 能区分 memoryNeed: none / light / targeted / deep
- 能根据 intent hints 做更合理 recall
- 不明显拉高关键路径延迟

---

## 7.3 Phase 3 — Reflection

### 目标
把用户纠正、成功/失败模式、重复错误变成结构化 reflection artifacts。

### 应交付内容
- experience_logs schema + repo
- reflection_records schema + repo
- experience logging service
- reflection service
- session_end / heartbeat / manual reflect path
- candidate lessons
- candidate rules（仅候选）
- reflect tool
- debug events for reflection

### 不做的事
- 不直接激活 behavior rules
- 不让单次事件直接长期改人格/行为

### 成功标准
- correction 能形成 reflection record
- repeated pattern 能形成 candidate lesson/rule
- 所有结论带 evidence / confidence

---

## 7.4 Phase 4 — Behavior Evolution

### 目标
把 reflection outputs 中合格的 candidate rule 提升为 active behavior rules。

### 应交付内容
- behavior_rules schema + repo
- behavior service
- rule ranking / applicability
- promotion gating
- deprecate / supersede logic
- rules tool
- runtime rule injection

### 不做的事
- 不做 uncontrolled self-rewrite
- 不从单条弱证据直接激活长期规则

### 成功标准
- 可基于 evidence + recurrence + policy promotion active rules
- active rules 能影响 runtime behavior guidance / continuity

---

## 7.5 Phase 5 — Retrieval & Lifecycle Optimization

### 目标
提升 recall 质量，增强 lifecycle management。

### 应交付内容
- semantic retrieval optional sidecar
- hybrid ranking
- retrieval weighting policy
- dedupe / merge
- summarize / archive flows
- lifecycle promotion improvements
- profile projection enhancement

### 不做的事
- 不为了“高级”而牺牲 inspectability

### 成功标准
- recall relevance 明显改善
- stale memory 噪音下降
- lifecycle actions 可解释可调试

---

## 8. 关键子系统规划

## 8.1 Memory Core

### 职责
- memory write governance
- storage normalization
- lifecycle transitions
- conflict / supersede
- archive / summarize hooks

### 后续增强点
- better classifier
- conflict handling improvements
- promotion policy refinement
- summary-backed consolidation

## 8.2 Understanding Engine

### 职责
- intent type
- urgency
- actionNeed
- memoryNeed
- correctionSignal
- preferenceRelevance
- retrieval hints

### 核心原则
- 先 heuristic，再 optional LLM
- fast path 只做 precheck
- full analysis 可异步化或条件触发

## 8.3 Reflection Engine

### 职责
- experience capture
- reflection creation
- lesson extraction
- candidate rule generation

### 核心原则
- reflection 是建议层，不是直接统治层
- evidence / recurrence / confidence 必须存在

## 8.4 Behavior Layer

### 职责
- active rules
- rule ranking
- applicability matching
- deprecate/supersede

### 核心原则
- promoted behavior 必须受治理
- 永远不要从一次情绪化对话直接生成长期行为律

## 8.5 Projected Profile

### 职责
- stable fields from canonical memory
- derived fields from weighted evidence
- behavior hints projection

### 核心原则
- profile 不是真相源
- derived fields 不能覆盖 explicit stable facts

---

## 9. 数据模型规划

未来全量模型建议覆盖：

1. `MemoryItem`
2. `IntentRecord`
3. `ExperienceLog`
4. `ReflectionRecord`
5. `BehaviorRule`
6. `ProjectedProfile`
7. `BootBriefing`
8. `DebugEvent`

### 设计原则
- canonical store 仍优先 SQLite
- 复杂 JSON 放 repo 层安全序列化
- relations 先轻量，不搞 graph-first

---

## 10. 检索系统规划

建议检索系统按三层建设：

### Layer 1 — Structured + Keyword
- 已有 Phase 1 baseline

### Layer 2 — Intent-guided Targeted Recall
- Phase 2 引入
- 重点是 types / scope / recency bias

### Layer 3 — Hybrid Semantic Retrieval
- Phase 5 引入
- optional vector sidecar
- policy-weighted reranking

### 核心要求
- 排名必须稳定
- 不能为了 fancy semantic search 牺牲可解释性
- retrieval_executed debug event 必须保留

---

## 11. Hook 规划

推荐最终 hook 范围：

### `session_start`
- 已有最小闭环
- 后续可加入 active behavior rules / targeted first-message recall prep

### `message_received`
- Phase 2 开始引入
- 负责 intent + targeted recall + candidate extraction

### `context_compact`
- 后续用于 preserve high-value transient context

### `session_end`
- Phase 3 开始
- 负责 experience logging / session reflection

### `heartbeat`
- 后续用于 cleanup / summarize / archive / promotion checks

### 设计要求
- hook 代码必须薄
- 业务逻辑放 service
- 慢逻辑不要硬塞 fast path

---

## 12. Tool Surface 规划

建议最终工具面如下：

### 已完成
- `evermemory_store`
- `evermemory_recall`
- `evermemory_briefing`
- `evermemory_status`

### Phase 2 追加
- `evermemory_intent`

### Phase 3 追加
- `evermemory_reflect`

### Phase 4 追加
- `evermemory_rules`

### Phase 5 追加（可选）
- `evermemory_profile`
- `evermemory_consolidate`

### 工具设计要求
- 输入输出 JSON-safe
- 空结果正常返回，不乱抛异常
- 返回结构尽量稳定
- tool 不重复实现 service 业务逻辑

---

## 13. 测试策略

## 13.1 测试分层

### unit
- classifier
- policy
- ranking
- conflict
- rule applicability

### integration
- message_received pipeline
- session_start briefing pipeline
- session_end reflection pipeline
- profile recompute flow

### regression
- no duplicate promotion
- explicit beats inferred
- empty-result paths stable
- no silent overwrite

## 13.2 当前建议
Phase 2 开始，每一批任务都要带最小测试，避免后面回头补成灾。

---

## 14. 风险清单

## 14.1 记忆污染
风险：
- 把不该长期保存的东西写进 semantic memory

控制：
- deterministic baseline
- episodic-first policy
- explicitness / confidence gating

## 14.2 retrieval 污染
风险：
- 召回太多噪音
- 召回错 scope

控制：
- strict scope filtering
- intent-guided retrieval
- ranking policy + top-k cap

## 14.3 behavior drift
风险：
- 从弱证据生成错误规则

控制：
- recurrence threshold
- confidence threshold
- explicit review / promotion policy

## 14.4 latency 膨胀
风险：
- 把 understanding / reflection / retrieval 全塞进关键路径

控制：
- fast/slow path 分离
- queue/defer nonessential enrichment

## 14.5 architecture overgrowth
风险：
- 过早抽象
- 过早引入 graph / worker / dashboard

控制：
- 每 phase 严格 scope freeze
- 每批只做必要闭环

---

## 15. 实施原则

后面任何 Codex 实现，都建议遵守这些原则：

1. **先做闭环，再做增强**
2. **先 deterministic，再 optional LLM**
3. **先可解释，再谈智能化**
4. **先最小工具面，再加复杂 operator surface**
5. **任何长期演化都必须 evidence-backed**
6. **不要因为想显得高级就提前引入复杂基础设施**

---

## 16. 最终规划结论

EverMemory 的正确演进顺序应是：

1. **Foundation**（已完成）
2. **Understanding**
3. **Reflection**
4. **Behavior Evolution**
5. **Retrieval/Lifecycle Optimization**
6. **Extended Operations**

其中最重要的战略判断是：

- Phase 1 作为稳定底座，不再随意重开
- Phase 2 先解决“理解”和“定向 recall”
- Reflection 和 behavior 只能建立在稳定 memory substrate 上
- 整个项目必须始终保持“可解释、可治理、可调试”的气质

一句话总结：

**EverMemory 不是做一个更会胡思乱想的 agent，而是做一个更会记、会理解、会反思、但仍受治理的 agent memory foundation。**

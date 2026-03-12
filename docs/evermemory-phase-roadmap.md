# EverMemory 分阶段路线图

## 1. 文档目的

本文档将 EverMemory 全项目拆成可执行的 phase 路线图，回答三个问题：

1. 下一阶段做什么
2. 为什么按这个顺序做
3. 每个阶段完成后，项目状态会发生什么变化

---

## 2. Phase 总览

| Phase | 名称 | 状态 | 核心目标 |
|---|---|---:|---|
| Phase 1 | Foundation | 已完成 | 持久化、deterministic write、continuity、tools |
| Phase 2 | Understanding | 已完成 | 让系统理解当前输入、判断 memory need、做 targeted recall |
| Phase 3 | Reflection | 已完成 | 把 correction / success / failures 变成结构化 lessons |
| Phase 4 | Behavior Evolution | 已完成 | 把 candidate rules 提升为 active behavior rules |
| Phase 5 | Retrieval & Lifecycle Optimization | 已完成 | 提升 recall 质量与 lifecycle 治理 |
| Phase 6 | Extended Operations | 已完成 | explainability/operator/import-export/review/restore/docs 收口 |
| Phase 7 | Release Quality & Operational Hardening | 已完成 | 一键质量门禁、OpenClaw 实测门禁、发布流程与安全收口 |

---

## 3. 为什么顺序必须这样

## 3.1 先 foundation
没有稳定 persistence / continuity / write governance，后面的智能层都会建立在沙地上。

## 3.2 再 understanding
系统必须先知道“这句话是不是需要 recall、需要什么 recall”，否则 retrieval 只能靠显式工具。

## 3.3 再 reflection
系统只有在能理解 interaction 的基础上，才有条件提炼 experience 和 lessons。

## 3.4 再 behavior evolution
reflection 只能产出候选规则，真正激活行为规则必须更后置、更严格。

## 3.5 最后再优化 retrieval / lifecycle
优化应建立在数据结构和行为边界都稳定之后。

---

## 4. Phase 1 回顾（已完成）

### 交付结果
- config
- db/migrations
- repositories
- deterministic write policy
- memory service
- keyword retrieval baseline
- boot briefing service
- runtime session context
- session_start
- tools
- README/operator notes
- tests
- Phase 1 completion summary

### 当前可视化状态
可以理解为：

- 会存
- 会查
- 会在启动时恢复最小 continuity
- 会通过最小 tools 暴露能力
- 但还不会“深理解”“深反思”“自演化”

---

## 5. Phase 2 — Understanding

## 5.1 核心目标
让 EverMemory 不再只是在“显式 store/recall 工具”下工作，
而是开始理解当前交互是否需要 memory、需要哪类 memory。

## 5.2 交付重点
- intent schema
- intent service
- heuristic precheck
- optional LLM structured intent
- retrieval hints
- message_received 最小接线
- evermemory_intent tool
- intent debug events

## 5.3 完成后的能力变化
完成后，系统会从：
- “需要手动 recall”

进化到：
- “能在消息进入时判断是否需要 recall，且知道应 recall 哪类 memory”

这是从基础 memory substrate 走向真正 runtime usefulness 的关键一步。

---

## 6. Phase 3 — Reflection

## 6.1 核心目标
让系统开始从 interaction outcome 中提炼 lessons，而不只是存 memory。

## 6.2 交付重点
- experience logs
- reflection records
- correction/success/failure triggers
- session_end reflection path
- heartbeat/manual reflection path
- candidate lessons / candidate rules
- reflect tool

## 6.3 完成后的能力变化
完成后，系统会从：
- “记得发生过什么”

进化到：
- “知道哪些地方做得不好/做得好，并能形成结构化反思记录”

---

## 7. Phase 4 — Behavior Evolution

## 7.1 核心目标
让 reflection 的结果被治理地转化为 active rules。

## 7.2 交付重点
- behavior_rules schema/repo
- promotion policy
- applicability/ranking
- deprecate/supersede
- rules tool
- runtime rule injection

## 7.3 完成后的能力变化
完成后，系统会从：
- “会反思”

进化到：
- “会在证据充分时，把经验变成稳定行为改进”

---

## 8. Phase 5 — Retrieval & Lifecycle Optimization

## 8.1 核心目标
把 recall 和 lifecycle management 从 baseline 提升到更高质量。

## 8.2 交付重点
- semantic sidecar（optional）
- hybrid ranking
- retrieval policy weights
- dedupe/merge
- summarize/archive
- profile projection enhancement

## 8.3 完成后的能力变化
完成后，系统会从：
- “能 recall”

进化到：
- “更擅长 recall 真正有用的东西，并把 memory 噪音长期控制住”

---

## 9. Phase 6 — Extended Operations

当前状态（2026-03-12）：
- 6A status/debug 已完成
- 6B explainability 已完成
- 6C import/export baseline 已完成
- 6D archive review/restore baseline 已完成
- 6E docs/troubleshooting/operator 收口已完成

## 9.1 核心目标
增强 explainability、operator usability 与外部操作性。

## 9.2 可能内容
- richer status/debug tools
- import/export
- review tools
- memory explainability surface
- archive restore tools
- optional operator workflows

## 9.3 注意
这不是主线优先项，必须排在 memory / understanding / reflection / behavior 之后。
本项目已按该顺序执行并完成 Phase 6。

---

## 10. 每个阶段的完成定义

### Phase 7 完成定义
- 存在一键质量门禁命令（发布前可重复执行）
- OpenClaw 真实运行态 smoke gate 可自动化执行
- CI 与本地门禁边界清楚，文档同步
- 阶段交付可直接给 operator 复现并生成证据

### Phase 2 完成定义
- 能生成稳定 intent record
- 能判断 memoryNeed
- 能以 intent-guided 方式做 targeted recall
- message_received 不明显拖慢关键路径

### Phase 3 完成定义
- correction / success / repeated patterns 能形成 reflection records
- reflect tool 可用
- evidence/confidence 结构齐全

### Phase 4 完成定义
- candidate rules 能被 promotion policy 处理
- active rules 能被 runtime 使用
- 行为变化有证据链

### Phase 5 完成定义
- recall relevance 提升
- lifecycle 噪音下降
- archive / summarize / dedupe 跑通

### Phase 6 完成定义
- operator/explainability usability 明显提高

---

## 11. 路线图结论

整个项目最关键的节奏不是“快把功能加满”，而是：

1. 先稳住 substrate
2. 再做 understanding
3. 再做 reflection
4. 再做 behavior evolution
5. 最后做 retrieval/lifecycle 深化

如果顺序乱了，项目很容易变成：
- 有很多看起来聪明的模块
- 但没有稳定基础
- 最后整体不可解释、不可治理

EverMemory 应避免走这条路。

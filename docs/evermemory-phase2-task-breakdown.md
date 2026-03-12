# EverMemory Phase 2 任务拆分

## 1. 文档定位

本文档将 Phase 2 拆成可直接交给 Codex 的细粒度 batch/task。

目标：
- 拆分细
- 文件级明确
- 验收标准清楚
- 能直接执行

---

## 2. Phase 2 总体拆分

建议拆成 5 个 batch：

- **2A** — intent schema + storage foundation
- **2B** — intent service (heuristics first)
- **2C** — optional LLM enrich + parser/fallback
- **2D** — message_received minimal integration + targeted recall
- **2E** — intent tool + docs/tests/quality收口

这样拆的好处：
- 每批边界清楚
- 每批都有最小闭环
- 每批都能通过 check/build/test
- 不会一次把 Phase 2 做爆

---

# Batch 2A — intent schema + storage foundation

## Objective
新增 IntentRecord 相关类型、migration、intentRepo，为后续 intent service 打基础。

## Why now
没有 schema / storage foundation，后面的 service 只能悬空。

## Scope in
- intent types
- intent_records migration
- intentRepo
- 最小 index/export 接线

## Scope out
- 不做 intent logic
- 不做 message_received
- 不做 LLM enrich
- 不做 tools

## Files to add
- `src/storage/intentRepo.ts`

## Files to change
- `src/types.ts`
- `src/storage/migrations.ts`
- `src/index.ts`

## Interfaces / contracts
新增：
- `IntentRecord`
- `IntentSignals`
- `RetrievalHints`

intentRepo 最小接口：
- `insert(intent)`
- `findById(id)`
- `listRecentBySession(sessionId, limit)`

## Validation
- `npm run check`
- `npm run build`
- 如有最小 repo test，可补 1 条

## Definition of Done
- schema 合法
- migration 可重复运行
- repo 能 insert / find

## Risks
- 类型过大
- migration 字段命名漂移

---

# Batch 2B — intent service (heuristics first)

## Objective
实现 deterministic intent service baseline，优先只靠 heuristics 输出合法 IntentRecord。

## Why now
先把 understanding baseline 做稳，再谈 LLM enrich。

## Scope in
- intent service
- heuristics rules
- score normalization
- repo persistence
- debug logging

## Scope out
- 不做 LLM enrich
- 不做 message_received
- 不做 tool

## Files to add
- `src/core/intent/service.ts`
- `src/core/intent/heuristics.ts`

## Files to change
- `src/index.ts`
- `src/types.ts`
- `src/storage/debugRepo.ts`（如需新增 kind 说明）

## Interfaces / contracts
新增方法：
- `intentService.analyze(input)`

输出必须始终是合法 IntentRecord。

## Validation
- `npm run check`
- `npm run build`
- `npm run test`

## Definition of Done
- obvious correction / memory / planning / execution patterns可识别
- memoryNeed 可输出
- debug event: `intent_generated`

## Risks
- heuristic 规则写太散
- confidence 输出不一致

---

# Batch 2C — optional LLM enrich + parser/fallback

## Objective
在 heuristics baseline 上增加 optional LLM structured enrich，但必须有严格 parser/fallback。

## Why now
这一步是增强，不是基础，应排在 deterministic baseline 之后。

## Scope in
- prompt
- parser
- schema validation
- config flag
- fallback logic

## Scope out
- 不做 message_received integration
- 不做 reflection

## Files to add
- `src/core/intent/prompt.ts`
- `src/core/intent/parser.ts`
- 如需要：`src/llm/json.ts` / `src/llm/guards.ts`

## Files to change
- `src/core/intent/service.ts`
- `src/config.ts`
- `src/types.ts`

## Interfaces / contracts
新增 config：
- `intent.useLLM`
- `intent.fallbackHeuristics`

## Validation
- `npm run check`
- `npm run build`
- `npm run test`

## Definition of Done
- LLM output合法时可 enrich
- 非法 JSON 可 fallback
- 主流程不会因 enrich 失败而崩

## Risks
- 过度依赖 LLM
- schema 校验不严

---

# Batch 2D — message_received minimal integration + targeted recall

## Objective
把 intent service 接进 message_received，并按 intent 做最小 targeted recall。

## Why now
这一步是把 Phase 2 从“有 intent 输出”推进到“理解可驱动 recall”。

## Scope in
- message_received hook
- retrievalService.recallForIntent
- runtime interaction context
- interaction debug events

## Scope out
- 不做 reflection
- 不做 candidate rules
- 不做 archive/profile

## Files to add
- `src/hooks/messageReceived.ts`

## Files to change
- `src/retrieval/service.ts`
- `src/runtime/context.ts`
- `src/index.ts`
- `src/types.ts`

## Interfaces / contracts
新增：
- `RecallForIntentRequest`
- `InteractionRuntimeContext`
- `runtimeContext.setInteractionContext(...)`

## Validation
- `npm run check`
- `npm run build`
- `npm run test`

## Definition of Done
- memoryNeed=none 时不 recall
- targeted/deep 时按 preferredTypes recall
- interaction context 写入成功
- debug event: `interaction_processed`

## Risks
- 关键路径被做重
- recall strategy 过早复杂化

---

# Batch 2E — intent tool + docs/tests/quality 收口

## Objective
补 intent tool、README 说明、测试收口，把 Phase 2 做到最小可交付。

## Why now
前面能力链路已有，最后补 operator/debug 可见性和文档。

## Scope in
- evermemory_intent tool
- README/Phase 2 docs update
- tests 补强
- quality cleanup

## Scope out
- 不继续做 Phase 3
- 不做 reflection/behavior

## Files to add
- `src/tools/intent.ts`
- `test/intent.test.ts`
- `test/message-received.test.ts`

## Files to change
- `src/tools/index.ts`
- `README.md`
- `src/index.ts`

## Interfaces / contracts
工具输入：
- message
- optional scope/context

工具输出：
- structured IntentRecord

## Validation
- `npm run check`
- `npm run build`
- `npm run test`

## Definition of Done
- intent tool 可用
- docs 有 Phase 2 说明
- Phase 2 新路径最小测试齐全
- 可正式总结 Phase 2

## Risks
- docs 与实际实现不一致
- tests 只测 happy path

---

## 3. 执行顺序建议

严格建议按：
- 2A
- 2B
- 2C
- 2D
- 2E

不要跳步。

### 原因
- 2A 是数据基础
- 2B 是 deterministic baseline
- 2C 是增强层
- 2D 才接 runtime
- 2E 最后收口

---

## 4. 每批统一交付要求

后续每批都要求 Codex 输出：
1. 本阶段完成内容
2. 新增/修改文件
3. 核心调用链路
4. 验证结果
5. 当前风险
6. 下一步建议

并执行：
- `npm run check`
- `npm run build`
- `npm run test`

---

## 5. Phase 2 总体验收标准

Phase 2 结束时，应满足：

- 有 IntentRecord schema + storage
- 有 heuristic intent baseline
- 有 optional LLM enrich + fallback
- message_received 最小接线跑通
- recall 可由 intent 引导
- runtime interaction context 可检查
- evermemory_intent tool 可用
- docs/tests 完整到可交付程度

---

## 6. 结论

Phase 2 不应该被实现成：
- 一个大而全的智能总线
- 一个满是黑箱 JSON 的 LLM orchestration 层

它应该被实现成：

**一个清楚、克制、可解释的 understanding layer。**

这份 task breakdown 的目标，就是确保后续 Codex 能按这个方向稳定推进。

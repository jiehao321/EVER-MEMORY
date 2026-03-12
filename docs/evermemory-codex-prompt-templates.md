# EverMemory Codex Prompt 模板集

## 1. 文档目标

本文档提供一套可以直接复制给 Codex 使用的标准 prompt 模板。

目标：
- 降低你后续派任务的沟通成本
- 保证每个 batch 的范围、验证、汇报格式统一
- 尽量减少 Codex 乱扩 scope 的概率

---

## 2. 通用模板

适用于任何 batch 的基础模板：

```text
你现在负责 EverMemory 项目中的一个指定 batch。

项目路径：
/root/.openclaw/workspace/projects/evermemory

必读文档：
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-master-plan.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-phase-roadmap.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-task-planning-principles.md
- /root/.openclaw/workspace/projects/evermemory/docs/<当前 batch 对应文档>
- /root/.openclaw/workspace/projects/evermemory/PHASE1_COMPLETION_SUMMARY.md

你本轮只做：<Batch 名称>

Objective:
- ...

Why now:
- ...

Scope in:
- ...

Scope out:
- ...

Files to add:
- ...

Files to change:
- ...

要求：
1. 严格按 batch 边界实现
2. 不要顺手扩到后续 phase
3. 优先复用已有 service / repo / runtime helpers
4. 保持 deterministic、可解释、可测试
5. 需要时补最小测试，不要扩成测试工程
6. 完成后运行：npm run check && npm run build && npm run test && npm run validate
7. 完成后第一时间给出阶段汇报
8. 然后暂停，等待审核

阶段汇报必须包括：
1. 本阶段完成内容
2. 新增/修改文件
3. 核心调用链路
4. 验证结果
5. 当前风险
6. 下一步建议
```

---

## 3. Phase 2 模板

### 2A — intent schema + storage foundation

```text
你现在负责 EverMemory Batch 2A。

项目路径：
/root/.openclaw/workspace/projects/evermemory

必读文档：
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-master-plan.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-phase-roadmap.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-phase2-technical-plan.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-phase2-task-breakdown.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-task-planning-principles.md
- /root/.openclaw/workspace/projects/evermemory/PHASE1_COMPLETION_SUMMARY.md

你本轮只做：Batch 2A — intent schema + storage foundation。

Scope in:
- IntentRecord 相关类型
- intent_records migration
- intentRepo
- 最小 index/export 接线

Scope out:
- 不做 intent logic
- 不做 message_received
- 不做 LLM enrich
- 不做 tools

Files to add:
- src/storage/intentRepo.ts

Files to change:
- src/types.ts
- src/storage/migrations.ts
- src/index.ts

要求：
- migration 必须可重复执行
- repo 只做最小 insert/find/listRecentBySession
- 不要预建 analytics 层
- 完成后运行 npm run check && npm run build && npm run test && npm run validate
- 完成后汇报并暂停
```

### 2B — intent service (heuristics first)

```text
你现在负责 EverMemory Batch 2B。

必读文档：
- evermemory-master-plan.md
- evermemory-phase2-technical-plan.md
- evermemory-phase2-task-breakdown.md
- evermemory-task-planning-principles.md
- PHASE1_COMPLETION_SUMMARY.md

你本轮只做：Batch 2B — intent service (heuristics first)。

Scope in:
- intent service
- heuristics rules
- score normalization
- repo persistence
- debug logging

Scope out:
- 不做 LLM enrich
- 不做 message_received
- 不做 tool

Files to add:
- src/core/intent/service.ts
- src/core/intent/heuristics.ts

Files to change:
- src/index.ts
- src/types.ts

要求：
- 必须 heuristic first
- 输出必须始终是合法 IntentRecord
- 至少支持 correction / memory / planning / execution obvious cases
- debug event: intent_generated
- 完成后 check/build/test 并汇报暂停
```

### 2C — optional LLM enrich + parser/fallback

```text
你现在负责 EverMemory Batch 2C。

本轮只做：optional LLM enrich + parser/fallback。

Scope in:
- prompt
- parser
- schema validation
- config flag
- fallback logic

Scope out:
- 不做 message_received integration
- 不做 reflection

要求：
- LLM enrich 必须 optional
- parser/schema validation 必须严格
- enrich 失败必须 fallback 到 heuristics，不得阻塞主流程
- 完成后 check/build/test 并汇报暂停
```

### 2D — message_received minimal integration + targeted recall

```text
你现在负责 EverMemory Batch 2D。

本轮只做：message_received minimal integration + targeted recall。

Scope in:
- message_received hook
- retrievalService.recallForIntent
- runtime interaction context
- interaction debug events

Scope out:
- 不做 reflection
- 不做 candidate rules
- 不做 archive/profile

要求：
- memoryNeed=none 时不得 recall
- recall strategy 保持克制
- fast path 不要做重
- 完成后 check/build/test 并汇报暂停
```

### 2E — intent tool + docs/tests/quality 收口

```text
你现在负责 EverMemory Batch 2E。

本轮只做：intent tool + docs/tests/quality 收口。

Scope in:
- evermemory_intent tool
- README/docs 更新
- intent/message_received tests
- quality cleanup

Scope out:
- 不进入 Phase 3

要求：
- tool 输出结构化 IntentRecord
- docs 与实现一致
- tests 不只测 happy path
- 完成后 check/build/test 并汇报暂停
```

---

## 4. Phase 3 模板

### 3A — experience/reflection schema + storage foundation

```text
你现在负责 EverMemory Batch 3A。

本轮只做：experience/reflection schema + storage foundation。

Scope in:
- ExperienceLog / ReflectionRecord types
- migrations
- experienceRepo
- reflectionRepo

Scope out:
- 不做 service logic
- 不做 tool
- 不做 hook integration

要求：
- migration 可重复执行
- repo 保持最小
- 完成后 check/build/test 并汇报暂停
```

### 3B — experience logging service

```text
你现在负责 EverMemory Batch 3B。

本轮只做：experience logging service。

Scope in:
- experience service
- minimal signal mapping
- debug events

Scope out:
- 不做 reflection generation

要求：
- 输出合法 ExperienceLog
- 能持久化
- debug event: experience_logged
- 完成后 check/build/test 并汇报暂停
```

### 3C — reflection service + candidate lesson/rule generation

```text
你现在负责 EverMemory Batch 3C。

本轮只做：reflection service + candidate lesson/rule generation。

Scope in:
- reflection service
- candidate rule generation
- threshold gating
- debug events

Scope out:
- 不做 active rule promotion

要求：
- manual review 路径可生成 reflection
- candidate rules 只能生成，不能激活
- 完成后 check/build/test 并汇报暂停
```

### 3D — session_end minimal integration

```text
你现在负责 EverMemory Batch 3D。

本轮只做：session_end minimal integration。

Scope in:
- session_end hook
- experience write
- thresholded reflection

Scope out:
- 不做 profile/rules/archive

要求：
- hook 保持薄
- 满足条件时可生成 reflection
- 完成后 check/build/test 并汇报暂停
```

### 3E — reflect tool + docs/tests/quality 收口

```text
你现在负责 EverMemory Batch 3E。

本轮只做：reflect tool + docs/tests/quality 收口。

Scope in:
- evermemory_reflect tool
- tests
- docs
- quality cleanup

Scope out:
- 不进入 Phase 4

要求：
- reflect tool 可用
- docs/test 与实际一致
- 完成后 check/build/test 并汇报暂停
```

---

## 5. Phase 4 模板

### 4A — behavior rule schema + storage foundation

```text
你现在负责 EverMemory Batch 4A。

本轮只做：behavior rule schema + storage foundation。

Scope in:
- BehaviorRule types
- migrations
- behaviorRepo

Scope out:
- 不做 promotion service
- 不做 runtime integration

要求：
- schema/repo 最小可用
- 完成后 check/build/test 并汇报暂停
```

### 4B — promotion service + conflict/dedupe checks

```text
你现在负责 EverMemory Batch 4B。

本轮只做：promotion service + conflict/dedupe checks。

Scope in:
- candidate → active promotion logic
- conflict/dedup checks

Scope out:
- 不做 runtime injection

要求：
- 必须 evidence-backed
- 不允许弱 candidate 直接激活
- 完成后 check/build/test 并汇报暂停
```

### 4C — applicability/ranking + runtime read path

```text
你现在负责 EverMemory Batch 4C。

本轮只做：applicability/ranking + runtime read path。

Scope in:
- rule applicability
- rule ranking
- runtime query path

Scope out:
- 不做大规模 hook 改造

要求：
- 可按 scope/intent/context 选 relevant rules
- 完成后 check/build/test 并汇报暂停
```

### 4D — rules tool + minimal rule injection

```text
你现在负责 EverMemory Batch 4D。

本轮只做：rules tool + minimal rule injection。

Scope in:
- evermemory_rules tool
- session_start/message_received 最小 rule read path

Scope out:
- 不做 profile recompute

要求：
- rules tool 结构化输出
- minimal runtime injection 保持克制
- 完成后 check/build/test 并汇报暂停
```

### 4E — docs/tests/quality 收口

```text
你现在负责 EverMemory Batch 4E。

本轮只做：docs/tests/quality 收口。

Scope in:
- tests
- docs
- quality cleanup

Scope out:
- 不进入 Phase 5

要求：
- test/doc/quality 补齐
- 完成后 check/build/test 并汇报暂停
```

---

## 6. Phase 5 模板

### 5A — retrieval ranking refinement
```text
你现在负责 EverMemory Batch 5A。
本轮只做 retrieval ranking refinement。
要求：增强 ranking，但不破坏 baseline；完成后 check/build/test 并汇报暂停。
```

### 5B — optional semantic retrieval sidecar
```text
你现在负责 EverMemory Batch 5B。
本轮只做 optional semantic retrieval sidecar。
要求：semantic 必须 optional；disabled 时 baseline 正常；完成后 check/build/test 并汇报暂停。
```

### 5C — hybrid retrieval integration
```text
你现在负责 EverMemory Batch 5C。
本轮只做 hybrid retrieval integration。
要求：支持 structured/keyword/hybrid 模式；完成后 check/build/test 并汇报暂停。
```

### 5D — dedupe / merge / archive baseline
```text
你现在负责 EverMemory Batch 5D。
本轮只做 dedupe / merge / archive baseline。
要求：噪音治理最小闭环跑通；不要做复杂平台化；完成后 check/build/test 并汇报暂停。
```

### 5E — profile refinement baseline
```text
你现在负责 EverMemory Batch 5E。
本轮只做 profile refinement baseline。
要求：stable/derived 分离明确；derived 不覆盖 explicit stable facts；完成后 check/build/test 并汇报暂停。
```

### 5F — tools/docs/tests/quality 收口
```text
你现在负责 EverMemory Batch 5F。
本轮只做 tools/docs/tests/quality 收口。
要求：收口 Phase 5，不进入 Phase 6；完成后 check/build/test 并汇报暂停。
```

---

## 7. Phase 6 模板

### 6A — richer status/debug surface
```text
你现在负责 EverMemory Batch 6A。
本轮只做 richer status/debug surface。
要求：更强状态面，但不要做复杂 UI；完成后 check/build/test 并汇报暂停。
```

### 6B — explainability tools
```text
你现在负责 EverMemory Batch 6B。
本轮只做 explainability tools。
要求：至少能解释 write/retrieval/rule；完成后 check/build/test 并汇报暂停。
```

### 6C — import/export baseline
```text
你现在负责 EverMemory Batch 6C。
本轮只做 import/export baseline。
要求：导入必须可审查；完成后 check/build/test 并汇报暂停。
```

### 6D — archive restore / review baseline
```text
你现在负责 EverMemory Batch 6D。
本轮只做 archive restore / review baseline。
要求：restore/review 闭环最小跑通；完成后 check/build/test 并汇报暂停。
```

### 6E — docs/troubleshooting/operator 收口
```text
你现在负责 EverMemory Batch 6E。
本轮只做 docs/troubleshooting/operator 收口。
要求：最终文档完整；完成后 check/build/test 并汇报暂停。
```

---

## 8. 使用建议

后续实际使用时：
- 不必每次都从零写 prompt
- 直接复制对应 batch 模板
- 按需补上文件名和少量上下文即可

这样最稳。

# EverMemory Phase 5 任务拆分

## 1. Phase 5 总体拆分

建议拆成 6 个 batch：

- **5A** — retrieval ranking refinement
- **5B** — optional semantic retrieval sidecar
- **5C** — hybrid retrieval integration
- **5D** — dedupe / merge / archive baseline
- **5E** — profile refinement baseline
- **5F** — tools/docs/tests/quality 收口

---

# Batch 5A — retrieval ranking refinement

## Objective
增强 retrieval ranking，把更多有用信号纳入排序。

## Files to add/change
- `src/retrieval/ranking.ts`
- `src/retrieval/service.ts`
- tests for ranking

## Definition of Done
- ranking 支持 recency/importance/confidence/explicitness/scope/type priority

---

# Batch 5B — optional semantic retrieval sidecar

## Objective
增加 optional semantic retrieval substrate，但不破坏 baseline。

## Files to add/change
- `src/retrieval/semantic.ts`
- sidecar storage schema/repo
- config updates

## Definition of Done
- semantic retrieval 可选启用
- disabled 时 baseline 仍正常

---

# Batch 5C — hybrid retrieval integration

## Objective
把 keyword + semantic + policy weighting 组合起来。

## Files to add/change
- `src/retrieval/hybrid.ts`
- `src/retrieval/service.ts`
- tests

## Definition of Done
- recall 可按 mode 选择 structured/keyword/hybrid

---

# Batch 5D — dedupe / merge / archive baseline

## Objective
实现 memory noise control 最小闭环。

## Files to add/change
- `src/core/memory/conflict.ts`
- `src/core/memory/promotion.ts`
- archive-related modules
- tests

## Definition of Done
- duplicate/superseded memory 可识别
- archive baseline 跑通

---

# Batch 5E — profile refinement baseline

## Objective
增强 projected profile，但仍保持 derived/stable 分离。

## Files to add/change
- `src/core/profile/projection.ts`
- profile repo/schema if needed
- tests

## Definition of Done
- stable/derived 分离明确
- derived 不覆盖 explicit stable facts

---

# Batch 5F — tools/docs/tests/quality 收口

## Objective
补充必要工具、文档、测试，把 Phase 5 收口。

## Files to add/change
- optional profile/consolidate tools
- README/docs/tests

## Definition of Done
- Phase 5 docs/tests/quality 完整
- 可正式总结

---

## 2. 总体验收标准

Phase 5 结束时，应具备：
- ranking refinement
- optional semantic sidecar
- hybrid retrieval
- dedupe/merge/archive baseline
- profile refinement baseline
- docs/tests/quality 收口

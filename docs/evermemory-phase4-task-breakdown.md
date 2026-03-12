# EverMemory Phase 4 任务拆分

## 1. Phase 4 总体拆分

建议拆成 5 个 batch：

- **4A** — behavior rule schema + storage foundation
- **4B** — promotion service + conflict/dedupe checks
- **4C** — applicability/ranking + runtime read path
- **4D** — rules tool + session_start / message_received minimal rule injection
- **4E** — docs/tests/quality 收口

---

# Batch 4A — behavior rule schema + storage foundation

## Objective
新增 BehaviorRule 类型、migration、repo。

## Files to add
- `src/storage/behaviorRepo.ts`

## Files to change
- `src/types.ts`
- `src/storage/migrations.ts`
- `src/index.ts`

## Definition of Done
- behavior_rules schema + repo 可用

---

# Batch 4B — promotion service + conflict/dedupe checks

## Objective
实现 candidate → active 的 promotion service。

## Files to add
- `src/core/behavior/service.ts`
- `src/core/behavior/promotion.ts`

## Files to change
- `src/types.ts`
- `src/index.ts`

## Definition of Done
- candidate rules 可被 evaluate/promote/reject
- conflict/dedup 检查最小跑通

---

# Batch 4C — applicability/ranking + runtime read path

## Objective
实现 rules applicability 和 runtime 查询路径。

## Files to add
- `src/core/behavior/applicability.ts`
- `src/core/behavior/ranking.ts`

## Files to change
- `src/runtime/context.ts`
- `src/index.ts`

## Definition of Done
- 可按 scope/intent/context 选出 relevant rules

---

# Batch 4D — rules tool + minimal rule injection

## Objective
提供 evermemory_rules 工具，并把 high-priority rules 最小注入 runtime。

## Files to add
- `src/tools/rules.ts`

## Files to change
- `src/tools/index.ts`
- `src/hooks/sessionStart.ts`
- `src/hooks/messageReceived.ts`
- `src/index.ts`

## Definition of Done
- rules tool 可用
- runtime 可读到 minimal active rules

---

# Batch 4E — docs/tests/quality 收口

## Objective
补 docs/tests/quality，把 Phase 4 收口为可交付。

## Files to add
- `test/behavior.test.ts`
- `test/rules.test.ts`

## Files to change
- `README.md`
- `src/index.ts`

## Definition of Done
- docs/test/quality 齐全
- Phase 4 可正式总结

---

## 2. 总体验收标准

Phase 4 结束时，应具备：
- behavior_rules schema/repo
- promotion policy
- applicability/ranking
- runtime rule read path
- rules tool
- docs/tests/quality 收口

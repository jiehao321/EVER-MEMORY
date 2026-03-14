# EverMemory Rule Rollback / Freeze / Review Guide

本文说明 EverMemory 行为规则的三类治理动作：**freeze**、**deprecate**、**rollback**，以及如何通过 review / explain 追踪规则来源与停用原因。

## 目标

当 reflection 错误提升了行为规则时，需要满足三件事：

1. **可冻结**：先把问题规则从 active 集合中拿掉，避免继续影响会话。
2. **可回滚**：若已有替代规则，可把旧规则标记为 superseded / rolled back。
3. **可审查**：能回答：
   - 规则来自哪个 reflection
   - 为什么被提升
   - 为什么被冻结 / 废弃 / 回滚

本实现尽量复用既有 `rules` / `review` / `explain` 风格，不另起新体系。

---

## 数据链路

每条 behavior rule 现在除了原有 evidence 外，还会记录：

- `trace.promotedFromReflectionId`
- `trace.promotedReason`
- `trace.promotedAt`
- `trace.reviewSourceRefs`
- `trace.promotionEvidenceSummary`
- `state.frozen`
- `state.statusReason`
- `state.statusSourceReflectionId`
- `state.statusChangedAt`
- `trace.deactivatedByRuleId`
- `trace.deactivatedByReflectionId`
- `trace.deactivatedReason`
- `trace.deactivatedAt`

因此一条 rule 的证据链可以追溯到：

- promotion 来源 reflection
- reflection 的 summary / recommendation / confidence / recurrence
- 停用动作对应的 reason / reflection / replacement rule

---

## 1) 查看当前规则

```ts
app.evermemoryRules({
  scope: { userId: 'user-1' },
  limit: 10,
});
```

默认只返回 **active + 非 deprecated + 非 frozen** 规则。

若要把冻结/停用规则也查出来：

```ts
app.evermemoryRules({
  scope: { userId: 'user-1' },
  limit: 20,
  includeInactive: true,
  includeDeprecated: true,
  includeFrozen: true,
});
```

---

## 2) Freeze：先止血

适用场景：

- 规则疑似错误，但还没决定是否永久废弃
- 需要先阻止它继续参与 runtime rules loading
- 想保留证据链，等待后续人工 review

```ts
app.evermemoryRules({
  action: 'freeze',
  ruleId: '<rule-id>',
  reflectionId: '<reflection-id>', // 可选，但建议带上
  reason: '人工审查发现规则过度泛化，先冻结等待复核。',
  includeFrozen: true,
  includeInactive: true,
});
```

效果：

- `state.active = false`
- `state.frozen = true`
- 规则不再进入默认 active rules 集合
- debug 会写入 `rule_frozen`

---

## 3) Deprecate：明确废弃

适用场景：

- 规则确认不再使用
- 不一定有替代规则，但需要明确标记停用

```ts
app.evermemoryRules({
  action: 'deprecate',
  ruleId: '<rule-id>',
  reason: '该规则与当前人工审查流程不一致，已废弃。',
  replacementRuleId: '<new-rule-id>', // 可选
  includeDeprecated: true,
  includeInactive: true,
});
```

效果：

- `state.active = false`
- `state.deprecated = true`
- 如传了 `replacementRuleId`，会写入 `state.supersededBy`
- debug 会写入 `rule_deprecated`

---

## 4) Rollback：按 rule 回滚

适用场景：

- 已确认旧规则错误
- 已有更准确的新规则替代
- 需要清晰记录“被谁替代、为何回滚”
- 没有 `replacementRuleId` 时，不允许执行 rollback

```ts
app.evermemoryRules({
  action: 'rollback',
  ruleId: '<old-rule-id>',
  reflectionId: '<review-reflection-id>',
  replacementRuleId: '<new-rule-id>',
  reason: '旧规则遗漏回滚检查，被更精确的新规则取代。',
  includeInactive: true,
  includeDeprecated: true,
  includeFrozen: true,
});
```

效果：

- 旧规则被停用
- `state.deprecated = true`
- `state.supersededBy = replacementRuleId`
- `trace.deactivatedByRuleId = replacementRuleId`
- `trace.deactivatedReason = reason`
- debug 会写入 `rule_rolled_back`

---

## 5) Review：看来源与证据链

对某条 rule 做审查：

```ts
app.evermemoryReview({
  ruleId: '<rule-id>',
});
```

返回中会包含：

- `ruleReview.rule`
- `ruleReview.reflection`
- `ruleReview.replacementRule`
- `ruleReview.sourceTrace`

重点字段：

- `reflection.id`
- `reflection.summary`
- `reflection.nextTimeRecommendation`
- `reflection.confidence`
- `sourceTrace.promotedFromReflectionId`
- `sourceTrace.promotedReason`
- `sourceTrace.statusReason`
- `sourceTrace.statusSourceReflectionId`
- `replacementRule.id`
- `replacementRule.statement`
- `sourceTrace.deactivatedByRuleId`
- `sourceTrace.deactivatedReason`
- `sourceTrace.reviewSourceRefs`

这套信息足够回答：

- **来自哪个 reflection**
- **为什么被提升**
- **为什么被停用**

---

## 6) Explain：看事件日志

```ts
app.evermemoryExplain({
  topic: 'rule',
  limit: 10,
});
```

现在 `rule` topic 会覆盖：

- `rule_promoted`
- `rule_rejected`
- `rule_frozen`
- `rule_deprecated`
- `rule_rolled_back`

适合回答“最近发生了什么治理动作”。

---

## 推荐治理流程

### A. 怀疑规则错误，但还不确定

1. `evermemoryReview({ ruleId })`
2. `evermemoryExplain({ topic: 'rule', entityId: ruleId })`
3. `evermemoryRules({ action: 'freeze', ... })`

### B. 确认旧规则错了，并有替代规则

1. 提升新规则 / 或人工插入新规则
2. `evermemoryRules({ action: 'rollback', replacementRuleId: newRuleId, ... })`
3. `evermemoryReview({ ruleId: oldRuleId })`

### C. 确认规则永久废弃

1. `evermemoryRules({ action: 'deprecate', ... })`
2. 保留 explain / review 证据链

---

## 注意事项 / 当前边界

- 当前 rollback 是 **by rule**，不会自动批量回滚整个 reflection 产出的所有规则。
- rollback 必须显式提供 `replacementRuleId`，避免“无替代规则的假回滚”。
- frozen rule 默认不会参与 runtime 注入；如要查看，需要显式传 `includeFrozen`。
- deprecate / rollback 都会让规则退出 active 集合，但语义不同：
  - freeze = 暂停使用，等待复核
  - deprecate = 明确废弃
  - rollback = 被证明有误，并被回退/替代
- 对已冻结 / 已废弃 / 已按同一替代规则回滚的规则，重复 mutation 会返回幂等 no-op，而不是继续改写状态。
- review 目前优先追踪 promotion reflection 与最近状态变更 reflection；不会构建更复杂的多跳因果图。

这已经能满足日常 rule governance、人工排障与证据追溯。 

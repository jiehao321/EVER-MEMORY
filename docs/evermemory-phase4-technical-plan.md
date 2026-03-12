# EverMemory Phase 4 详细技术方案

## 1. 文档定位

本文档定义 EverMemory Phase 4（Behavior Evolution）的详细技术方案。

Phase 4 的目标不是“让系统自动改人格”，
而是把 Phase 3 产出的 reflection/candidate rules 通过严格治理，提升为可控的 active behavior rules。

---

## 2. Phase 4 核心目标

Phase 4 需要建立：

1. `BehaviorRule` 数据模型与持久化
2. candidate → active 的 promotion policy
3. rule applicability / ranking
4. deprecate / supersede 逻辑
5. rules tool
6. runtime rule injection

---

## 3. 为什么必须排在 Reflection 后面

如果没有：
- structured experience
- structured reflection
- evidence/confidence/recurrence

那么 behavior evolution 就会变成：
- 一次纠正就长期改行为
- 用模糊印象做长期规则
- 无法解释为什么系统变了

这是必须避免的。

---

## 4. 范围定义

## Scope In
- behavior rule schema/repo
- promotion service
- applicability/ranking
- deprecate/supersede
- rules tool
- runtime read path
- debug events
- tests/docs

## Scope Out
- 不做 profile recompute
- 不做复杂 UI
- 不做完全自动闭环无审核演化

---

## 5. BehaviorRule 设计

建议最小结构：

```ts
interface BehaviorRule {
  id: string;
  statement: string;
  createdAt: string;
  updatedAt: string;
  appliesTo: {
    userId?: string;
    channel?: string;
    intentTypes?: string[];
    contexts?: string[];
  };
  category: 'style' | 'safety' | 'execution' | 'confirmation' | 'memory' | 'planning';
  priority: number;
  evidence: {
    reflectionIds: string[];
    memoryIds: string[];
    confidence: number;
    recurrenceCount: number;
  };
  state: {
    active: boolean;
    deprecated: boolean;
    supersededBy?: string;
  };
}
```

---

## 6. Promotion Policy 设计

candidate rule 只有在以下条件满足时才可激活：
- confidence 达标
- recurrence 达标
- 不与更高优先级规则冲突
- 不是现有规则重复项
- statement 足够窄且可复用

### 推荐阈值
- style rules: recurrence >= 2
- safety / correction-derived rules: recurrence >= 1 但 confidence 更高

---

## 7. Runtime 影响方式

Phase 4 不应粗暴让规则直接改模型人格。

更合理的影响方式：
- session_start：注入 high-priority active rules
- message_received：按 intent/applicability 选出 relevant rules
- retrieval/briefing：用规则影响 recall / continuity weighting

---

## 8. Tool 设计：evermemory_rules

作用：
- 查看 active rules
- 查看 priority / scope / evidence summary
- 未来可扩展 review path

输出应偏结构化、可解释。

---

## 9. 风险

### 风险 1：行为漂移
控制：
- promotion gating
- evidence-backed
- supersede 而不是硬覆盖

### 风险 2：规则过宽
控制：
- narrow statement policy
- duplicate/conflict detection

### 风险 3：规则太多
控制：
- ranking
- category priority
- scope match

---

## 10. 完成定义

Phase 4 完成时，应满足：
- behavior_rules 可持久化
- candidate rules 可被 promotion service 评估
- active rules 可在 runtime 被查询和注入
- rules tool 可用
- debug/test/docs 齐全

---

## 11. 结论

Phase 4 真正要做的不是“让系统自我进化”，
而是：

**让经过治理的 lessons 能稳定影响未来行为。**

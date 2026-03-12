# EverMemory 验收手册

## 1. 文档目标

本文档定义 EverMemory 项目各阶段/各批次的统一验收标准。

---

## 2. 通用验收规则

每个 batch 至少必须满足：

1. 目标命中
2. scope 未漂移
3. check 通过
4. build 通过
5. test 通过（若该 batch 有测试要求）
6. 汇报完整
7. 当前风险已明确说明

---

## 3. 阶段级验收要求

### Phase 1
- 持久化/continuity/tool surface 跑通
- docs/tests/check/build 完整

### Phase 2
- 有 IntentRecord
- message_received 可做 targeted recall
- intent tool 可用
- fast path 没明显失控

### Phase 3
- 有 experience logs
- 有 reflection records
- candidate rules 可生成但不激活
- reflect tool 可用

### Phase 4
- behavior rules 可持久化
- promotion policy 跑通
- active rules 可被 runtime 查询
- rules tool 可用

### Phase 5
- retrieval relevance 提升
- lifecycle noise 降低
- archive/summarize/dedupe 跑通

---

## 4. Codex 阶段汇报验收

一份合格的阶段汇报至少要有：

1. 完成内容
2. 新增/修改文件
3. 核心调用链路
4. 验证结果
5. 当前风险
6. 下一步建议

缺任何一项，都不算完整汇报。

---

## 5. 结论

验收的目标不是“挑语病”，
而是保证 EverMemory 每一步都处于：
- 可解释
- 可验证
- 可继续推进

的状态。

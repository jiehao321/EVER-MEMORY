# EverMemory Behavior Rule Lifecycle Governance

## 目标

为 behavior rule 增加最小可用生命周期治理，避免规则只增不减、错误长期固化，并让 `evermemory_rules` 能暴露规则健康度与治理信号。

## 本次落地内容

### 1. Rule level / maturity

新增两个基础维度：

- `level`
  - `candidate`：低优先级或仍在观察中的规则
  - `baseline`：已进入默认行为基线
  - `critical`：高优先级/高置信度，适合稳定前置约束
- `maturity`
  - `emerging`：刚形成，缺少使用验证
  - `validated`：已有多次命中或重复证据
  - `institutionalized`：高频稳定命中
  - `frozen`：因冲突、纠正、过期等原因被冻结

### 2. 生命周期字段

每条规则新增 `lifecycle`：

- `applyCount`
- `contradictionCount`
- `lastAppliedAt`
- `lastContradictedAt`
- `lastReviewedAt`
- `stale`
- `staleness` (`fresh` / `aging` / `stale` / `expired`)
- `decayScore`
- `frozenAt`
- `freezeReason`
- `expiresAt`

同时补充状态/追踪字段，支持记录冻结、回滚、来源反射与停用原因。

### 3. Decay / expiry 基线

当前采用最小可用治理基线：

- **长期未命中降权**
  - 14 天未命中 → `aging`
  - 30 天未命中 → `stale`，并降权
  - 60 天未命中 → `expired`，继续降权
  - 若规则已过期且从未命中过，会自动停用并冻结
- **被纠正时降级/冻结**
  - `rollback` 会增加 `contradictionCount`
  - 同时降低 priority，并将规则标记为 frozen
- **冲突时停用**
  - 新候选规则与现有激活规则发生直接确认冲突时，旧规则先被冻结为 `conflict`
  - 当前 promotion 仍拒绝新规则，避免直接替换造成错误放大
- **矛盾累计停用**
  - `contradictionCount >= 2` 时，规则自动失活并进入 `deprecated + frozen`

### 4. 应用命中治理

`getActiveRules()` 选中的规则在返回前会：

- 自动 `applyCount + 1`
- 更新 `lastAppliedAt`
- 轻微回补 `decayScore`
- 重新计算 maturity / staleness

因此规则的治理状态会随真实命中逐渐演化，而不是静态元数据。

### 5. evermemory_rules 输出增强

`evermemory_rules` 除原有 `rules` 与 `filters` 外，新增 `governance` 汇总：

- `levels`
- `maturities`
- `frozenCount`
- `staleCount`
- `maxDecayScore`

可用于快速判断当前返回规则集的健康度和治理风险。

## 迁移说明

schema version 升级到 `7`，为 `behavior_rules` 增加生命周期、状态与 trace 所需列。

迁移采用 `ALTER TABLE ADD COLUMN` 的增量方式，对已有数据兼容；旧规则在读出时会被补齐默认生命周期并按当前治理逻辑刷新。

## 当前边界

这是一个 **baseline governance pack**，不是完整策略引擎：

- decay 规则是固定阈值，不支持配置化
- 冲突检测目前只覆盖“确认 / 不确认”这类显式对立语句
- correction/rollback 通过工具层 mutation 驱动，尚未自动接入所有上游纠正事件
- 冻结后没有自动解冻流程，当前依赖人工 review 或后续任务扩展

## 建议后续增强

1. 将 decay 阈值参数化到配置层
2. 将 contradiction 信号接入 intent correction / reflection review 自动链路
3. 增加 supersede/replace 语义，支持新规则替换旧规则而不只是冻结
4. 增加治理审计视图（按 stale/frozen/expired 列表化输出）

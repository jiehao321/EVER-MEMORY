# EverMemory Runtime Validation Matrix

## 目标

本矩阵用于验证 EverMemory 在**真实运行链路**中的最小可用性：

- 记忆是否被正确写入、检索、作用于运行态
- correction → reflection → rule 链路是否闭环
- 是否能抑制假规则 / 过度泛化规则
- scope / channel 边界是否稳定，不发生串扰

本工单刻意**不做大规模业务重构**，而是围绕现有 deterministic baseline、runtime hooks 与 replay tests 建立可重复执行的验证包。

---

## 验证范围

### In scope

1. 偏好记忆（preference memory）
2. 项目连续性（project continuity）
3. correction → reflection → rule
4. false rule suppression
5. scope isolation
6. channel neutrality（模拟）

### Out of scope

1. 真实线上多轮对话流量回放
2. 跨进程 / 分布式一致性
3. 生产环境真实多渠道桥接
4. LLM 参与的开放式质量评审
5. 长周期 retention / aging 的统计验证

---

## 验证资产

### 核心文档

- `docs/evermemory-runtime-validation-matrix.md`
- `docs/evermemory-runtime-validation-report-template.md`

### 可执行验证资产

- `test/runtime-validation.test.ts`

该测试文件将六类场景收敛为可执行 replay pack，优先验证：

- 写入 → 检索 → runtime 注入
- reflection 生成 → candidate rule → promotion
- 规则抑制 / 规则隔离
- scope / channel 边界

---

## 指标类型说明

### 硬指标（Hard Metrics）

硬指标必须由程序断言直接验证，失败即视为回归：

- memory write 是否 accepted / rejected 符合预期
- memory type / lifecycle 是否正确推断
- recall.total 是否达到预期下限
- recall item scope 是否匹配目标 user/project/global
- intent type 是否符合预期
- reflection 是否生成
- candidateRules 是否包含目标规则语义
- behavior promotion 是否成功 / 被拒绝
- rejected reason 是否命中预期（如 `statement_too_vague`）
- channel-scoped behavior rule 是否只在目标 channel 生效

### 代理指标（Proxy Metrics）

代理指标用于近似衡量运行效果，但不能单独证明“用户价值已达成”：

- recall 命中数 >= 1 代表“可能连续”，但不等于最终回答一定连续
- reflection confidence 足够高，代表“可被总结”，但不等于规则一定正确
- rule 被 promotion 成功，代表“结构上闭环”，但不等于该规则长期稳定
- debug event 被写入，代表链路有可观测性，但不等于策略本身有效
- messageReceived 的 runtime context 已注入，代表运行态可用，但不等于最终 agent 一定遵守

---

## 场景矩阵

| 场景 | 目标 | 输入形式 | 核心链路 | 硬指标 | 代理指标 |
|---|---|---|---|---|---|
| 偏好记忆 | 验证用户偏好可写入并在同 user scope 保持隔离 | `evermemoryStore` + recent list / scoped inspection | store → write policy → scoped visibility | accepted=true；type=preference；同 user 可见、其他 user 不可见 | 后续 recall 命中可作为增强指标，但当前不是稳定硬门禁 |
| 项目连续性 | 验证历史项目记忆在后续 planning 消息中被检索 | `messageReceived` replay | intent → recallForIntent → runtime interaction | intent=planning；项目 scope 命中；相关项目记忆被召回 | recall.total >= 1；interaction context 已更新 |
| correction → reflection → rule | 验证纠正信号能沉淀为可加载规则 | experience log + reflection + promote + rules load | experience → reflection → candidate rule → promotion → rules | reflection 非空；候选规则出现；promotion 成功；rules load 命中 | debug events 存在 |
| false rule suppression | 验证过度泛化规则被拒绝 | synthetic reflection record | candidate rule → evaluatePromotionCandidate | promotedRules=0；rejected reason=`statement_too_vague` | rule_rejected event 存在 |
| scope isolation | 验证 user/project 不串扰 | scoped store + scoped recall | store → scoped search | user A 不召回 user B；project alpha 不召回 beta | total 数量符合预期 |
| channel neutrality | 验证 channel-neutral memory 跨渠道可复用，channel rule 不串渠道 | message replay with different channels | recall + behavior loading | 同一 memory 在不同 channel 可被 recall；feishu rule 不进入 discord | runtime interaction 有差异但 recall 一致 |

---

## 详细通过标准

### 1. 偏好记忆

**通过条件**

- 写入 `我偏好先给结论，再给细节。` 被接受
- 推断类型为 `preference`
- 同 user scope 可见，其他 user scope 不可见

**失败信号**

- 被误判为低价值 chatter
- 类型推断错误
- user scope 隔离失效

**备注**

- 当前中文偏好类短 query 的 direct recall 稳定性不足，因此本轮把“成功写入 + 同 scope 可见 + 非目标 scope 不可见”作为硬门禁。
- “自然语言 preference 触发词是否稳定触发 recall / intent preference 分类”暂列为代理能力与后续补强项。

### 2. 项目连续性

**通过条件**

- 项目计划 / 约束被写入 `project` scope
- `messageReceived` 对“继续推进下一阶段”类消息判定为 `planning`
- recall 返回至少一个同项目记忆
- interaction runtime context 被更新

**失败信号**

- intent 未进入 planning
- recall 丢失 project scope
- 只召回无关 user 级碎片

### 3. correction → reflection → rule

**通过条件**

- correction experiences 触发 reflection
- candidate rules 中出现“先复述修正点并确认后再继续执行”类语义
- promotion 成功
- 后续 `evermemoryRules(intent=correction)` 可加载到该规则

**失败信号**

- reflection 未生成
- candidate rules 为空
- promotion 因低置信度 / 去重 / 冲突被拒且无替代规则

### 4. false rule suppression

**通过条件**

- 明显过度泛化规则（如“所有场景都要直接执行，不要提问”）被拒绝
- reject 原因稳定落到 `statement_too_vague`

**失败信号**

- 该类规则被 promotion 成功
- reject reason 漂移导致质量门禁不稳定

### 5. scope isolation

**通过条件**

- user A 检索不到 user B 偏好
- project alpha 检索不到 project beta 约束
- recall item 的 scope 与请求 scope 一致

**失败信号**

- cross-user 泄漏
- cross-project 泄漏
- global / user / project 优先级异常导致串扰

### 6. channel neutrality（模拟）

**通过条件**

- user-level preference memory 可在 Feishu / Discord 模拟消息中都被召回
- channel-scoped behavior rule 仅在目标 channel 生效

**失败信号**

- 记忆错误绑定到 source.channel，导致跨 channel 不可复用
- channel-specific rule 漏到其他 channel

---

## 推荐执行命令

### 最小验证

```bash
npm run build:test && node --test dist-test/test/runtime-validation.test.js
```

### 与既有单测一起执行

```bash
npm run test:unit
```

### 完整本地校验

```bash
npm run validate
```

---

## 本轮实际验证建议

建议至少跑两层：

1. **聚焦回放层**：只跑 `runtime-validation.test.ts`
2. **回归兜底层**：跑 `npm run test:unit`

原因：

- 第一层确认本工单新增 replay pack 自身可执行
- 第二层确认新增断言未破坏既有 deterministic baseline

---

## 已知局限

1. 当前 channel neutrality 是**模拟验证**，不是实际多渠道 E2E
2. 当前验证偏向 deterministic runtime，不评估生成式回答质量
3. 当前没有“真实会话转储 → 自动回放”的 fixture pipeline
4. correction / reflection 质量目前主要通过结构断言，而非人工评审 rubric
5. 尚未覆盖跨 session、跨日、跨归档恢复后的长期连续性
6. 中文 preference 类自然语言触发词与短 query recall 目前不够稳定，因此未将其设为本轮硬门禁

---

## 后续可补强项

1. 增加 `fixtures/runtime-replay/*.json`，把场景输入数据文件化
2. 增加 `scripts/runtime-validation.mjs`，输出 markdown / json 报告
3. 增加“真实历史 transcript → normalize → replay”的回放入口
4. 引入规则质量 rubric，区分 safe / overfit / underspecified / conflicting
5. 在 OpenClaw smoke 中接入一条 lightweight runtime validation gate

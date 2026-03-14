# EverMemory Agent Teams 开发执行板（2026-03-14）

## 1. 目标

将后续开发拆成可并行、可验收、可回滚的批次任务，由项目总监统一把控边界与合并标准。

## 2. Team 分工

### Team A：Runtime & Retrieval
- 负责自动沉淀、连续性、召回路由、briefing 质量
- 不负责发布脚本改造
- 所有改动必须带测试与 KPI 证据

### Team B：Governance & Safety
- 负责规则治理、explainability、import/export/review/restore 安全边界
- 不直接扩大产品宣称边界
- 所有 mutation 路径必须可回滚

### Team C：Ops & Release
- 负责 release gate、质量流水线、文档、回滚与安装链路
- 不修改核心业务策略，除非获得总监批准

## 3. 当前批次

### Batch A1
- Owner: Team A
- 任务：自动沉淀策略强化
- 状态：已完成
- 输入：
  - `src/hooks/sessionEnd.ts`
  - `test/session-end.test.ts`
- 输出：
  - 更严格的 auto capture 边界
  - 更少的低价值 `decision/project_summary`
  - 不降低既有 continuity recall
- DoD：
  - 新增边界测试
  - 原有 sessionEnd / continuity / tools 测试不回退

### Batch A2
- Owner: Team A
- 任务：project continuity summary 强化
- 状态：进行中
- 边界：
  - 只增强项目摘要质量
  - 不同时改 rule promotion 逻辑
- DoD：
  - summary 结构更稳定
  - next-step / decision / constraint 字段真实命中率提高

### Batch A3
- Owner: Team A
- 任务：长周期 continuity 验证矩阵
- 状态：进行中
- 边界：
  - 以验证脚本和基线为主
  - 不在本批做大规模业务改造
- DoD：
  - 新增长周期测试脚本
  - 可并入 release gate

### Batch B1
- Owner: Team B
- 任务：规则冲突与回滚压测
- 状态：已完成
- 边界：
  - 不改变既有 rule category 模型
  - 只加强 mutation / conflict / rollback 路径
- DoD：
  - freeze/deprecate/rollback 冲突路径有测试
  - explainability 能说明规则状态变化

### Batch C1
- Owner: Team C
- 任务：release 流水线提速
- 状态：进行中
- 边界：
  - 不降低门禁强度
  - 只优化执行顺序、缓存、产物稳定性
  - 优先解决 `teams:dev` / `teams:release` 并行时对 `dist` / `dist-test` 的产物竞争
- DoD：
  - `teams:release` 平均耗时下降
  - 输出报告不减少

## 4. 总监边界控制

- 不允许在同一批次同时改“连续性策略”和“规则治理模型”。
- 不允许未带测试直接改自动沉淀逻辑。
- 不允许文档晚于代码。
- 不允许为追求 recall 指标而放松噪音过滤边界。
- 不允许为了引入 LLM/semantic 增强破坏 deterministic baseline。

## 5. 当前决策

当前正式启动：
- `Batch A2` project continuity summary 强化
- `Batch A3` continuity 验证接入 release gate
- `Batch C1` agent-teams 协调锁与流水线稳定性增强

下一批收口重点：
- `Batch A2`
- `Batch A3`
- `Batch C1`

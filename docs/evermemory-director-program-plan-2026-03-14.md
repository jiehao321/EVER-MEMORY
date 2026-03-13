# EverMemory 总监级推进计划（2026-03-14）

## 1. 北极星目标

在 OpenClaw 生态中，把 EverMemory 打造成“最强可治理记忆系统”，衡量标准不是功能数量，而是：
- 召回正确率稳定
- 连续性价值稳定
- 运维与发布可控
- 工具链可直接落地

## 2. 成功指标（KPI）

### 2.1 质量 KPI
- Recall Benchmark Accuracy >= 0.96（连续 4 周）
- OpenClaw Security Gate: critical = 0（每次 release）
- Unit Test Pass Rate = 100%
- Release Gate 通过率 >= 95%

### 2.2 连续性 KPI
- `projectRoutedHits / projectRoutedExecutions` >= 0.85
- 自动记忆沉淀接受率（autoMemory.acceptRate）>= 0.70
- Project Summary 有效率 >= 0.80

### 2.3 工程效率 KPI
- 从需求到可发布平均 lead time <= 3 天
- 回滚流程演练每月至少 1 次
- 高优先级缺陷（P0/P1）修复 SLA <= 24h

## 3. 工作流分队（Agent Team）

- Team A（Runtime & Retrieval）
  - 负责：召回路由、排序、连续性注入、自动沉淀策略
- Team B（Governance & Safety）
  - 负责：规则治理、解释性、导入导出审查、安全门禁
- Team C（Ops & Release）
  - 负责：质量门禁、发布自动化、回滚演练、文档与可观测性

## 4. 任务拆分（可执行任务包）

| Task ID | 任务 | Owner Team | Priority | 状态 | DoD |
|---|---|---|---|---|---|
| T-001 | 插件工具面与库能力完全对齐（全量工具注册） | Team B | P0 | 已完成 | `src/openclaw/plugin.ts` 注册 store/recall/status + briefing/intent/reflect/rules/profile/consolidate/explain/export/import/review/restore，测试通过 |
| T-002 | 插件层参数与输入安全校验统一（scope/source/mode/action） | Team B | P0 | 已完成 | 参数 schema 与解析函数统一，缺参返回结构化错误 |
| T-003 | OpenClaw 适配层回归测试补齐（新增工具冒烟） | Team C | P0 | 已完成 | `test/openclaw-plugin.test.ts` 覆盖新增工具调用链 |
| T-004 | 文档口径收敛：工具暴露边界同步 | Team C | P1 | 已完成 | README + capability matrix + v1 boundary 与代码一致 |
| T-005 | 自动沉淀策略强化（降低噪声、提高 project 价值命中） | Team A | P0 | 进行中 | 连续性 KPI 达标（至少一轮真实运行验证） |
| T-006 | 规则治理强化（冲突检测、冻结/回滚策略压测） | Team B | P1 | 待开始 | 规则突变路径可观测，冲突用例回归通过 |
| T-007 | 发布流水线提速（并行门禁+稳定产物） | Team C | P1 | 待开始 | `teams:release` 平均耗时下降且稳定通过 |
| T-008 | 长周期记忆质量验证（跨 session / 跨日） | Team A | P1 | 待开始 | 新增长期连续性测试矩阵并入 release gate |

## 5. 本轮已完成实现（本次推进）

1. 完成插件工具全注册（T-001）。
2. 完成插件参数解析与 schema 收口（T-002）。
3. 完成 `openclaw-plugin` 测试扩展并通过全量单测（T-003）。
4. 完成 README 与关键边界文档同步（T-004）。

## 6. 下一迭代执行顺序（严格）

1. T-005 自动沉淀策略强化（先做）
2. T-008 长周期记忆验证（并行）
3. T-006 规则治理压测（并行）
4. T-007 发布流水线提速（收口）

## 7. 总监质量红线

- release gate 任一失败，不允许发布。
- 文档与代码边界不一致，不允许合并。
- 未通过回滚演练，不允许打 release 标签。
- 新增能力必须有对应测试，不接受“仅实现不验收”。

## 8. 当前执行结论

EverMemory 已从“核心能力可用”推进到“插件能力完整暴露 + 可发布运维化”阶段。
下一阶段重点不再是补工具数量，而是把连续性质量和长期稳定性做到可度量、可持续领先。

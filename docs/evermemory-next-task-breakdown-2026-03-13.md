# EverMemory 下一阶段详细任务拆分（2026-03-13）

## 1. 目标与周期

目标：在现有连续记忆能力已通过真实实测的基础上，完成“发布可交付 + 运行可观测 + 风险可控”三项收口。  
周期：建议 10 个工作日（2 周）。  
组织：按 Agent Teams 并行推进。

---

## 2. 当前基线（已完成）

截至 2026-03-13 已确认：

- `teams:dev` 通过
- `teams:release` 通过
- `test:openclaw:soak` 通过（高强度真实回归）
- `test:openclaw:soak:feishu` 通过（飞书实战）
- `test:openclaw:continuity` 通过（自动沉淀 + 连续性证据链）

因此接下来的任务重点不是“从零验证可用性”，而是“把可用能力收口为稳定交付版本”。

---

## 3. 任务包总览

| ID | Team | 优先级 | 任务包 | 预计工时 | 依赖 |
|---|---|---:|---|---:|---|
| R0 | 跨团队 | P0 | 变更集拆分与合并策略冻结 | 0.5d | 无 |
| A1 | Team-A | P0 | 自动沉淀链路参数收口 | 1.0d | R0 |
| A2 | Team-A | P1 | decay/lifecycle 参数配置化与阈值说明 | 1.0d | A1 |
| A3 | Team-A | P1 | status/debug 暴露关键 continuity KPI | 1.0d | A1 |
| B1 | Team-B | P0 | 项目召回路由边界与误召回压测 | 1.0d | R0 |
| B2 | Team-B | P1 | recall 质量评分样本集与回归脚本 | 1.5d | B1 |
| B3 | Team-B | P1 | test 数据抑制策略阈值复核 | 0.5d | B1 |
| C1 | Team-C | P0 | 文档-实现一致性收口（README/矩阵/Runbook） | 1.0d | R0 |
| C2 | Team-C | P0 | 质量证据归档机制（report path 标准化） | 0.5d | R0 |
| C3 | Team-C | P1 | host 硬化漂移防回退流程固化 | 0.5d | C2 |
| C4 | Team-C | P1 | 发布清单与回滚清单最终版 | 0.5d | C1,C2,C3 |
| G1 | 跨团队 | P0 | 预发布门禁（dev/release/soak/feishu） | 0.5d | A3,B3,C4 |
| G2 | 跨团队 | P0 | 正式发布门禁与冻结 | 0.5d | G1 |

---

## 4. 详细任务说明

## R0 变更集拆分与合并策略冻结（P0）

- 目标：把当前工作树改动拆为可评审、可回滚的提交批次。
- 范围：
  - Team-A：`src/hooks/*`、`src/core/briefing/*`、`src/core/memory/*`、`test/session-*.test.ts`、`test/decay.test.ts`
  - Team-B：`src/retrieval/service.ts`、`test/retrieval.test.ts`
  - Team-C：`scripts/*`、`package.json`、`README.md`、`docs/*`
- 验收：
  - 每批 commit 单一主题
  - 每批 commit 均可独立通过 `npm run check && npm run test:unit`

## A1 自动沉淀链路参数收口（P0）

- 目标：稳定 `sessionEnd -> auto memory` 产出质量，避免过度写入或漏写。
- 验收：
  - `npm run test:unit` 全通过
  - `npm run test:openclaw:continuity` 连续 3 次通过
  - 连续性脚本中 `autoMemoryEvents > 0` 且 `memoryCount > 0`

## A2 decay/lifecycle 参数配置化与阈值说明（P1）

- 目标：让 decay 参数可配置、可解释、可回退。
- 交付：
  - 参数项文档说明（默认值、建议区间、回滚建议）
  - 变更后的验证记录
- 验收：
  - `npm run test:unit`
  - `npm run teams:dev`

## A3 status/debug 暴露 continuity KPI（P1）

- 目标：在 `status/debug` 中稳定输出以下指标：
  - auto memory generated/accepted/rejected
  - project summary generated/accepted
  - recall suppression 计数
- 验收：
  - 指标可通过真实回归读到
  - 字段命名稳定且文档同步

## B1 项目召回路由边界与误召回压测（P0）

- 目标：确认 `project_progress/current_stage/next_step/last_decision` 路由稳定。
- 验收：
  - `test/retrieval.test.ts` 新增边界样例并通过
  - 真实回归中 project-oriented route 命中符合预期

## B2 recall 质量评分样本集与回归脚本（P1）

- 目标：建立 20~50 条标准化问题样本，形成可重复评分流程。
- 验收：
  - 有样本集与评分脚本
  - 产出 baseline 分数与本轮分数对比

## B3 test 数据抑制策略阈值复核（P1）

- 目标：减少 test 样本污染真实召回，避免过度抑制导致漏召回。
- 验收：
  - test suppression 指标可观测
  - 不出现“真实数据被整体压制”回归

## C1 文档-实现一致性收口（P0）

- 范围文档：
  - `README.md`
  - `docs/evermemory-capability-matrix.md`
  - `docs/evermemory-v1-boundary.md`
  - `docs/evermemory-operator-runbook.md`
  - `docs/evermemory-troubleshooting.md`
- 验收：
  - 明确区分“代码已实现 / 插件已注册 / 默认生产能力”

## C2 质量证据归档机制（P0）

- 目标：统一记录每次门禁的 report 路径与结果摘要。
- 验收：
  - 每次 `teams:dev/release/soak` 都能沉淀证据路径
  - 发布清单可直接引用证据

## C3 host 硬化漂移防回退流程（P1）

- 目标：当 security critical 复发时，标准化“检测-修复-复测”流程。
- 验收：
  - 操作文档明确
  - 演练一次并记录结果

## C4 发布清单与回滚清单最终版（P1）

- 目标：确保发布/回滚流程可执行，不依赖单人经验。
- 验收：
  - 发布前检查项完整
  - 回滚路径有命令级指引

## G1 预发布门禁（P0）

- 必跑命令：
  - `npm run teams:dev`
  - `npm run teams:release`
  - `npm run test:openclaw:soak`
  - `npm run test:openclaw:soak:feishu`
- 验收：全部通过，且报告文件可追溯

## G2 正式发布冻结（P0）

- 目标：冻结参数、打包变更说明、确认回滚点。
- 验收：
  - 发布签署记录
  - 回滚演练记录

---

## 5. 执行顺序（关键路径）

1. `R0`  
2. 并行：`A1` + `B1` + `C1/C2`  
3. 并行：`A2/A3` + `B2/B3` + `C3/C4`  
4. `G1`  
5. `G2`

若 `A1` 或 `B1` 未通过，不进入 `G1`。

---

## 6. 每日节奏（固定）

每天开始：

- `npm run teams:status`

每日集成前：

- `npm run teams:dev`

每日结束前：

- 记录当天 report 路径
- 更新任务板状态（Done/In Progress/Blocked）

---

## 7. 风险与阻塞处理

- 若出现 security critical：
  - 先 `npm run openclaw:harden`
  - 再 `npm run test:openclaw:security`
  - 最后重跑 `teams:release`
- 若出现实测 flaky：
  - 先重跑单项脚本 3 次
  - 再判定是否为代码回归
- 若出现 recall 质量下降：
  - 回滚到上一个稳定参数集
  - 保留问题样本进入 B2 追踪

---

## 8. 本文档的使用方式

- 本文档作为“派工单”使用，不替代技术设计文档。
- 所有任务更新应同步到执行看板文档：
  - `docs/evermemory-execution-board-2026-03-13.md`

---

## 9. 最新进度更新（2026-03-13 晚）

已完成：

1. `A1`：连续记忆链路 3 连跑通过（`test:openclaw:continuity` x3）
2. `A3`：status/debug continuity KPI 已上线并通过单测
3. `B1`：路由边界与误召回压测用例已覆盖并通过
4. `B2`：20 条召回样本 + 评分脚本已落地，准确率 95%（19/20）
5. `C3`：安全漂移“检测-硬化-复测-发布门禁”已实战演练通过

关键证据：

- `/tmp/evermemory-recall-benchmark-2026-03-13T09-55-25.161Z.json`
- `/tmp/evermemory-openclaw-security-recover-2026-03-13T09-37-45.237Z.json`
- `/tmp/evermemory-agent-teams-dev-2026-03-13T09-40-26.640Z.json`
- `/tmp/evermemory-openclaw-soak-2026-03-13T09-53-24.409Z.json`

---

## 10. 接下来 48 小时任务细分（总监派工）

### 10.1 Team-B（B3）抑制阈值复核与 next_step 修正

目标：
- 把 `next_step` 准确率从 4/5 提升到 >= 5/5（或给出可解释留白）

动作：
1. 基于 `config/recall-benchmark-samples.json` 补充 10 条 `next_step` 样本
2. 执行 `node ./scripts/recall-benchmark.mjs --min-accuracy 0.96`
3. 输出阈值与样本变化说明（含 before/after 对比）

验收：
- 基准样本 >= 30
- `next_step` 分类准确率 >= 0.9

### 10.2 Team-C（C4）发布与回滚清单终版

目标：
- 形成命令级发布/回滚手册，避免单点经验依赖

动作：
1. 固化发布前检查项（dev/release/soak/feishu/benchmark）
2. 固化回滚命令与证据引用规范
3. 在 README 与 runbook 对齐命令入口

验收：
- 清单可单人按文档执行
- 随机抽测 1 次回滚演练路径

### 10.3 Cross（G1）预发布签署

目标：
- 完成可追溯的预发布签署包

动作：
1. 汇总当天全部 report 路径
2. 生成签署记录（通过/风险/回退点）
3. PM + TechLead 确认

验收：
- `G1` 转 `done`
- 进入 `G2` 冻结发布准备

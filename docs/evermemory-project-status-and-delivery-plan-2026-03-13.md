# EverMemory 项目进展盘点与交付计划（2026-03-13）

## 1. 文档目的

作为当前项目经理视角的执行文档，明确三件事：

1. 当前真实进展到哪里（不是仅看历史文档声明）
2. 当前阻塞与风险是什么（按优先级分级）
3. 下一轮如何按周推进并可验收交付

---

## 2. 本次盘点范围

盘点时间：2026-03-13  
盘点范围：代码、测试、门禁、文档一致性、OpenClaw 实机链路

已执行验证：

- `npm run check`
- `npm run test:unit`
- `npm run validate`
- `npm run quality:gate`
- `npm run quality:gate:openclaw`

补充说明：

- `quality:gate:openclaw` 首次执行曾出现主机安全配置漂移（critical=2）
- 已执行 `npm run openclaw:harden` 修复主机配置后复测通过

---

## 3. 当前项目状态快照

### 3.1 规模与基线

- 代码：`src` 76 个 TypeScript 文件
- 测试：`test` 28 个 TypeScript 测试文件
- 文档：`docs` 50 份 Markdown 文档
- 最近主线推进：2026-03-11 至 2026-03-13 连续提交，聚焦质量门禁、OpenClaw 硬化、continuity/decay 整改

### 3.2 阶段状态

| 轨道 | 状态 | 结论 |
|---|---:|---|
| Phase 1~7 历史能力 | 已完成 | 与既有文档一致，质量与发布门禁已建立 |
| 连续性整改（自动沉淀） | 进行中 | 代码已大幅落地，尚未完成文档与发布收口 |
| 记忆衰减治理（decay） | 进行中 | 模块与测试已加入，需补运行策略与观察指标 |
| 生产运维硬化 | 部分完成 | 有硬化脚本与门禁，但主机配置存在漂移风险 |

### 3.3 本轮代码进展（未提交工作树）

当前工作树显示 13 个已改文件 + 2 个新增文件，改动核心包括：

- `sessionEnd` 自动记忆候选提炼与分类写入
- 项目连续性摘要（project summary）自动沉淀
- `sessionStart` briefing 结构增强与去重/裁剪优化
- retrieval 项目进展路由、测试数据抑制、候选策略与打分增强
- decay 评分与 lifecycle 迁移/归档逻辑
- OpenClaw 上下文注入去重与优先级增强

这说明项目已经进入“Phase 7 后的产品化补强阶段”，不是停留在纯规划状态。

---

## 4. 质量与门禁状态

### 4.1 当前结果

- TypeScript 检查：通过
- 单元测试：86/86 通过
- `validate`：通过
- `quality:gate`：通过
- `quality:gate:openclaw`：通过（含 smoke + security）

### 4.2 发现的问题

首次 OpenClaw 安全门禁失败，根因是主机侧配置漂移，出现：

- `security.exposure.open_groups_with_elevated`
- `security.exposure.open_groups_with_runtime_or_fs`

处理结果：执行硬化脚本后恢复到 baseline（critical=0, warn=5）。

---

## 5. 主要缺口与风险分级

## P0（必须立即收口）

1. **发布收口缺失**：当前核心改动尚未形成可审阅的批次提交（大改动集中在工作树）。
2. **文档-实现不同步**：README/能力矩阵/运行手册尚未完整反映 continuity/decay 的新行为与边界。
3. **主机配置漂移风险**：安全门禁依赖 host 配置稳定，若无固定流程容易再次回退。

## P1（本迭代内完成）

1. **观测指标不足**：缺少“自动沉淀命中率、项目摘要命中率、test 数据抑制率”等运营指标看板。
2. **灰度策略不足**：缺少 continuity 新链路的灰度开关、回滚开关与操作 SOP。
3. **工具面与库能力差距**：目前插件注册工具仍以基础三项为主，需要明确“默认可用能力”边界。

## P2（下一迭代）

1. 衰减参数（阈值/权重）精细化与场景化
2. 回忆排序策略的长期 A/B 评估机制
3. 文档包减重与重复信息清理

---

## 6. 下一轮详细交付计划（建议 3 周）

## Week 1（稳定化与可发布）

目标：把当前大改动从“可运行”变成“可发布”。

任务：

1. 代码批次拆分与提交（按主题分 3~4 个 commit）
2. 完成文档同步：
   - `README.md`
   - `docs/evermemory-phase-roadmap.md`
   - `docs/evermemory-v1-boundary.md`
   - `docs/evermemory-capability-matrix.md`
   - `docs/evermemory-operator-runbook.md`
   - `docs/evermemory-troubleshooting.md`
3. 为 continuity/decay 增加配置开关说明与默认值说明
4. 固化“安全门禁失败 -> 硬化 -> 复测”操作流程

验收标准：

- PR 可读（变更主题明确，评审可定位）
- `quality:gate:openclaw` 连续两次通过
- 文档与实现无明显冲突描述

## Week 2（灰度验证与运营可观测）

目标：验证新链路在真实使用中的效果，避免“只在测试中好看”。

任务：

1. 增加关键 KPI 统计并写入 debug/status：
   - auto memory generated/accepted/rejected
   - project summary generated/accepted
   - retrieval candidate test suppression 计数
2. 制定并执行灰度样本集（真实项目问题 20~30 条）
3. 对比整改前后 recall 命中质量（定性+定量）
4. 输出灰度报告（问题、回退点、参数建议）

验收标准：

- 有可复用灰度脚本/样例
- KPI 能从 status/debug 中稳定读取
- “项目进展/阶段/下一步/最近决策”问题命中率明显提升

## Week 3（生产化与冻结）

目标：形成稳定发布版本，进入维护节奏。

任务：

1. 参数冻结（decay 权重/阈值、召回策略关键参数）
2. 发布前回归：
   - `quality:gate`
   - `quality:gate:openclaw`
   - 关键人工对话回放
3. 发布说明与回滚说明更新
4. 建立迭代后 backlog（P1/P2）

验收标准：

- 发布版本通过全部门禁
- 回滚路径清晰且可实操
- 下轮优化项有明确优先级与负责角色

---

## 7. 角色分工建议（RACI 轻量版）

| 工作项 | PM | Core Dev | QA | Ops |
|---|---|---|---|---|
| 批次拆分与提测 | A | R | C | I |
| 文档同步 | A | R | C | I |
| 灰度样本与结果评估 | A | R | R | C |
| 安全门禁与主机硬化 | C | C | C | R/A |
| 发布与回滚演练 | A | R | R | R |

说明：

- R=Responsible（执行）
- A=Accountable（最终负责）
- C=Consulted（协作）
- I=Informed（知会）

---

## 8. 最终结论

截至 2026-03-13，EverMemory 已不是“规划待实现”状态，而是处于“高价值产品化收口”阶段：

- 代码能力：已显著推进并通过全量门禁
- 工程质量：可交付，但需完成提交与文档收口
- 运维稳定性：可控，但需持续防止主机配置漂移

下一步应严格执行本计划中的 Week 1~3，优先把“已实现能力”转化为“可稳定运营能力”。


# EverMemory 文档索引

## 1. 文档目标

本文档用于说明 EverMemory 项目内各文档的作用、阅读顺序、适用场景。

所有核心规划、设计、task 文档都收口在：
- `projects/evermemory/docs/`

项目阶段总结文档位于：
- `projects/evermemory/PHASE1_COMPLETION_SUMMARY.md`

---

## 2. 推荐阅读顺序

如果是第一次接触项目，建议按以下顺序阅读：

1. `evermemory-master-plan.md`
2. `evermemory-phase-roadmap.md`
3. `evermemory-task-planning-principles.md`
4. `evermemory-risk-and-dependency-matrix.md`
5. `evermemory-module-ownership-map.md`
6. `evermemory-technical-design.md`
7. `evermemory-technical-design-v2.md`
8. `evermemory-v2-implementation-plan.md`
9. `../PHASE1_COMPLETION_SUMMARY.md`
10. `evermemory-phase2-technical-plan.md`
11. `evermemory-phase2-task-breakdown.md`
12. `evermemory-phase3-technical-plan.md`
13. `evermemory-phase3-task-breakdown.md`
14. `evermemory-phase4-technical-plan.md`
15. `evermemory-phase4-task-breakdown.md`
16. `evermemory-phase5-technical-plan.md`
17. `evermemory-phase5-task-breakdown.md`
18. `evermemory-phase6-technical-plan.md`
19. `evermemory-phase6-task-breakdown.md`
20. `evermemory-phase7-technical-plan.md`
21. `evermemory-phase7-task-breakdown.md`
22. `evermemory-codex-execution-guide.md`
23. `evermemory-codex-prompt-templates.md`
24. `evermemory-acceptance-handbook.md`
25. `evermemory-operator-runbook.md`
26. `evermemory-troubleshooting.md`
27. `evermemory-release-quality-checklist.md`
28. `evermemory-quality-audit-report.md`
29. `evermemory-quality-remediation-task-list.md`
30. `evermemory-code-review-report-2026-03-12.md`
31. `evermemory-code-fix-report-2026-03-12.md`
32. `evermemory-openclaw-e2e-report-2026-03-12-phase2.md`
33. `evermemory-final-planning-summary.md`
34. `evermemory-final-acceptance-report-2026-03-12.md`

---

## 3. 文档说明

### 总纲类

#### `evermemory-master-plan.md`
作用：
- 全项目总规划
- 定义 phase 划分、总体架构原则、边界、路线图

#### `evermemory-phase-roadmap.md`
作用：
- 分阶段路线图
- 说明为什么按这个顺序做

#### `evermemory-final-planning-summary.md`
作用：
- 对整套规划文档包做最后收束
- 说明如何整体使用

#### `evermemory-docs-index.md`
作用：
- 文档包入口
- 阅读顺序与用途说明

---

### 方法与执行类

#### `evermemory-task-planning-principles.md`
作用：
- 定义后续 task 如何拆分
- 约束什么是合格 batch

#### `evermemory-codex-execution-guide.md`
作用：
- 定义如何把文档交给 Codex 执行
- 约束执行纪律

#### `evermemory-codex-prompt-templates.md`
作用：
- 提供可直接复制给 Codex 的标准 prompt 模板

#### `evermemory-acceptance-handbook.md`
作用：
- 统一验收规则
- 定义阶段汇报最低合格标准

#### `evermemory-risk-and-dependency-matrix.md`
作用：
- 说明 phase 依赖关系
- 集中列出项目级风险与控制策略

#### `evermemory-module-ownership-map.md`
作用：
- 说明各模块负责什么、不负责什么
- 防止职责混乱

#### `evermemory-docs-audit-checklist.md`
作用：
- 用于最后检查文档包是否完整、命名统一、可直接给 Codex 用

#### `evermemory-operator-runbook.md`
作用：
- 运营/开发的日常操作手册
- status/explain/import/export/review/restore/consolidate 的标准流程

#### `evermemory-troubleshooting.md`
作用：
- 常见故障排查与恢复手册
- 覆盖环境、测试链路、导入恢复闸门等问题

#### `evermemory-release-quality-checklist.md`
作用：
- 发布前质量检查清单
- 统一 `quality:gate` / `quality:gate:openclaw` 执行口径

---

### 设计类

#### `evermemory-technical-design.md`
作用：
- 原始技术设计（偏 v1 / Phase 1 视角）

#### `evermemory-technical-design-v2.md`
作用：
- v2 正式技术设计
- 给出 understanding / reflection / behavior evolution 的正式方向

#### `evermemory-v2-implementation-plan.md`
作用：
- v2 实现级设计
- 给出文件结构、表结构、模块职责的实现导向说明

---

### 阶段任务与方案类

#### `evermemory-phase1-dev-task-list.md`
作用：
- Phase 1 的历史任务清单（已完成）

#### `../PHASE1_COMPLETION_SUMMARY.md`
作用：
- Phase 1 完成总结
- 当前 stable baseline 的正式结论文档

#### `evermemory-phase2-technical-plan.md`
作用：
- Phase 2 详细技术方案

#### `evermemory-phase2-task-breakdown.md`
作用：
- Phase 2 细粒度任务拆分

#### `evermemory-phase3-technical-plan.md`
作用：
- Phase 3 详细技术方案

#### `evermemory-phase3-task-breakdown.md`
作用：
- Phase 3 细粒度任务拆分

#### `evermemory-phase4-technical-plan.md`
作用：
- Phase 4 详细技术方案

#### `evermemory-phase4-task-breakdown.md`
作用：
- Phase 4 细粒度任务拆分

#### `evermemory-phase5-technical-plan.md`
作用：
- Phase 5 详细技术方案

#### `evermemory-phase5-task-breakdown.md`
作用：
- Phase 5 细粒度任务拆分

#### `evermemory-phase6-technical-plan.md`
作用：
- Phase 6 详细技术方案

#### `evermemory-phase6-task-breakdown.md`
作用：
- Phase 6 细粒度任务拆分

#### `evermemory-phase7-technical-plan.md`
作用：
- Phase 7 发布质量与运行硬化技术方案

#### `evermemory-phase7-task-breakdown.md`
作用：
- Phase 7 任务拆分与验收口径

---

### 质量审查与整改类

#### `evermemory-quality-audit-report.md`
作用：
- 项目级质量审查结论
- 问题优先级与治理方向

#### `evermemory-quality-remediation-task-list.md`
作用：
- 质量整改任务清单
- QA batch 执行边界与验收要求

#### `evermemory-code-review-report-2026-03-12.md`
作用：
- 代码层深度审查报告
- P1/P2/P3 风险与测试缺口

#### `evermemory-code-fix-report-2026-03-12.md`
作用：
- 对审查问题的修复落地记录
- 已修复项、未修复项与后续计划

#### `evermemory-final-acceptance-report-2026-03-12.md`
作用：
- 最终阶段验收结论文档
- 汇总质量门禁与阶段完成状态

#### `evermemory-openclaw-e2e-report-2026-03-12-phase2.md`
作用：
- OpenClaw 真实运行态实测证据报告
- store/recall/status 与 DB 落盘验证记录

---

## 4. 推荐给 Codex 的最小文档集

如果只是让 Codex 执行某一批任务，建议最少给它：

- `evermemory-master-plan.md`
- `evermemory-phase-roadmap.md`
- `evermemory-task-planning-principles.md`
- 当前 batch 对应 technical plan / task breakdown
- `../PHASE1_COMPLETION_SUMMARY.md`
- `evermemory-codex-execution-guide.md`
- `evermemory-operator-runbook.md`
- `evermemory-troubleshooting.md`
- 如想省事：再加 `evermemory-codex-prompt-templates.md`

---

## 5. 后续新增文档规则

后续所有 EverMemory 新文档，都应继续放在：
- `projects/evermemory/docs/`

不要再放到 workspace 根级 `docs/`。

---

## 6. 结论

这份索引的作用不是替代其他文档，
而是让 EverMemory 文档包形成：
- 清楚入口
- 清楚层次
- 清楚阅读顺序
- 清楚执行方式

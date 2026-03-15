# EverMemory Changelog

## v0.0.1 (2026-03-15)

### Phase G: 体验与生态
- G-001: 零配置开箱即用（`autoSetup.ts`），plugin `start()` 自动诊断 embedding、数据库、首次运行状态并输出建议。
- G-002: 大管家欢迎体验，`profile_onboard` 前置欢迎语，完成后给出确认信息。
- G-004: 多格式导入导出（`exportService.ts`），支持 JSON/Markdown 导出与带验证的批量导入，新增 `memory_export`/`memory_import` 工具命令。
- G-005: `doctor` 命令增强，覆盖数据库、迁移、类型分布、嵌入、孤立嵌入、规则、整体健康 7 项检查并给出建议。

### Phase F: 主动进化引擎
- F-001: 主动学习循环（`activeLearning.ts`），`session_end` 自动提炼 `lesson`/`pattern`/`insight`/`warning` 洞察。
- F-002: 主动提醒机制（`beforeAgentStart.ts`），在会话前注入 `warning`/`lesson` 记忆，并按 `relevantRules` 过滤规则。
- F-003: 自我整理引擎（`housekeeping.ts`），执行近重复合并、过时归档、高频强化，`runIfNeeded` 提供 24h 节流。
- F-004: 行为规则自进化（`autoPromotion.ts`），在 `confidence>=0.85` 且 `evidence>=2` 时自动晋升并打 `auto_promoted` 标签。
- F-005: 智能度成长指标（`SmartnessMetricsService`），提供 5 维评分与趋势分析，接入 `growth-report` 与 `smartness` 工具命令。

### Phase E: 用户心智模型
- E-001: `session_end` 后自动触发 profile 重算（`profileProjection.recomputeForUser`），`SessionEndResult` 新增 `profileUpdated`。
- E-002: 偏好图谱（`preferenceGraph.ts`），推断隐式偏好与冲突，并向 briefing 注入沟通风格和工作习惯摘要。
- E-003: `session_start` 注入完整 `userProfile`（`communicationStyle`、`likelyInterests`、`workPatterns`）到 `RuntimeSessionContext`。
- E-004: 跨项目知识迁移（`crossProjectTransfer.ts`），将全局 `explicit_constraint` 自动注入 briefing constraints。
- E-005: 对话风格自适应，briefing 可按 `concise`、`detailed`、`structured` 调整条目数量与详细程度。

### Phase D: 激活语义大脑
- D-001: 本地嵌入默认开启，provider 默认 `local`，在 `@xenova/transformers` 缺失时优雅降级为 NoOp。
- D-002: auto-capture 语义去重，在 cosine `> 0.92` 时跳过重复写入，目标 accept rate `>= 0.90`。
- D-003: `beforeAgentStart.ts` 精准语义注入，在 `messageReceived` 末尾补充语义命中记忆，并标记 `metadata.source='semantic'`。
- D-004: 记忆冲突检测与自愈（`conflict.ts`），针对相似度 `0.75-0.92` 与矛盾词对自动保留较新版本并打 `conflict_resolved` 标签。
- D-005: `scripts/growth-report.mjs` 提供成长指标周报（`npm run growth:report`）。
- D-006: 首次安装 onboarding 问卷（`OnboardingService`），提供 6 个问题与 `profile_onboard` 工具。

### Phase C: 稳定性
- C-001: KPI 版本追踪器，监控 recall accuracy、unit pass、continuity、acceptRate 的跨版本回退。
- C-002: soak 与 KPI 纳入 release gate，新增 `quality:gate:full` 全量验证流程。
- C-003: `stability:check` 长期稳定性验证编排器，已接入 `teams:release`。

### Phase B: 治理产品化
- B-001: `explain` 工具扩展 `session`、`archive`、`intent` topic，并输出结构化 meta。
- B-002: operator 端到端工作流测试覆盖 `review→explain→restore→verify` 与 `rule→explain→deprecate` 场景。
- B-002: `restore` 增加审计字段 `appliedAt`、`userImpact`。
- B-003: import 错误诊断增强，输出 `detail`、`hint`、`summary` 并提示 batch truncation 建议。

### Phase A: 连续性产品化
- T-005: auto-capture 质量强化，`project_summary` 按字段密度评分并去除占位符。
- T-006: 规则治理压测，覆盖 freeze、deprecate、rollback、conflict 四类场景。
- T-007: 构建指纹缓存与增量编译，`teams:dev` 从 37s 优化到 17.5s（-53%）。
- T-008: 5 轮跨 session 连续性验证矩阵，已纳入 release gate。

### Phase 1-7: 基础架构
- 14 个工具、7 大服务、SQLite WAL、TypeBox schema、TypeScript strict ESM。

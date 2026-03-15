# EverMemory Guide (CLAUDE)

## 项目概述
- EverMemory：OpenClaw 的确定性记忆插件（v0.0.1），服务于可靠的知识写入与召回。
- 核心原则：确定性优先、操作员优先、渐进式加固。
- 运行环境：Node.js 22.x、TypeScript 5.9.2、ES2022、strict ESM；SQLite（WAL）+ better-sqlite3；TypeBox 0.34.48 负责 schema 验证。

## 架构速览
- `src/core/`：行为、briefing、意图、记忆、策略、profile、反思等核心服务。
- `src/retrieval/`：结构化、关键词、混合检索策略（`strategies/` 目录）匹配不同场景。
- `src/embedding/`：标准化的嵌入提供者；通过 `EVERMEMORY_EMBEDDING_PROVIDER` 选择 none/local/openai。
- `src/storage/`：SQLite 仓库 + 幂等迁移（Memory/Intent/Reflection/Behavior/Profile/Briefing/Experience/Semantic/Debug）。
- `src/hooks/` 与 `src/openclaw/`：生命周期钩子与 OpenClaw 集成适配。
- `src/tools/`：store、recall、status、briefing、rules 等工具指令。
- 其他支撑：`runtime/` 上下文追踪、`types/` TypeBox 类型、`util/` 工具函数、`docs/` 运维手册、`test/` 单元+集成测试（28 个文件）。

## 构建与验证
```bash
npm run build            # 清理 + tsc 编译
npm run build:test       # 编译测试文件
npm run check            # 类型检查
npm test                 # node --test 运行单元/集成测试
npm run validate         # doctor + check + test 综合验证
npm run teams:dev        # 开发门禁
npm run teams:release    # 发布门禁
npm run test:openclaw:smoke
npm run test:openclaw:continuity
```

## 开发工作流铁律
1. 任何编码都要通过 `mcp__codex__codex` 调用 Codex，禁止在 Claude Code 中直接写主逻辑。
2. 仅对极小改动（<20 行、typo、注释）可直接操作，其余一律走 TDD 流程：先测红 → 实现绿 → 重构。
3. 完成实现后必须提交给 code-reviewer agent 审查。
4. 构建必须保持 0 错误，最少执行 `npm run build`。

## 编码规范
- 遵循 RTK 全局规范：不可变数据模式、高内聚低耦合、小文件（200-400 行，绝不超过 800 行）。
- 所有错误需要显式处理；系统边界必须校验输入；新增能力需保持可解释和可回滚。
- 结构化配置优先，避免隐式魔数；拆分复杂逻辑并用 TypeBox schema 覆盖输入输出。

## 测试规范
- Node.js 内置 `--test` runner，单元 + 集成 + OpenClaw 集成测试缺一不可。
- 全局覆盖率要求 ≥80%，对存储层/策略层的关键路径需有回归用例。
- 数据库迁移必须幂等，推荐在 `.openclaw/memory/evermemory/store/evermemory.db` 上做干净环境测试。
- 提交前默认执行 `npm run validate`，门禁（`teams:dev`/`teams:release`）作为质量闸门，确保确定性和可观测性。

## 项目阶段与当前状态

Phase 1-7 + Phase A 已完成。当前质量基线：
- 测试：99/99 通过
- recall benchmark accuracy：1.0（基线 0.95）
- teams:dev：PASS，耗时 ~17s（优化后）

**Phase A 完成内容**（2026-03-14）：
- T-005：auto-capture 质量强化，project_summary 按字段密度评分，消除占位符
- T-006：规则治理压测，freeze/deprecate/rollback/conflict 四场景覆盖
- T-007：构建指纹缓存 + 增量编译，teams:dev 37s→17.5s(-53%)
- T-008：5 轮跨 session 连续性验证矩阵，已入 release gate

**Phase B 完成内容**（2026-03-14）：
- B-001：explain 工具扩展新 topic（session/archive/intent），结构化 meta 输出
- B-002：operator 端到端工作流测试（review→explain→restore→verify；rule→explain→deprecate）
- B-002：restore 审计字段（appliedAt、userImpact）
- B-003：import 错误诊断增强（detail/hint/summary），batch truncation 建议

**Phase C 完成内容**（2026-03-14）：
- C-001：KPI 版本追踪器，检测跨版本回退（recall accuracy/unit pass/continuity/acceptRate）
- C-002：soak + KPI 入 release gate，`quality:gate:full` 全量验证
- C-003：`stability:check` 长期稳定性验证编排器，teams:release 已接入

**Phase G 完成内容**（2026-03-15）：
- G-001：零配置开箱即用（autoSetup.ts），plugin start() 自动诊断 embedding/DB/首次运行状态，输出建议
- G-002：大管家欢迎体验，profile_onboard 前置欢迎语，完成后确认信息
- G-004：多格式导入导出（exportService.ts），JSON/Markdown 导出，带验证的批量导入，memory_export/import 工具命令
- G-005：doctor 命令增强，7 项检查（DB/迁移/类型分布/嵌入/孤立嵌入/规则/健康），附带建议输出

**Phase F 完成内容**（2026-03-15）：
- F-001：主动学习循环（activeLearning.ts），session_end 自动提炼 lesson/pattern/insight/warning 洞察
- F-002：主动提醒机制（beforeAgentStart.ts），warning/lesson 记忆前置注入，relevantRules 过滤相关规则
- F-003：自我整理引擎（housekeeping.ts），近重复合并/过时归档/高频强化，runIfNeeded 24h 节流
- F-004：行为规则自进化（autoPromotion.ts），confidence>=0.85 + evidence>=2 自动晋升，打 auto_promoted tag
- F-005：智能度成长指标（SmartnessMetricsService），5 维度评分 + trend，growth-report 集成，smartness 工具命令

**Phase E 完成内容**（2026-03-15）：
- E-001：session_end 后自动触发 profile 重算（profileProjection.recomputeForUser），SessionEndResult 新增 profileUpdated
- E-002：偏好图谱（preferenceGraph.ts），推断隐式偏好+冲突检测，briging 注入沟通风格/工作习惯摘要
- E-003：session_start 注入完整 userProfile（communicationStyle/likelyInterests/workPatterns）到 RuntimeSessionContext
- E-004：跨项目知识迁移（crossProjectTransfer.ts），全局 explicit_constraint 自动注入到 briefing constraints
- E-005：对话风格自适应，briefing 按 concise/detailed/structured 调整条目数量和详细程度

**Phase D 完成内容**（2026-03-15）：
- D-001：本地嵌入默认开启（provider 默认 'local'），`@xenova/transformers` 缺失时优雅降级 NoOp
- D-002：auto-capture 语义去重（cosine > 0.92 跳过重复存储），目标 accept rate ≥ 0.90
- D-003：`beforeAgentStart.ts` 精准语义注入，messageReceived 末尾补充语义命中记忆（来源标记 `metadata.source='semantic'`）
- D-004：记忆冲突检测与自愈（`conflict.ts`，相似度 0.75-0.92 + 矛盾词对），自动保留较新版本并打 `conflict_resolved` tag
- D-005：`scripts/growth-report.mjs` 成长指标周报（`npm run growth:report`）
- D-006：首次安装 onboarding 问卷（`OnboardingService`，6 个问题，`profile_onboard` 工具）

## 稳定性验证命令
```bash
npm run stability:check          # 快速版（无 soak）
npm run stability:check:full     # 完整版（含 soak）
npm run kpi:track                # 仅 KPI 对比
npm run kpi:update               # 更新 KPI 基线
npm run quality:gate:full        # 全量质量门禁（含 soak）
npm run growth:report            # 成长指标报告
```

**当前 KPI 基线**（2026-03-15）：recall accuracy=1.0，unit pass=1.0，continuity=true，tests=178/178

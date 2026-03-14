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

## 稳定性验证命令
```bash
npm run stability:check          # 快速版（无 soak）
npm run stability:check:full     # 完整版（含 soak）
npm run kpi:track                # 仅 KPI 对比
npm run kpi:update               # 更新 KPI 基线
npm run quality:gate:full        # 全量质量门禁（含 soak）
```

**当前 KPI 基线**（2026-03-14）：recall accuracy=1.0，unit pass=1.0，continuity=true，auto-capture=0.75

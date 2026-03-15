# EverMemory Guide (CLAUDE)

## 项目概述
- EverMemory：OpenClaw 的确定性记忆插件，当前版本 v0.0.1。
- 目标：把知识写入、召回、规则治理和用户画像做成可靠、可解释、可回滚的工作流。
- 技术基线：Node.js 22.x、TypeScript strict ESM、SQLite WAL、better-sqlite3、TypeBox。
- 设计原则：确定性优先、操作员优先、渐进式加固。

## 架构速览
- `src/core/`：记忆、规则、画像、briefing、反思、体验演进等核心能力。
- `src/retrieval/`：structured、keyword、hybrid、semantic 检索策略。
- `src/embedding/`：none/local/openai provider 抽象与降级逻辑。
- `src/storage/`：SQLite 仓库、幂等迁移、调试/画像/经验/语义等表。
- `src/hooks/` 与 `src/openclaw/`：生命周期钩子与 OpenClaw 插件适配。
- `src/tools/`：store、recall、rules、briefing、status、import/export、profile 等命令。
- `test/` + `scripts/` + `docs/`：验证门禁、运维脚本、交付文档；Phase 明细见 `docs/CHANGELOG.md`。

## 构建与验证命令
```bash
npm run build
npm run build:test
npm run check
npm test
npm run validate
npm run teams:dev
npm run teams:release
npm run test:openclaw:smoke
npm run test:openclaw:continuity
```

## 开发工作流铁律
1. 非极小改动默认走 Codex + TDD：先测红，再实现绿，最后重构。
2. 主逻辑改动完成后必须做 code review，构建至少保持 `npm run build` 通过。
3. 任何新增能力都要可解释、可回滚，并显式处理错误与输入校验。
4. 不破坏确定性、幂等迁移和 operator 优先原则；门禁失败不得合入。

## 编码规范
- 保持高内聚低耦合，小文件优先，复杂逻辑拆分并补最小必要注释。
- 结构化配置优先，避免隐式魔数；边界输入输出尽量用 TypeBox schema 约束。
- 遵循不可变数据模式，新增行为需兼顾可观测性与回滚路径。

## 测试规范
- 使用 Node.js `--test` runner，单元、集成、OpenClaw 集成测试都要覆盖。
- 关键路径覆盖率目标 ≥80%，存储层、策略层、迁移层必须有回归用例。
- 提交前默认执行 `npm run validate`，发布前执行 `teams:release` 或稳定性门禁。

## 当前状态摘要
- 版本：v0.0.1（2026-03-15）
- 测试数：178/178 通过，现有测试文件 70+，release gate 已接入稳定性校验。
- KPI：recall accuracy=1.0，unit pass=1.0，continuity=true，teams:dev 约 17s。
- 已完成：Phase 1-7、Phase A、Phase B、Phase C、Phase D、Phase E、Phase F、Phase G。
- 下一步：继续围绕发布验收、真实环境 soak 和生态接入做增量加固。

## 稳定性验证命令
```bash
npm run stability:check
npm run stability:check:full
npm run kpi:track
npm run kpi:update
npm run quality:gate:full
npm run growth:report
```

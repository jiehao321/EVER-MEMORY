# EverMemory Agent Teams 开发执行令（2026-03-13）

## 1. 目标

从今天开始按并行团队模式推进 EverMemory，要求：

1. 开发速度提升
2. 质量门禁不放松
3. 交付可审计、可回滚

---

## 2. 团队编组

### Team-A Core Memory

- 范围：`src/hooks`、`src/core/briefing`、`src/core/memory`
- 目标：自动沉淀、sessionStart/sessionEnd 连续性、decay 迁移
- 交付物：memory capture 与 briefing 相关代码和测试

### Team-B Retrieval Quality

- 范围：`src/retrieval`、`test/retrieval.test.ts`
- 目标：项目问题路由、排序策略、测试数据抑制、召回稳定性
- 交付物：retrieval 相关代码和测试

### Team-C Ops & Quality

- 范围：`scripts`、`docs`、`README.md`
- 目标：门禁、OpenClaw 硬化、文档一致性、发布流程
- 交付物：质量脚本、执行报告、文档同步

---

## 3. 总监级质量规则（强制）

1. 每日集成前必须通过：`npm run teams:dev`
2. 发布前必须通过：`npm run teams:release`
3. 每天第一次开发前执行：`npm run teams:status`
4. 若出现 security critical > baseline：执行 `npm run openclaw:security:recover`
5. 所有合并请求必须附带本次门禁报告路径
6. 所有真实实测脚本必须在结束后自动清理测试数据，不允许写入残留

---

## 4. 本周执行节奏

### Day 1-2（收口）

1. 拆分现有大改动为可评审提交
2. 对齐 README / capability matrix / runbook
3. 保证 `quality:gate:openclaw` 连续通过

### Day 3-4（验证）

1. 执行真实项目问题回放（进展/阶段/下一步/最近决策）
2. 评估命中质量与错误召回
3. 形成灰度结论与参数调整建议

### Day 5（冻结）

1. 参数冻结
2. 发布回归
3. 记录回滚方案与下周 backlog

---

## 5. 交付验收（Definition of Done）

1. 代码：无冲突、可构建、关键测试通过
2. 质量：`teams:dev` 与 `teams:release` 都通过
3. 文档：变更能力必须在文档同步体现
4. 运维：OpenClaw 安全门禁不突破 baseline
5. 回滚：关键变更有可执行回滚步骤

---

## 6. 指挥命令

- 盘点状态：`npm run teams:status`
- 日常开发门禁：`npm run teams:dev`
- 发布级门禁：`npm run teams:release`
- 查看最新质量证据：`npm run evidence:latest`
- 召回准确率基准回归：`npm run test:recall:benchmark`
- 更新召回基准线：`npm run test:recall:benchmark:baseline`
- 高强度真实回归：`npm run test:openclaw:soak`
- 高强度真实回归（含 Feishu）：`npm run test:openclaw:soak:feishu`
- 连续记忆端到端验证：`npm run test:openclaw:continuity`
- 安全漂移恢复流程：`npm run openclaw:security:recover`
- 安全漂移强制演练：`npm run openclaw:security:drill`
- 历史测试数据清理：`npm run openclaw:cleanup:test-data`

新增脚本：
- `scripts/agent-teams-supervisor.mjs`

---

## 7. 结论

即日起采用 Agent Teams 并行开发，项目总监以自动化门禁和日报告为准绳管控质量，不允许“只追进度不守质量”的交付。

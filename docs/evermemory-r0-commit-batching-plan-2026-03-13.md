# EverMemory R0 提交批次拆分计划（2026-03-13）

## 1. 目的

将当前工作树改动拆为可评审、可回滚、可追踪的提交批次。  
本文件用于执行 `R0` 任务。

---

## 2. 批次拆分

## Batch-1 Core Continuity（Team-A）

范围：

- `src/hooks/sessionEnd.ts`
- `src/hooks/sessionStart.ts`
- `src/core/briefing/service.ts`
- `src/core/memory/lifecycle.ts`
- `src/core/memory/decay.ts`
- `src/core/memory/transfer.ts`
- `src/types/briefing.ts`
- `src/types/memory.ts`
- `src/types/runtime.ts`
- `test/session-end.test.ts`
- `test/session-start.test.ts`
- `test/decay.test.ts`

验收命令：

- `npm run check`
- `npm run test:unit`

提交建议：

- `feat(core): stabilize continuity auto-capture and lifecycle decay baseline`

## Batch-2 Retrieval Productization（Team-B）

范围：

- `src/retrieval/service.ts`
- `test/retrieval.test.ts`

验收命令：

- `npm run check`
- `npm run test:unit`
- `npm run test:openclaw:continuity`

提交建议：

- `feat(retrieval): add project-oriented routing and runtime-data recall policy`

## Batch-3 Teams & Validation Automation（Team-C）

范围：

- `scripts/agent-teams-supervisor.mjs`
- `scripts/openclaw-real-soak.mjs`
- `scripts/openclaw-continuity-e2e.mjs`
- `package.json`
- `README.md`

验收命令：

- `npm run teams:status`
- `npm run teams:dev`
- `npm run teams:release`

提交建议：

- `feat(ops): add agent teams supervision and real-host soak validation workflow`

## Batch-4 Delivery Docs（Team-C）

范围：

- `docs/README.md`
- `docs/evermemory-docs-index.md`
- `docs/evermemory-project-status-and-delivery-plan-2026-03-13.md`
- `docs/evermemory-agent-teams-execution-2026-03-13.md`
- `docs/evermemory-next-task-breakdown-2026-03-13.md`
- `docs/evermemory-execution-board-2026-03-13.md`
- `docs/evermemory-r0-commit-batching-plan-2026-03-13.md`

验收命令：

- 文档链接与命令全部可追溯

提交建议：

- `docs: publish director execution package and task board for next stage`

---

## 3. 执行顺序

1. Batch-1
2. Batch-2
3. Batch-3
4. Batch-4

每批通过验收后再进入下一批。

---

## 4. 回滚策略

若某批次回归失败：

1. 不合并该批次
2. 保留前一批次稳定状态
3. 修复后重新执行本批次验收命令


# EverMemory 文档索引（0.0.1）

## 1. 目标

本索引用于把文档按“发布关键度”统一分层，避免执行时混用历史文档与当前标准文档。

---

## 2. L0 发布关键文档（必须最新）

1. `evermemory-branch-and-release-governance.md`
2. `evermemory-release-quality-checklist.md`
3. `evermemory-release-0.0.1.md`
4. `evermemory-release-freeze-signoff-2026-03-13.md`
5. `../README.md`
6. `../package.json`

使用规则：

- L0 与代码不一致时，以修正文档和脚本为第一优先级。
- 发布前逐项核对，不允许跳项。

---

## 3. L1 运维与落地文档

1. `evermemory-operator-runbook.md`
2. `evermemory-troubleshooting.md`
3. `evermemory-installation-guide.md`
4. `evermemory-acceptance-handbook.md`
5. `README.en.md`（英文入口）

---

## 4. L2 设计与规划文档

1. `evermemory-master-plan.md`
2. `evermemory-phase-roadmap.md`
3. `evermemory-technical-design.md`
4. `evermemory-technical-design-v2.md`
5. `evermemory-v2-implementation-plan.md`
6. `evermemory-capability-matrix.md`
7. `evermemory-v1-boundary.md`
8. `evermemory-director-global-plan-2026-03-13.md`
9. `evermemory-director-executable-task-pack-2026-03-13.md`
10. 各 `phase*-technical-plan.md` 与 `phase*-task-breakdown.md`

---

## 5. L3 历史执行与证据文档

以下文档保留用于审计和复盘，不作为当前发布口径：

- `evermemory-*-report-2026-03-12.md`
- `evermemory-*-2026-03-13.md`
- `evermemory-execution-board-2026-03-13.md`
- `evermemory-agent-teams-execution-2026-03-13.md`
- `evermemory-next-task-breakdown-2026-03-13.md`

---

## 6. 当前推荐阅读顺序（新成员/交接）

1. `evermemory-branch-and-release-governance.md`
2. `evermemory-release-quality-checklist.md`
3. `evermemory-release-0.0.1.md`
4. `evermemory-operator-runbook.md`
5. `evermemory-troubleshooting.md`
6. `evermemory-capability-matrix.md`
7. `evermemory-v1-boundary.md`

---

## 7. 更新规则

1. 新增脚本命令：同步更新 L0 + L1。
2. 新增/调整发布门禁：同步更新 L0。
3. 仅有阶段性结论：写入 L3，不覆盖 L0/L1。

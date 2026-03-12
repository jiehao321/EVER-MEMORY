# EverMemory Phase 7 任务拆分

## 1. Phase 7 总体拆分

建议拆成 4 个 batch：

- **7A** — 一键质量门禁脚本落地
- **7B** — OpenClaw 实测门禁标准化
- **7C** — CI 与本地门禁边界收口
- **7D** — 发布流程与验收文档收口

当前执行状态（2026-03-12）：
- 7A 已完成
- 7B 已完成
- 7C 已完成
- 7D 已完成（发布清单与文档索引同步）

---

# Batch 7A — 一键质量门禁脚本落地

## Objective
将发布前质量检查整合为一条可重复执行命令。

## Definition of Done
- 存在 `npm run quality:gate`
- 至少覆盖 doctor/check/build/test:unit

---

# Batch 7B — OpenClaw 实测门禁标准化

## Objective
把真实 OpenClaw 运行态验证纳入标准门禁。

## Definition of Done
- 存在 `npm run quality:gate:openclaw`
- 包含 `test:openclaw:smoke`
- smoke 覆盖 store/recall/DB 证据

---

# Batch 7C — CI 与本地门禁边界收口

## Objective
明确哪些门禁在 CI 执行，哪些门禁必须本地执行。

## Definition of Done
- CI workflow 固化（doctor/check/build/test:unit）
- README 明确边界

---

# Batch 7D — 发布流程与验收文档收口

## Objective
确保发布前流程、验收报告、阶段文档一致。

## Definition of Done
- 路线图与 phase 文档可反映 Phase 7 状态
- 验收报告引用当前门禁结果

---

## 2. 总体验收标准

Phase 7 结束时，应具备：
- 一键门禁命令可直接执行
- OpenClaw 实测门禁可直接执行
- CI 与本地门禁职责不冲突
- 发布前质量证据可回溯

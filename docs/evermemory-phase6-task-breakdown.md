# EverMemory Phase 6 任务拆分

## 1. Phase 6 总体拆分

建议拆成 5 个 batch：

- **6A** — richer status/debug surface
- **6B** — explainability tools
- **6C** — import/export baseline
- **6D** — archive restore / review baseline
- **6E** — docs/troubleshooting/operator 收口

当前执行状态（2026-03-12）：
- 6A 已完成
- 6B 已完成
- 6C 已完成
- 6D 已完成
- 6E 已完成

---

# Batch 6A — richer status/debug surface

## Objective
增强 status/debug 输出，让 operator 更容易看懂系统状态。

## Definition of Done
- status 输出更全面但不混乱

---

# Batch 6B — explainability tools

## Objective
新增 explain 工具，支持解释 memory/retrieval/rule/profile 的来源。

## Definition of Done
- explain tool 至少能回答 write/retrieval/rule 三类问题

---

# Batch 6C — import/export baseline

## Objective
支持 memory snapshot export 和 reviewed import baseline。

## Definition of Done
- export/import 最小闭环跑通

---

# Batch 6D — archive restore / review baseline

## Objective
支持 archive restore 和 review path。

## Definition of Done
- restore/review baseline 跑通

---

# Batch 6E — docs/troubleshooting/operator 收口

## Objective
补齐最终 operator 文档和 troubleshooting 文档。

## Definition of Done
- docs/troubleshooting/operator notes 完整

---

## 2. 总体验收标准

Phase 6 结束时，应具备：
- richer status/debug
- explain tools
- import/export baseline
- restore/review baseline
- docs/troubleshooting/operator 收口

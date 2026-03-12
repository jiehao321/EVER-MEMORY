# EverMemory Phase 6 详细技术方案

## 1. 文档定位

本文档定义 EverMemory Phase 6（Extended Operations）的详细技术方案。

Phase 6 不是主系统基础能力的核心阶段，
而是建立在前面几阶段已经稳定之后，用来增强：
- explainability
- operator usability
- import/export / review / restore 等扩展能力

---

## 2. Phase 6 核心目标

Phase 6 主要解决：

1. **更强 explainability**
2. **更好 operator tooling**
3. **import/export / review / restore 等扩展能力**
4. **更可维护的运维/调试面**

---

## 3. 范围定义

## Scope In
- richer status/debug surface
- explainability tools
- import/export baseline
- archive restore baseline
- review flows
- operator notes / troubleshooting strengthening

## Scope Out
- 不做 SaaS control plane
- 不做复杂 dashboard web app
- 不做 multi-tenant productization

---

## 4. Explainability 设计

系统最终需要能回答：
- 为什么写了这条 memory？
- 为什么没写？
- 为什么召回了这几条？
- 为什么生成了这个 rule？
- 为什么 profile 是这样？

Phase 6 应把这些问题对应的 explain surfaces 做得更好。

---

## 5. Operator Tooling 设计

建议增强：
- richer `evermemory_status`
- `evermemory_explain`
- `evermemory_review`
- archive restore path

但仍然保持 CLI/tool-first，而非先做 UI-first。

---

## 6. Import/Export 设计

建议支持：
- export memory snapshot
- import reviewed memory artifacts
- optional migration/import from old systems

注意：
- 导入必须可审查
- 不要无脑全量导入污染 canonical store

---

## 7. 风险

### 风险 1：Explainability 变成信息泛滥
控制：
- explain 输出结构化、分层展示

### 风险 2：导入污染 memory store
控制：
- import review / staging / operator confirmation

### 风险 3：operator 功能过早产品化
控制：
- 先 tool-first
- 不做复杂控制台

---

## 8. 完成定义

Phase 6 完成时，应满足：
- explain surfaces 可用
- richer operator tooling 可用
- import/export/restore 至少有 baseline
- docs/troubleshooting 完整

---

## 9. 结论

Phase 6 的价值不在于“更聪明”，
而在于：

**让系统更容易被人类理解、审查、恢复、迁移和维护。**

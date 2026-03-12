# EverMemory Operator Runbook

## 1. 文档目标

本手册用于指导 EverMemory 的日常运维操作，覆盖：
- 状态检查
- 可解释性查询
- 导入/导出
- 归档审查/恢复
- 质量门禁

---

## 2. 适用范围

适用于当前已完成的 Phase 6 能力：
- richer status/debug
- explainability
- import/export（review-first）
- archive review/restore（review-first）

---

## 3. 快速健康检查

建议每次操作前先执行：

```bash
npm run doctor
npm run check
```

若要做完整门禁：

```bash
npm run validate
```

---

## 4. 日常操作流程（SOP）

### 4.1 查看系统状态

先用 `evermemory_status` 获取系统全貌：
- schemaVersion / databasePath
- memoryCount / archivedMemoryCount
- recentDebugByKind / latestDebugEvents

建议先确认：
- schema 版本正常
- debug 事件持续产生
- active/archived 比例符合预期

### 4.2 查询决策解释

使用 `evermemory_explain`：
- `topic=write`：看写入接受/拒绝原因
- `topic=retrieval`：看召回为何命中
- `topic=rule`：看规则提升/拒绝原因

遇到异常行为时，先解释后修复，避免盲改。

### 4.3 导出快照

使用 `evermemory_export`：
- 默认 `includeArchived=false`
- 迁移或审计时再启用 `includeArchived=true`

导出后建议记录：
- generatedAt
- scope
- exported 数量

### 4.4 导入快照（强制 review-first）

标准顺序：
1. `evermemory_import` with `mode=review`
2. 检查 `toCreate/toUpdate/rejected`
3. 明确批准后才执行 `mode=apply, approved=true`

注意：
- 未批准不允许 apply
- 默认拒绝重复 ID（除非 `allowOverwrite=true`）

### 4.5 归档审查与恢复（强制 review-first）

标准顺序：
1. `evermemory_review` 检查可恢复候选
2. `evermemory_restore` with `mode=review`
3. 确认后执行 `mode=apply, approved=true`

注意：
- superseded 记录默认不可恢复
- 如确有需要，显式使用 `allowSuperseded=true`

### 4.6 生命周期维护

使用 `evermemory_consolidate` 执行治理：
- `light`：小范围维护
- `daily`：默认日常维护
- `deep`：深度收敛（建议低峰期执行）

执行后关注：
- merged
- archivedStale

---

## 5. 质量门禁标准

每次 phase 交付或重大变更后，必须全部通过：

```bash
npm run check
npm run test
npm run build
npm run validate
```

禁止在门禁失败时继续推进下一个 phase。

---

## 6. 审计留痕建议

关键操作需在 `debug_events` 可追踪。重点关注：
- `memory_exported`
- `memory_import_reviewed`
- `memory_import_applied`
- `memory_restore_reviewed`
- `memory_restore_applied`

导入与恢复操作应保留审批记录（工单或操作日志）。

---

## 7. 变更纪律

- 先 review，后 apply
- 先解释，再修复
- 先门禁，再交付
- 文档与实现必须同步更新

# EverMemory Operator Runbook

## 1. 文档目标

本手册用于指导 EverMemory 的日常运维操作，覆盖：
- 状态检查
- 可解释性查询
- 导入/导出
- 归档审查/恢复
- 质量门禁
- 发布流程
- 回滚流程

---

## 2. 快速导航

**发布流程：**
- 完整发布检查清单：`docs/evermemory-release-checklist.md`
- 发布质量检查：`docs/evermemory-release-quality-checklist.md`
- 分支与发布治理：`docs/evermemory-branch-and-release-governance.md`

**回滚流程：**
- 完整回滚步骤：`docs/evermemory-rollback-procedure.md`
- 回滚指南（中文）：`docs/evermemory-rollback-guide.md`

**故障排查：**
- 故障排查指南：`docs/evermemory-troubleshooting.md`

**安装与配置：**
- 安装指南：`docs/evermemory-installation-guide.md`
- 快速启动：`docs/evermemory-quickstart.md`

---

## 3. 适用范围

适用于当前已完成的 Phase 6 能力：
- richer status/debug
- explainability
- import/export（review-first）
- archive review/restore（review-first）

---

## 4. 快速健康检查

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

## 5. 日常操作流程（SOP）

### 5.1 查看系统状态

先用 `evermemory_status` 获取系统全貌：
- schemaVersion / databasePath
- memoryCount / archivedMemoryCount
- recentDebugByKind / latestDebugEvents

建议先确认：
- schema 版本正常
- debug 事件持续产生
- active/archived 比例符合预期

### 5.2 查询决策解释

使用 `evermemory_explain`：
- `topic=write`：看写入接受/拒绝原因
- `topic=retrieval`：看召回为何命中
- `topic=rule`：看规则提升/拒绝原因

遇到异常行为时，先解释后修复，避免盲改。

### 5.3 导出快照

使用 `evermemory_export`：
- 默认 `includeArchived=false`
- 迁移或审计时再启用 `includeArchived=true`

导出后建议记录：
- generatedAt
- scope
- exported 数量

### 5.4 导入快照（强制 review-first）

标准顺序：
1. `evermemory_import` with `mode=review`
2. 检查 `toCreate/toUpdate/rejected`
3. 明确批准后才执行 `mode=apply, approved=true`

注意：
- 未批准不允许 apply
- 默认拒绝重复 ID（除非 `allowOverwrite=true`）

### 5.5 归档审查与恢复（强制 review-first）

标准顺序：
1. `evermemory_review` 检查可恢复候选
2. `evermemory_restore` with `mode=review`
3. 确认后执行 `mode=apply, approved=true`

注意：
- superseded 记录默认不可恢复
- 如确有需要，显式使用 `allowSuperseded=true`

### 5.6 生命周期维护

使用 `evermemory_consolidate` 执行治理：
- `light`：小范围维护
- `daily`：默认日常维护
- `deep`：深度收敛（建议低峰期执行）

执行后关注：
- merged
- archivedStale

---

## 6. 质量门禁标准

每次 phase 交付或重大变更后，必须全部通过：

```bash
npm run check
npm run test
npm run build
npm run validate
```

禁止在门禁失败时继续推进下一个 phase。

---

## 7. 发布 SOP（0.0.1+）

**完整发布流程请参考：** `docs/evermemory-release-checklist.md`

标准顺序：

```bash
git checkout release/<version>
npm run repo:guard
npm run release:evaluate
npm run release:pack
npm run openclaw:cleanup:test-data
```

执行要求：
- `release:evaluate` 报告必须为 `GO`
- `release:pack` 必须产出 `.tgz`
- 最终 `git status -sb` 必须干净

发布检查清单包含：
- 分支与工作树守卫
- 环境健康检查
- 类型检查与构建
- 单元测试
- Agent Teams dev/release 门禁
- OpenClaw soak 测试
- Feishu qgent 对话测试（可选）
- 召回质量基准测试
- 安全基线检查
- 版本一致性验证
- 参数冻结
- 证据收集
- 测试数据清理
- 最终验证与签核

---

## 8. 回滚 SOP

**完整回滚流程请参考：** `docs/evermemory-rollback-procedure.md`

### 回滚等级

**Level 1：解除 memory slot 绑定（最小影响）**
- 适用：插件正常但行为异常
- 时间：~2 分钟
- 操作：修改 `plugins.slots.memory` → 重启 gateway

**Level 2：禁用 plugin entry（中等影响）**
- 适用：插件初始化导致问题
- 时间：~3 分钟
- 操作：设置 `plugins.entries.evermemory.enabled=false` → 重启 gateway

**Level 3：移除插件发现路径（较大影响）**
- 适用：包损坏或需完全移除
- 时间：~5 分钟
- 操作：从 `plugins.load.paths` 移除路径 → 重启 gateway

### 回滚决策标准

**Critical（立即回滚）：**
- Gateway 无法启动或反复崩溃
- 数据损坏或丢失
- 安全基线回退
- 生产流量完全阻塞

**High（1 小时内回滚）：**
- 工具间歇性失败
- 性能下降 >50%
- 召回准确率 <80%

**Medium（4 小时内回滚）：**
- 非关键工具失败
- 性能下降 20-50%
- 召回准确率 80-90%

**Low（调查后决定）：**
- 有变通方案的小问题
- 性能下降 <20%
- 召回准确率 >90%

### 快速回滚命令

```bash
# 1. 解除 memory slot（~/.openclaw/openclaw.json）
# 修改 "memory": "evermemory" 为 "memory": "<previous-provider>"

# 2. 重启 gateway
openclaw gateway restart

# 3. 验证
openclaw gateway status

# 若仍失败，禁用 plugin entry
# 修改 "enabled": true 为 "enabled": false

# 4. 再次重启
openclaw gateway restart

# 5. 验证
openclaw plugins info evermemory

# 6. 保留数据库 - 不要删除
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

---

## 9. 审计留痕建议

关键操作需在 `debug_events` 可追踪。重点关注：
- `memory_exported`
- `memory_import_reviewed`
- `memory_import_applied`
- `memory_restore_reviewed`
- `memory_restore_applied`

导入与恢复操作应保留审批记录（工单或操作日志）。

---

## 10. 变更纪律

- 先 review，后 apply
- 先解释，再修复
- 先门禁，再交付
- 文档与实现必须同步更新
- 每次真实测试后必须清理测试数据

---

## 11. 相关文档

**发布与回滚：**
- 发布检查清单：`docs/evermemory-release-checklist.md`
- 回滚步骤：`docs/evermemory-rollback-procedure.md`
- 发布冻结签署：`docs/evermemory-release-freeze-signoff-2026-03-13.md`
- 发布质量检查：`docs/evermemory-release-quality-checklist.md`
- 分支与发布治理：`docs/evermemory-branch-and-release-governance.md`

**故障排查：**
- 故障排查指南：`docs/evermemory-troubleshooting.md`

**安装与配置：**
- 安装指南：`docs/evermemory-installation-guide.md`
- 快速启动：`docs/evermemory-quickstart.md`

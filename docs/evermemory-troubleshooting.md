# EverMemory Troubleshooting

## 1. 文档目标

本手册用于处理 EverMemory 常见故障，优先保证：
- 可定位
- 可复现
- 可恢复

---

## 2. 快速诊断命令

```bash
npm run doctor
npm run check
npm run test
npm run build
npm run validate
```

```bash
git status --short
```

---

## 3. 常见问题与处理

### 3.1 `doctor` 失败（SQLite 原生模块异常）

现象：
- `npm run doctor` 失败
- `better-sqlite3` 报错或 `SIGSEGV`

处理：

```bash
npm rebuild better-sqlite3
npm run doctor
```

---

### 3.2 `test` 出现大量 `dist-test` 文件缺失

现象：
- `Cannot find module dist-test/...`
- 测试文件大量 `MODULE_NOT_FOUND`

根因：
- `test` 与 `build/validate/clean` 并发执行，`dist-test` 被清理

处理：
- 不要并行运行 `npm run test` 与 `npm run build`/`npm run validate`
- 改为串行执行：

```bash
npm run check && npm run test && npm run build && npm run validate
```

---

### 3.3 `evermemory_import` apply 未生效

现象：
- `applied=false`
- `rejected` 中出现 `approval_required_for_apply`

处理：
- 按 review-first 流程重试：
1. `mode=review`
2. 确认结果后执行 `mode=apply, approved=true`

---

### 3.4 导入出现大量 `duplicate_id`

现象：
- `rejected` 多条 `duplicate_id`

处理：
- 保守策略：保持默认拒绝，人工筛选后再导入
- 确需覆盖：显式设置 `allowOverwrite=true`

风险提示：
- 覆盖可能改变历史证据链，需保留审批记录

---

### 3.5 `evermemory_restore` 无法恢复 superseded 记录

现象：
- `rejected` 出现 `superseded_requires_allow_superseded`

处理：
- 默认行为正确（防止旧记忆污染）
- 如需强制恢复，设置 `allowSuperseded=true` 并记录原因

---

### 3.6 查不到数据（status/recall/review 结果为空）

优先检查：
- scope 是否匹配（`userId/chatId/project/global`）
- 数据是否已经 archive
- query 是否过窄

处理建议：
- 先用 `evermemory_status` 看总体计数
- 再用更宽 scope 或去掉 query 过滤

---

### 3.7 validate 失败但 check/test 看起来通过

现象：
- `npm run validate` 失败
- 单独 `check/test` 通过

处理：
- 先看 `doctor` 输出（validate 包含环境体检）
- 修复环境后重跑 `npm run validate`

---

## 4. 排障闭环模板

每次故障建议按同一模板记录：
1. 触发时间
2. 现象与报错
3. 影响范围
4. 根因
5. 修复动作
6. 验证命令与结果
7. 是否需要补测试/补文档

---

## 5. 升级处理条件

满足任一条件应升级为阻塞问题：
- 数据污染或跨 scope 泄露风险
- 导入/恢复流程绕过审批闸门
- `validate` 持续失败且无法复现
- 同类故障重复出现两次以上

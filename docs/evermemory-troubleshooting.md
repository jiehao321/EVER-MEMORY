# EverMemory Troubleshooting

本手册面向 operator，目标不是“解释代码”，而是快速完成：
- 判断问题出在安装 / 启用 / plugin load / DB 路径 / smoke 哪一层
- 先止血，再定位
- 需要时能临时禁用或回滚

---

## 1. 先做什么：标准排障顺序

遇到问题时，按下面顺序排，不要上来就删库或重装：

1. 看 gateway 是否正常
2. 看 plugin 是否真的 loaded
3. 看配置是否真的启用了 `evermemory`
4. 看 memory slot 是否真的绑定到 `evermemory`
5. 看 DB 路径是否正确且可写
6. 跑本地自检
7. 跑首次 smoke / OpenClaw smoke
8. 再决定临时禁用还是回滚

推荐先执行：

```bash
openclaw gateway status
openclaw plugins info evermemory
```

再执行：

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test
```

如果 OpenClaw 环境已就绪，再执行：

```bash
npm run test:openclaw:smoke
```

---

## 2. Operator 自检命令清单

### 2.1 包级自检

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test
npm run build
npm run validate
```

说明：
- `doctor`：Node 与 `better-sqlite3` 原生探针
- `check`：TypeScript 类型检查
- `test`：单元测试
- `build`：构建产物
- `validate`：串行执行 doctor + check + test

### 2.2 OpenClaw 侧自检

```bash
openclaw gateway status
openclaw plugins info evermemory
```

### 2.3 真实 smoke

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run test:openclaw:smoke
```

### 2.4 DB 路径自检

```bash
ls -ld /root/.openclaw/memory/evermemory
ls -ld /root/.openclaw/memory/evermemory/store
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
find /root -name 'evermemory.db' 2>/dev/null
```

如果你使用自定义 `databasePath`，把上述默认路径替换成你的实际配置值。

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

补充说明：
- 仓库要求 Node `22.x`
- 如果 Node 主版本不对，先切换到 Node 22 再排 `better-sqlite3`

---

### 3.2 `test` 出现大量 `dist-test` 文件缺失

现象：
- `Cannot find module dist-test/...`
- 测试文件大量 `MODULE_NOT_FOUND`

根因：
- `test` 与 `build/validate/clean` 并发执行，`dist-test` 被清理

处理：
- 不要并行运行 `npm run test` 与 `npm run build` / `npm run validate`
- 改为串行执行：

```bash
npm run check && npm run test && npm run build && npm run validate
```

---

### 3.3 `openclaw plugins info evermemory` 查不到插件

现象：
- 提示插件不存在、未找到或无信息

优先检查：
- `plugins.load.paths` 是否包含 EverMemory 根目录
- 路径是否写成了错误目录、临时目录或旧版本目录
- 是否执行了 `npm run build`
- 插件根目录下是否存在 `openclaw.plugin.json`
- 修改配置后是否执行过 `openclaw gateway restart`

建议检查：

```bash
ls -la /root/.openclaw/workspace/projects/evermemory
ls -la /root/.openclaw/workspace/projects/evermemory/openclaw.plugin.json
ls -la /root/.openclaw/workspace/projects/evermemory/dist/index.js
```

---

### 3.4 插件显示已加载，但默认 memory 没生效

现象：
- `plugins info` 看起来正常
- 但 OpenClaw 默认 memory 行为不像 EverMemory

根因通常是：
- `plugins.entries.evermemory.enabled=true` 了
- 但 `plugins.slots.memory` 没绑定到 `evermemory`

处理：
- 检查并补上：

```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

然后：

```bash
openclaw gateway restart
```

---

### 3.5 `evermemory_status` / `store` / `recall` 无法调用

现象：
- 工具不可见
- 调用失败
- 插件已加载但工具未暴露

优先检查：
- `openclaw plugins info evermemory` 是否显示：
  - `evermemory_store`
  - `evermemory_recall`
  - `evermemory_status`
- 是否使用了正确插件版本
- gateway 是否真的运行中

先看：

```bash
openclaw gateway status
openclaw plugins info evermemory
```

如果 gateway 没起来，先解决 gateway。

---

### 3.6 `test:openclaw:smoke` 失败

现象：
- smoke 脚本失败
- 可能失败在 plugin info / gateway status / store / recall / DB evidence 任一阶段

脚本实际检查项：
- `openclaw plugins info evermemory`
- `openclaw gateway status`
- `evermemory_store`
- `evermemory_recall`
- SQLite 中是否有写入证据和 `retrieval_executed` debug 证据

排法：
1. 先看 gateway 是否 running
2. 再看 plugin 是否 loaded
3. 再看 DB 路径是否与脚本一致
4. 最后看是否是 scope / 写入 / 召回本身的问题

脚本默认 DB 路径：

```text
/root/.openclaw/memory/evermemory/store/evermemory.db
```

如果你使用自定义 DB 路径，执行：

```bash
EVERMEMORY_DB_PATH=/your/custom/path/evermemory.db npm run test:openclaw:smoke
```

---

### 3.7 DB 文件不存在或写到了错误位置

现象：
- `evermemory_status` 结果不符合预期
- `store` 后没看到 DB 文件
- 以为数据丢了

优先检查：
- `plugins.entries.evermemory.config.databasePath` 写的是不是你预期值
- OpenClaw 运行用户是否有目录写权限
- 是否存在多个 `evermemory.db` 副本导致误读

建议执行：

```bash
find /root -name 'evermemory.db' 2>/dev/null
```

判断标准：
- 配置里的 `databasePath`
- `evermemory_status` 看到的数据库路径
- smoke 脚本使用的路径

这三者应尽量一致。

---

### 3.8 查不到数据（status/recall/review 结果为空）

优先检查：
- scope 是否匹配（`userId/chatId/project/global`）
- 数据是否已经 archive
- query 是否过窄
- 你看的是否是错误的 DB 文件

处理建议：
- 先用 `evermemory_status` 看总体计数
- 再用更宽 scope 或去掉 query 过滤
- 最后再核对 DB 路径

---

### 3.9 `evermemory_import` apply 未生效

现象：
- `applied=false`
- `rejected` 中出现 `approval_required_for_apply`

处理：
- 按 review-first 流程重试：
  1. `mode=review`
  2. 确认结果后执行 `mode=apply, approved=true`

---

### 3.10 导入出现大量 `duplicate_id`

现象：
- `rejected` 多条 `duplicate_id`

处理：
- 保守策略：保持默认拒绝，人工筛选后再导入
- 确需覆盖：显式设置 `allowOverwrite=true`

风险提示：
- 覆盖可能改变历史证据链，需保留审批记录

---

### 3.11 `evermemory_restore` 无法恢复 superseded 记录

现象：
- `rejected` 出现 `superseded_requires_allow_superseded`

处理：
- 默认行为正确（防止旧记忆污染）
- 如需强制恢复，设置 `allowSuperseded=true` 并记录原因

---

### 3.12 `validate` 失败但 `check/test` 看起来通过

现象：
- `npm run validate` 失败
- 单独 `check/test` 通过

处理：
- 先看 `doctor` 输出（`validate` 包含环境体检）
- 修复环境后重跑 `npm run validate`

---

## 4. plugin load 核对模板

每次怀疑“插件没生效”时，用这个模板：

### 4.1 核对路径

```bash
ls -la /root/.openclaw/workspace/projects/evermemory
```

### 4.2 核对关键文件

```bash
ls -la /root/.openclaw/workspace/projects/evermemory/openclaw.plugin.json
ls -la /root/.openclaw/workspace/projects/evermemory/dist/index.js
```

### 4.3 核对插件 id

`openclaw.plugin.json` 中应为：

```json
{
  "id": "evermemory"
}
```

### 4.4 核对运行时状态

```bash
openclaw plugins info evermemory
```

---

## 5. DB 路径核对模板

每次怀疑“数据丢了 / 写错库了”时，用这个模板：

### 5.1 看配置里的 `databasePath`

确认它是不是你想用的绝对路径。

### 5.2 看目录是否存在且可写

```bash
ls -ld /root/.openclaw/memory/evermemory
ls -ld /root/.openclaw/memory/evermemory/store
```

### 5.3 看文件是否存在

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

### 5.4 搜全机是否有多个库

```bash
find /root -name 'evermemory.db' 2>/dev/null
```

---

## 6. 临时禁用

如果当前目标是“先恢复服务”，不要直接做重型回滚，先临时禁用。

### 方案 A：解除 memory slot

适合：
- 插件可能还要保留做诊断
- 但不希望它继续承接默认 memory 流量

### 方案 B：把 `plugins.entries.evermemory.enabled` 改为 `false`

适合：
- 插件初始化本身就影响 gateway
- 需要先完全停掉插件

变更后都执行：

```bash
openclaw gateway restart
```

更完整步骤见：
- `docs/evermemory-rollback-guide.md`

---

## 7. 何时升级为回滚

满足以下任一条件，建议进入回滚流程：
- gateway 因 EverMemory 无法稳定运行
- 插件加载异常且短时间内无法修复
- DB 路径混乱导致实际读写不可控
- 默认 memory provider 已被影响到生产流量
- 同类故障重复出现两次以上

---

## 8. 排障记录模板

每次故障建议按同一模板记录：

1. 触发时间
2. 现象与报错
3. 影响范围
4. plugin load 状态
5. DB 路径与文件位置
6. 根因
7. 修复动作
8. 验证命令与结果
9. 是否临时禁用 / 是否已回滚
10. 是否需要补测试 / 补文档

---

## 9. 相关文档

快速安装与首次 smoke：
- `docs/evermemory-quickstart.md`

回滚说明：
- `docs/evermemory-rollback-guide.md`

安装与配置：
- `docs/evermemory-installation-guide.md`

日常运行手册：
- `docs/evermemory-operator-runbook.md`


## Symptom: plugin is running but continuity still feels broken

Possible signs:
- `evermemory_status` shows memory/debug activity
- database exists and debug events keep growing
- but asking about project progress returns weak or empty continuity

Likely causes:
- `memory_items` are dominated by test/E2E data rather than real project memories
- boot briefing sections are structurally present but empty
- interaction processing is creating debug/experience/rule traces without durable project-memory capture
- lifecycle/archive exists, but memory decay and project-state supersession are not yet sufficiently productized

Recommended next step:
- follow `docs/evermemory-continuity-decay-remediation-plan.md`

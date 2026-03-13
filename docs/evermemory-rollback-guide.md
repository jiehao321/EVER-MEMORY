# EverMemory Rollback Guide

本手册面向 operator，解决两个问题：

1. EverMemory 启用后出问题，如何安全回退
2. 回退后如何确认 OpenClaw 已恢复到可用状态

原则：
- 先止血，再定位
- 先解除流量，再禁用插件
- 默认保留数据库证据，不要第一时间删库
- 回滚动作要可验证、可逆、可审计

---

## 1. 适用场景

适用于以下情况：
- gateway 重启后插件加载异常
- `evermemory_status` / `store` / `recall` 不稳定
- DB 路径配置错误，写入落到了非预期路径
- 默认 memory provider 需要切回旧方案
- operator 需要临时禁用 EverMemory 观察基线

---

## 2. 回滚等级

建议按影响从小到大分三级回滚。

### Level 1：解除 memory slot 绑定

目标：
- 让 EverMemory 不再承接默认 memory 流量
- 但保留插件可见，便于继续检查

适用：
- 插件已加载，但业务表现异常
- 你想快速切回旧 memory provider

操作：

把：

```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

改成你之前的 memory 插件，例如：

```json
{
  "plugins": {
    "slots": {
      "memory": "<previous-memory-plugin>"
    }
  }
}
```

或临时移除 `memory` 绑定。

然后执行：

```bash
openclaw gateway restart
```

验证：
- OpenClaw 能正常启动
- 默认 memory provider 已不是 `evermemory`
- EverMemory 如果仍保留加载，可继续做诊断

---

### Level 2：禁用 plugin entry

目标：
- 停止 EverMemory 插件实例初始化与运行

适用：
- 插件启动即报错
- 需要快速消除插件对 runtime 的影响

操作：

把：

```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": true
      }
    }
  }
}
```

改成：

```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": false
      }
    }
  }
}
```

然后执行：

```bash
openclaw gateway restart
```

验证：
- gateway 正常运行
- `openclaw plugins info evermemory` 不再显示 enabled / loaded 运行态，或明确显示 disabled
- EverMemory 工具不再暴露给运行时

---

### Level 3：移除插件发现路径

目标：
- 让 OpenClaw 完全不再发现 EverMemory 包

适用：
- 需要彻底卸载式回滚
- 路径内容错误、构建损坏、版本混乱

操作：

从：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/root/.openclaw/workspace/projects/evermemory"
      ]
    }
  }
}
```

中移除 EverMemory 路径。

然后执行：

```bash
openclaw gateway restart
```

验证：
- `openclaw plugins info evermemory` 不再能找到插件，或显示未发现
- gateway 恢复正常

---

## 3. 标准回滚顺序

推荐顺序如下：

1. 先记录当前现象
2. 先做 Level 1（解除 slot）
3. 若仍异常，再做 Level 2（禁用 entry）
4. 若仍需彻底撤出，再做 Level 3（移除 load path）
5. 每一步都执行 `openclaw gateway restart`
6. 每一步都做验证，不要一次改三处后再猜是哪一步生效

---

## 4. 回滚前建议保留的证据

在你修改配置前，建议先保留以下信息：

### 4.1 gateway 状态

```bash
openclaw gateway status
```

### 4.2 plugin load 状态

```bash
openclaw plugins info evermemory
```

### 4.3 包体检结果

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
```

### 4.4 数据库文件状态

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

如果使用自定义 `databasePath`，请替换为实际路径。

### 4.5 若已有 OpenClaw smoke 结果，也建议保存

```bash
npm run test:openclaw:smoke
```

如果 smoke 正在失败，失败输出本身就是很重要的回滚依据。

---

## 5. DB 路径回滚核对

有一类常见问题不是插件坏了，而是 DB 路径写错了，导致 operator 误判“数据丢了”。

### 5.1 先确认配置中的 `databasePath`

例如：

```text
/root/.openclaw/memory/evermemory/store/evermemory.db
```

### 5.2 查宿主机是否存在多个数据库副本

```bash
find /root -name 'evermemory.db' 2>/dev/null
```

### 5.3 判断是否真需要回滚

如果问题只是：
- `databasePath` 指向错目录
- 插件本体仍能正常加载

那通常不需要完整回滚，改正 `databasePath` 并重启即可。

### 5.4 回滚时默认保留 DB

默认不要删除：

```text
/root/.openclaw/memory/evermemory/store/evermemory.db
```

原因：
- 便于后续定位
- 便于重新启用时继续使用
- 便于提取证据或迁移数据

---

## 6. 临时禁用策略

如果你不想进入正式回滚，但又需要快速止血，优先使用下面两个临时策略。

### 策略 A：切走 memory slot

最适合：
- 旧 memory provider 仍可用
- 你只想把默认流量切走

### 策略 B：把 `enabled` 改成 `false`

最适合：
- EverMemory 初始化时就影响 gateway
- 需要彻底停用，但还不想删除路径和数据库

这两种策略都比“直接删代码 / 删 DB”更安全。

---

## 7. 回滚后验证

每次回滚后，建议做下面这组检查。

### 7.1 gateway 是否恢复

```bash
openclaw gateway status
```

重点看：
- `Runtime: running`
- `RPC probe: ok`

### 7.2 plugin 是否符合预期

```bash
openclaw plugins info evermemory
```

你要看到的结果应与当前回滚等级一致：
- Level 1：可能仍 loaded，但不再承接默认 memory slot
- Level 2：disabled / 未运行
- Level 3：不可发现或未找到

### 7.3 默认 memory 是否恢复到预期方案

如果你切回了旧 provider，确认旧 provider 已恢复服务。

### 7.4 EverMemory 数据库是否保留

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

数据库保留不代表插件仍在生效；这只是证据与恢复介质。

---

## 8. 从回滚中恢复重新启用

如果问题定位完成，要重新启用 EverMemory，按下面顺序反向操作：

1. 恢复 `plugins.load.paths`
2. 恢复 `plugins.entries.evermemory.enabled=true`
3. 恢复 `plugins.slots.memory="evermemory"`
4. `openclaw gateway restart`
5. 执行首次 smoke：

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test:openclaw:smoke
```

---

## 9. 不建议的回滚动作

以下动作不建议作为第一反应：

### 9.1 直接删除数据库

风险：
- 丢失排障证据
- 造成真实数据损失
- 让“路径错误”与“数据损坏”混在一起更难判断

### 9.2 不经验证一次性改三处配置

风险：
- 无法知道哪一步真正解决问题
- 后续很难形成标准 SOP

### 9.3 不重启 gateway 就判断配置已生效

风险：
- 看到的仍是旧状态
- 误判为“回滚没用”

---

## 10. 最小回滚 SOP

当你需要一份最短操作版时，用下面这份：

### 快速止血版

1. 把 `plugins.slots.memory` 从 `evermemory` 切回旧 provider
2. `openclaw gateway restart`
3. `openclaw gateway status`
4. 若仍异常，再把 `plugins.entries.evermemory.enabled=false`
5. 再次 `openclaw gateway restart`
6. `openclaw plugins info evermemory`
7. 保留数据库，不删库

### 彻底撤出版

1. `plugins.slots.memory` 去掉 `evermemory`
2. `plugins.entries.evermemory.enabled=false`
3. `plugins.load.paths` 移除 EverMemory 路径
4. `openclaw gateway restart`
5. 验证 gateway 恢复
6. 保留数据库与故障记录

---

## 11. 相关文档

快速启用与首次 smoke：
- `docs/evermemory-quickstart.md`

详细排障：
- `docs/evermemory-troubleshooting.md`

安装与配置：
- `docs/evermemory-installation-guide.md`

日常 operator 手册：
- `docs/evermemory-operator-runbook.md`

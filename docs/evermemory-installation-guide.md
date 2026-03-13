# EverMemory Installation Guide

本指南面向要在**另一台 OpenClaw 实例**上直接安装 / 加载 EverMemory 的操作者。

目标：
- 让你知道应该把仓库放到哪里
- 知道 `plugins.load.paths` / `plugins.entries` / `plugins.slots.memory` 应该怎么写
- 知道怎么验证是否真的加载成功
- 知道出问题时怎么回滚

---

## 1. 适用前提

建议环境：
- Node.js `22.x`
- 可正常运行的 OpenClaw
- 目标机器上有可写目录用于持久化数据库

EverMemory 当前以**源码仓库 + 构建产物**方式分发；推荐做法是：
1. 拉取仓库
2. 安装依赖
3. 构建产物
4. 在 OpenClaw 配置里声明插件加载路径与启用项

---

## 2. 推荐安装路径

推荐将插件仓库放在 OpenClaw 工作区或稳定插件目录，例如：

```text
/root/.openclaw/workspace/projects/evermemory
```

或：

```text
/opt/openclaw/plugins/evermemory
```

要求：
- 路径稳定，不要频繁移动
- OpenClaw 运行用户对该目录有读取权限
- 数据库目录对 OpenClaw 运行用户有写权限

---

## 3. 安装步骤

### 3.1 获取代码

```bash
git clone <your-evermemory-repo-url> /root/.openclaw/workspace/projects/evermemory
cd /root/.openclaw/workspace/projects/evermemory
```

如果你是通过压缩包分发，也可以直接解压到目标目录。

### 3.2 安装依赖

```bash
npm install
```

### 3.3 构建

```bash
npm run build
```

构建完成后，核心入口应至少包含：
- `dist/index.js`
- `openclaw.plugin.json`
- `plugin.json`

### 3.4 基础自检

```bash
npm run check
npm run test
npm run doctor
```

如果只想做最小安装前确认，至少执行：

```bash
npm run build && npm run check
```

---

## 4. OpenClaw 配置方式

EverMemory 作为 OpenClaw memory 插件使用时，重点是三处：
- `plugins.load.paths`
- `plugins.entries`
- `plugins.slots.memory`

### 4.1 `plugins.load.paths`

这里填写**插件目录绝对路径**，推荐使用仓库根目录：

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

建议：
- 使用**绝对路径**
- 一台机器装多个自定义插件时，把每个插件根目录都加入 `paths`
- 不要写成临时构建目录或会变化的软链，除非你明确管理它

### 4.2 `plugins.entries`

这里声明插件实例是否启用，以及其运行配置。

最小示例：

```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": true,
        "config": {
          "databasePath": "/root/.openclaw/memory/evermemory/store/evermemory.db",
          "maxRecall": 8,
          "debugEnabled": true
        }
      }
    }
  }
}
```

说明：
- `evermemory` 这个 key 应与插件 id 保持一致
- `enabled: true` 表示启用该插件
- `config.databasePath` 建议使用**绝对路径**，便于迁移与排障
- 如果你不需要大量调试事件，可以把 `debugEnabled` 设为 `false`

更完整示例：

```json
{
  "plugins": {
    "entries": {
      "evermemory": {
        "enabled": true,
        "config": {
          "databasePath": "/root/.openclaw/memory/evermemory/store/evermemory.db",
          "bootTokenBudget": 1200,
          "maxRecall": 8,
          "debugEnabled": true,
          "semantic": {
            "enabled": false,
            "maxCandidates": 200,
            "minScore": 0.15
          },
          "intent": {
            "useLLM": false,
            "fallbackHeuristics": true
          }
        }
      }
    }
  }
}
```

### 4.3 memory slot 绑定

如果你希望 EverMemory 作为默认 memory provider，必须绑定 memory slot：

```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

这一步很关键：
- `plugins.entries.evermemory.enabled=true` 只是**启用插件**
- `plugins.slots.memory = "evermemory"` 才是把它绑定为默认 memory slot

建议最终组合如下：

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/root/.openclaw/workspace/projects/evermemory"
      ]
    },
    "entries": {
      "evermemory": {
        "enabled": true,
        "config": {
          "databasePath": "/root/.openclaw/memory/evermemory/store/evermemory.db",
          "maxRecall": 8,
          "debugEnabled": true
        }
      }
    },
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

---

## 5. 启用步骤

修改 OpenClaw 配置后，重启 gateway：

```bash
openclaw gateway restart
```

如果你不确定当前 gateway 状态，先执行：

```bash
openclaw gateway status
```

---

## 6. 验证步骤

建议按下面顺序验证。

### 6.1 文件路径验证

确认插件目录存在：

```bash
ls -la /root/.openclaw/workspace/projects/evermemory
```

确认关键文件存在：

```bash
ls -la /root/.openclaw/workspace/projects/evermemory/openclaw.plugin.json
ls -la /root/.openclaw/workspace/projects/evermemory/plugin.json
ls -la /root/.openclaw/workspace/projects/evermemory/dist/index.js
```

### 6.2 本地包自检

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test
```

### 6.3 OpenClaw 侧验证

重启后，建议至少验证以下几点：

1. OpenClaw 能正常启动，无插件加载报错
2. `evermemory` 已被识别并启用
3. memory slot 已指向 `evermemory`
4. 能调用 `evermemory_status`
5. 能进行一次最小写入 / 召回

如果你的 OpenClaw 环境支持插件信息查看，可执行：

```bash
openclaw plugins info evermemory
```

期望结果：
- 插件状态为 loaded / enabled
- 插件路径指向你的安装目录

### 6.4 工具链路验证

在 OpenClaw 中做最小调用：

- `evermemory_status`
- `evermemory_store`
- `evermemory_recall`

期望：
- `evermemory_status` 能返回数据库路径和 memoryCount
- `evermemory_store` 返回 `accepted: true`
- `evermemory_recall` 能召回刚写入内容

### 6.5 数据文件验证

执行过 store 后，确认数据库文件存在：

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

如果你自定义了 `databasePath`，则检查自定义路径。

---

## 7. 回滚步骤

如果加载后出现问题，按以下顺序回滚。

### 7.1 解除 memory slot 绑定

先把：

```json
{
  "plugins": {
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

改回你之前的 memory 插件，或临时移除该绑定。

### 7.2 禁用插件 entry

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

改为：

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

### 7.3 移除 `plugins.load.paths`

将 EverMemory 根目录从 `plugins.load.paths` 中移除。

### 7.4 重启 gateway

```bash
openclaw gateway restart
```

### 7.5 决定是否保留数据库

默认建议：
- **先保留数据库文件**，便于排障和后续恢复
- 不要第一时间删除 `evermemory.db`

如需彻底卸载，再手动处理：
- 插件目录
- 数据库目录
- 任何与 EverMemory 相关的自定义配置

---

## 8. 常见安装注意事项

### 8.1 文档路径和真实路径不一致

请以**实际插件根目录**为准填写 `plugins.load.paths`。

### 8.2 只启用了 entry，但没绑 memory slot

这种情况下插件可能已加载，但**不会作为默认 memory provider 生效**。

### 8.3 数据库路径无写权限

如果 `databasePath` 指向目录不可写，插件可能初始化失败或运行异常。

### 8.4 改完配置没重启 gateway

OpenClaw 读取新插件配置后通常需要重启 gateway 才会生效。

### 8.5 构建产物不存在

如果没有先执行 `npm run build`，某些依赖 `dist/` 的加载路径可能不可用。

---

## 9. 交付检查清单

给其他 OpenClaw 实例交付 EverMemory 时，至少确认以下内容都已明确：

- 仓库 / 插件根目录路径
- `plugins.load.paths` 配置
- `plugins.entries.evermemory` 配置
- `plugins.slots.memory` 绑定
- 数据库存储路径
- 验证命令
- 回滚步骤

---

## 10. 推荐最小交付模板

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/absolute/path/to/evermemory"
      ]
    },
    "entries": {
      "evermemory": {
        "enabled": true,
        "config": {
          "databasePath": "/absolute/path/to/evermemory.db",
          "maxRecall": 8,
          "debugEnabled": true
        }
      }
    },
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

如果你需要更详细的运行与排障说明，再继续看：
- `README.md`
- `docs/evermemory-operator-runbook.md`
- `docs/evermemory-troubleshooting.md`

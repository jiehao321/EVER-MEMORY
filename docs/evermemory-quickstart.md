# EverMemory Operator Quickstart

本手册面向 operator，目标是把 EverMemory 从“仓库代码”推进到“已安装、已启用、首次 smoke 通过、知道怎么排障与临时禁用”。

如果你只想最快完成一次落地，按下面顺序执行：

1. 安装依赖并构建
2. 配置 OpenClaw 插件加载 / 启用 / memory slot
3. 重启 gateway
4. 做首次 smoke
5. 核对数据库路径与 plugin load 状态
6. 出问题时按 troubleshooting / rollback 处理

---

## 1. 适用前提

建议环境：
- Node.js `22.x`
- 本机 `openclaw` 可正常运行
- OpenClaw 运行用户对插件目录有读权限
- OpenClaw 运行用户对数据库目录有写权限

当前仓库推荐路径示例：

```text
/root/.openclaw/workspace/projects/evermemory
```

默认数据库路径：

```text
/root/.openclaw/memory/evermemory/store/evermemory.db
```

仓库内部默认相对路径定义见：

```text
.openclaw/memory/evermemory/store/evermemory.db
```

为了 operator 排障清晰，实际部署时建议在 OpenClaw 配置中使用**绝对路径**。

---

## 2. 安装

### 2.1 获取代码

```bash
git clone <your-evermemory-repo-url> /root/.openclaw/workspace/projects/evermemory
cd /root/.openclaw/workspace/projects/evermemory
```

如果不是用 git，也可以直接解压到固定目录。

### 2.2 安装依赖

```bash
npm install
```

### 2.3 构建

```bash
npm run build
```

### 2.4 安装后最小自检

```bash
npm run doctor
npm run check
npm run test
```

如果只做最小闭环，至少保证：

```bash
npm run doctor && npm run build && npm run check
```

---

## 3. 启用 EverMemory

EverMemory 在 OpenClaw 中要同时完成三件事：

- 让 OpenClaw 能发现插件路径
- 让 `evermemory` entry 处于启用状态
- 把 memory slot 绑定到 `evermemory`

### 3.1 最小配置示例

把以下内容合并进你的 OpenClaw 配置：

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

### 3.2 三个配置点分别代表什么

#### `plugins.load.paths`

告诉 OpenClaw 去哪里发现插件：

- 必须写插件根目录
- 建议用绝对路径
- 路径不要频繁移动

#### `plugins.entries.evermemory.enabled`

告诉 OpenClaw：

- 这个插件实例要不要启用
- `config` 里的数据库路径 / 调试开关 / recall 限制是什么

#### `plugins.slots.memory`

告诉 OpenClaw：

- 默认 memory provider 绑定谁

这是最容易漏掉的一步。

**只启用 entry，不绑定 slot，插件可能会加载，但不会成为默认 memory provider。**

---

## 4. 重启使配置生效

修改配置后执行：

```bash
openclaw gateway restart
```

如果你想先看当前状态：

```bash
openclaw gateway status
```

---

## 5. 首次 smoke

首次 smoke 推荐分成 4 段：包自检、plugin load、自身工具调用、数据库落盘。

### 5.1 包自检 smoke

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test
```

### 5.2 plugin load 核对

```bash
openclaw plugins info evermemory
```

期望至少看到：
- `Status: loaded`
- 有 `evermemory_store`
- 有 `evermemory_recall`
- 有 `evermemory_status`

如果 gateway 本身没起来，再看：

```bash
openclaw gateway status
```

期望至少看到：
- `Runtime: running`
- `RPC probe: ok`

### 5.3 一次真实 OpenClaw smoke

仓库已提供脚本：

```bash
npm run test:openclaw:smoke
```

该脚本会做这些事：
- 检查 `openclaw plugins info evermemory`
- 检查 `openclaw gateway status`
- 通过 OpenClaw 调用 `evermemory_store`
- 通过 OpenClaw 调用 `evermemory_recall`
- 打开 SQLite 数据库确认写入证据与 retrieval debug 证据

这是 operator 最推荐复用的首次 smoke 脚本。

### 5.4 手工最小 smoke

如果暂时不跑脚本，也至少要验证：

1. `evermemory_status`
2. `evermemory_store`
3. `evermemory_recall`

期望：
- `evermemory_status` 能返回数据库路径 / memoryCount
- `evermemory_store` 能接受一次写入
- `evermemory_recall` 能召回刚才写入内容

---

## 6. DB 路径核对

这是部署后最关键的 operator 检查项之一。

### 6.1 核对配置里的数据库路径

确认 `plugins.entries.evermemory.config.databasePath` 指向你预期的位置，例如：

```text
/root/.openclaw/memory/evermemory/store/evermemory.db
```

### 6.2 核对目录是否存在

```bash
ls -ld /root/.openclaw/memory/evermemory
ls -ld /root/.openclaw/memory/evermemory/store
```

### 6.3 核对数据库文件是否已创建

首次 store 之后执行：

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

### 6.4 核对实际落盘是不是这一个 DB

如果你怀疑写到了错误路径，可以在仓库内或宿主机上查找：

```bash
find /root -name 'evermemory.db' 2>/dev/null
```

如果出现多个 `evermemory.db`，要确认 OpenClaw 真实使用的是哪一个。

优先以：
- OpenClaw 配置里的 `databasePath`
- `evermemory_status` 返回的数据库路径
- `npm run test:openclaw:smoke` 实际使用的路径

三者是否一致为准。

---

## 7. plugin load 核对

排障时不要只看“仓库在不在”，还要确认“插件是否真的被 OpenClaw 加载”。

### 7.1 插件根目录核对

```bash
ls -la /root/.openclaw/workspace/projects/evermemory
ls -la /root/.openclaw/workspace/projects/evermemory/openclaw.plugin.json
ls -la /root/.openclaw/workspace/projects/evermemory/dist/index.js
```

### 7.2 plugin metadata 核对

当前插件 id 应为：

```json
{
  "id": "evermemory"
}
```

如果 `plugins.entries` 或 `plugins.slots.memory` 里写的 key 不是 `evermemory`，就会出现加载不一致问题。

### 7.3 OpenClaw 加载状态核对

```bash
openclaw plugins info evermemory
```

重点核对：
- 状态是不是 `loaded`
- 工具有没有被暴露
- 插件路径是不是你预期目录

---

## 8. Operator 自检命令清单

建议把下面这组命令当成标准自检集：

```bash
cd /root/.openclaw/workspace/projects/evermemory
npm run doctor
npm run check
npm run test
npm run test:openclaw:smoke
```

如果要看网关状态与插件状态：

```bash
openclaw gateway status
openclaw plugins info evermemory
```

如果要看数据库文件：

```bash
ls -la /root/.openclaw/memory/evermemory/store/evermemory.db
```

如果 `databasePath` 不是默认值，把命令里的路径替换成你自己的配置值。

---

## 9. 临时禁用

如果你需要先止血，再排障，建议按“最小影响”顺序处理。

### 方案 A：只解除 memory slot 绑定

如果想先让默认 memory provider 切回别的实现：

```json
{
  "plugins": {
    "slots": {
      "memory": "<previous-memory-plugin>"
    }
  }
}
```

或者临时去掉该绑定。

适用：
- EverMemory 已加载，但你不想让它继续承接默认 memory 流量
- 想保留插件本身便于继续检查

### 方案 B：禁用插件 entry

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

适用：
- 插件初始化本身就有问题
- 需要彻底停止 EverMemory 在 OpenClaw 中运行

### 方案 C：移除插件发现路径

把 EverMemory 从 `plugins.load.paths` 中移除。

适用：
- 需要让 OpenClaw 完全不再发现该插件
- 做彻底回滚前的最后一步

### 变更后都要重启

```bash
openclaw gateway restart
```

---

## 10. 常见错误速查

### 10.1 `better-sqlite3` 原生探针失败

执行：

```bash
npm rebuild better-sqlite3
npm run doctor
```

### 10.2 插件显示未加载

优先检查：
- `plugins.load.paths` 是否写对绝对路径
- 是否执行过 `npm run build`
- `openclaw.plugin.json` 是否存在
- 是否重启过 gateway

### 10.3 插件加载了，但没生效

优先检查：
- `plugins.entries.evermemory.enabled` 是否为 `true`
- `plugins.slots.memory` 是否为 `"evermemory"`

### 10.4 tool 可见，但查不到数据

优先检查：
- `databasePath` 是否写到了错误位置
- 当前请求 scope 是否匹配
- 数据是否还未写入或已 archive

### 10.5 smoke 脚本报数据库找不到

优先检查：
- 默认脚本使用 `/root/.openclaw/memory/evermemory/store/evermemory.db`
- 如果你自定义了 DB 路径，运行脚本时设置环境变量：

```bash
EVERMEMORY_DB_PATH=/your/custom/path/evermemory.db npm run test:openclaw:smoke
```

---

## 11. 下一步文档

更详细排障：
- `docs/evermemory-troubleshooting.md`

更详细回滚：
- `docs/evermemory-rollback-guide.md`

安装细节与配置解释：
- `docs/evermemory-installation-guide.md`

日常运维与高级操作：
- `docs/evermemory-operator-runbook.md`

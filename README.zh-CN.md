# 🧠 EverMemory

> OpenClaw 的确定性记忆插件，也是一个会主动思考、学习、进化的 AI 大管家。

[![npm version](https://img.shields.io/npm/v/evermemory)](https://www.npmjs.com/package/evermemory)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-unit%20suite-passing-brightgreen)]()

[English](README.md)

## 为什么需要 EverMemory？

大多数 AI 助手在会话结束后就“失忆”了。用户做过的决策、明确表达过的偏好、长期约束、历史踩坑，下一次往往还要再说一遍。这样不仅体验差，也很难形成真正的协作连续性。

EverMemory 给 OpenClaw 增加了一层可确定、可检查、可治理的长期记忆系统。它把重要信息持久化到本地 SQLite，按规则召回，构建用户画像与行为规则，并提供解释、审查、归档、导入导出、恢复等治理工具。目标不是“看起来像记住了”，而是真正能运营的记忆能力。

## 功能特性

### 🗃️ Layer 1：记忆力

- 16 个核心能力，覆盖存储、召回、briefing、画像、规则、导入导出、审查恢复、反思与整理
- 基于 SQLite 的确定性持久化，适合本地可审计运行
- 支持关键词、结构化、混合三种召回模式
- 支持语义 sidecar，缺少 embedding 依赖时可优雅降级
- 提供归档、审查、恢复的 review/apply 双阶段流程
- 支持 JSON snapshot，以及 OpenClaw 层的 JSON/Markdown 导入导出

### 🧠 Layer 2：理解力

- 从历史交互中构建用户画像，区分稳定字段和弱推断字段
- 从交互中提炼行为规则，并提供治理入口
- 在 session 启动时生成 briefing，补足跨会话连续性
- 利用意图分析改进召回路由和上下文注入
- 所有关键结果都能回溯到实际存储内容，而不是黑盒推断

### 🚀 Layer 3：主动性

- 在 `sessionEnd` 自动提炼 reflection 和记忆候选
- 在后续相关场景中主动召回历史经验
- 通过 consolidation 自动合并重复、归档陈旧项
- 用 explain 工具解释写入、召回、规则、session、归档、intent 决策

## 快速开始

### 安装

```bash
npm install evermemory

# 语义检索已内置，安装后即可使用
```

安装到 OpenClaw：

```bash
openclaw plugins install evermemory@1.0.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

本地开发安装方式：

```bash
npm install
npm run build
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### 首次运行

建议先做 onboarding。当前 OpenClaw 插件里，对应工具名是 `profile_onboard`。

```json
{
  "userId": "u_001",
  "responses": [
    { "questionId": "display_name", "answer": "小王" },
    { "questionId": "language", "answer": "中文" }
  ]
}
```

### 基础用法

存储一个长期决策：

```json
{
  "content": "技术决策：用 Vite 替代 Webpack。",
  "kind": "decision"
}
```

召回历史上下文：

```json
{
  "query": "Vite 迁移决策",
  "limit": 5
}
```

查看系统状态：

```json
{
  "userId": "u_001"
}
```

## 架构

```text
┌─────────────────────────────────┐
│         OpenClaw Host           │
│  ┌───────────────────────────┐  │
│  │      EverMemory Plugin    │  │
│  │  ┌─────┐ ┌─────┐ ┌────┐   │  │
│  │  │Hooks│ │Tools│ │Core│   │  │
│  │  └──┬──┘ └──┬──┘ └─┬──┘   │  │
│  │     │       │       │      │  │
│  │  ┌──┴───────┴───────┴──┐   │  │
│  │  │   SQLite (WAL)      │   │  │
│  │  └─────────────────────┘   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

运行时，插件会把 OpenClaw 的 `sessionStart`、`messageReceived`、`sessionEnd` 钩子接到记忆检索、连续性 briefing、reflection、规则提升、归档治理等流程上。底层存储是本地、确定性、可检查的，而不是不可解释的黑盒记忆。

## 性能

最近一次本地 `npm test` 输出了以下 hook 性能中位数；`store`/`recall` 单次耗时沿用仓库基线文档中的数据：

| 操作 | 中位数 | 上限 |
|---|---:|---:|
| `sessionStart` | 2.4ms | 100ms |
| `messageReceived` | 3.7ms | 200ms |
| `sessionEnd` | 11.3ms | 500ms |
| `store`（单次） | 2.2ms | — |
| `recall`（单次） | 1.1ms | — |

## 质量

当前仓库对外定位是“稳定核心 + 实验增强”：

| 指标 | 数值 |
|---|---|
| 测试 | `250 total / 248 pass / 0 fail / 2 skipped` |
| 稳定核心 | `store / recall / status` |
| 可选能力 | semantic sidecar |
| 实验能力 | briefing、intent、reflect、rules、profile、import/export、review、restore |
| 安全基线 | 发布门禁材料记录为 `0 critical` |
| 语言/运行时 | TypeScript，Node.js 22+ |

## 工具命令

SDK 有 16 个核心能力。当前 OpenClaw 插件里，onboarding 注册名是 `profile_onboard`，smartness 还不是独立工具命令。

| 能力 | OpenClaw 名称 | 说明 |
|---|---|---|
| 存储记忆 | `evermemory_store` | 别名：`memory_store` |
| 召回记忆 | `evermemory_recall` | 别名：`memory_recall` |
| 状态查看 | `evermemory_status` | 统计、状态、连续性 KPI |
| session briefing | `evermemory_briefing` | 启动摘要 |
| 意图分析 | `evermemory_intent` | intent heuristics |
| 反思生成 | `evermemory_reflect` | lesson / warning / candidate rule |
| 规则治理 | `evermemory_rules` | 读取和管理行为规则 |
| 用户画像 | `evermemory_profile` | 读取或重算 |
| 首次 onboarding | `profile_onboard` | 首次问卷 |
| 记忆整理 | `evermemory_consolidate` | 合并、归档、维护 |
| 决策解释 | `evermemory_explain` | 审计解释 |
| 导出 | `evermemory_export` | 别名：`memory_export` |
| 导入 | `evermemory_import` | 别名：`memory_import` |
| 归档审查 | `evermemory_review` | 查看可恢复候选 |
| 归档恢复 | `evermemory_restore` | review/apply 恢复 |
| 智能度 | SDK-only | 当前未注册为宿主工具 |

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | embedding 模式：`local`、`openai`、`none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | 本地 embedding 模型 |
| `EVERMEMORY_OPENAI_MODEL` | provider default | OpenAI embedding 模型覆盖值 |
| `OPENAI_API_KEY` | — | 使用 OpenAI embedding 时必需 |

### 插件配置

| 字段 | 默认行为 | 说明 |
|---|---|---|
| `databasePath` | 自动解析路径 | SQLite 数据库位置 |
| `bootTokenBudget` | `1200` | 启动 briefing 预算 |
| `maxRecall` | `8` | 每次召回上限 |
| `debugEnabled` | `true` | 是否记录调试事件 |
| `semantic.enabled` | 默认关闭 | 是否启用语义 sidecar |
| `semantic.maxCandidates` | 校验后的整数 | 语义候选上限 |
| `semantic.minScore` | 校验后的数值 | 语义召回阈值 |
| `intent.useLLM` | 宿主决定 | 是否启用 LLM intent enrich |
| `intent.fallbackHeuristics` | `true` | 保留确定性回退 |

## 文档

- [API Reference](docs/API.md)
- [用户指南](docs/GUIDE.md)
- [变更记录](docs/CHANGELOG.md)

## Contributing

提交前建议至少跑通：

```bash
npm run build
npm test
```

如果修改了插件行为，最好同步检查 `docs/` 下的能力矩阵、指南和 changelog，避免文档与实现脱节。

## License

MIT

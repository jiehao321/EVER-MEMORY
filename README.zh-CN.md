# EverMemory

> OpenClaw 的确定性记忆插件 -- 一个会主动思考、学习和成长的 AI 管家。

[![npm version](https://img.shields.io/npm/v/evermemory)](https://www.npmjs.com/package/evermemory)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen)]()
[![Tests](https://img.shields.io/badge/tests-250%20passing-brightgreen)]()

[English](README.md)

## 为什么需要 EverMemory？

大多数 AI 助手在会话结束后就彻底失忆。它们当下或许表现出色，却留不住决策、偏好、反复出现的约束条件，以及那些本该让未来协作更顺畅的经验教训。用户不得不一遍遍重复上下文，真正的连续性无从谈起。

EverMemory 为 OpenClaw 提供了一套持久化、可审计的记忆系统。它将关键信息存储在 SQLite 中，通过确定性策略进行检索，自动推演用户画像与行为规则，并在解释、审查、归档、导出导入和恢复等环节提供完整的治理界面。最终产物不只是"长期记忆"，而是一个你可以审计和运维的记忆层。

## 核心能力

### 记忆力

- 16 项核心能力，覆盖存储、召回、briefing、画像、规则、导出导入、审查、恢复、反思与整理
- 基于 SQLite WAL 的确定性本地持久化
- 关键词、结构化、混合三种召回模式
- 语义检索内置可用，embedding 不可用时自动降级
- 归档、审查、恢复三阶段流程，带 review/apply 门禁
- JSON 快照与 Markdown/JSON 格式的 OpenClaw 导出导入通道

### 理解力

- 自动构建用户画像，包含稳定字段和弱推导提示
- 从交互历史中提炼行为规则并进行治理
- Session 启动时生成连续性 briefing
- 意图分析用于改善召回路由和主动上下文注入
- 跨会话连续性建立在可检视的存储记忆之上

### 主动性

- 在 `sessionEnd` 时通过反思和记忆候选提取实现主动学习
- 在后续相关会话或消息中通过召回注入提供主动提醒
- 通过整理、去重和过期归档实现自我维护
- 提供写入、检索、规则、会话、归档和意图决策的可解释工具

## 快速上手

### 安装

```bash
npm install evermemory

# 本地语义检索开箱即用，无需额外配置
```

在 OpenClaw 中启用：

```bash
openclaw plugins install evermemory@1.0.1
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

本地开发：

```bash
npm install
npm run build
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### TypeScript SDK 示例

存储一条持久化决策：

```json
{
  "content": "技术决策：用 Vite 替换 Webpack。",
  "kind": "decision"
}
```

召回已有上下文：

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

运行时，插件将 OpenClaw 钩子（`sessionStart`、`messageReceived`、`sessionEnd`）与记忆检索、连续性 briefing、反思、规则提升和归档工作流串联起来。存储层是本地的、确定性的、可审视的，而非黑盒。

## 工具一览

SDK 共提供 16 项核心能力。在当前 OpenClaw 插件中，首次引导注册为 `profile_onboard`，智能度尚未注册为宿主工具。

| 能力 | OpenClaw 名称 | 说明 |
|---|---|---|
| 存储记忆 | `evermemory_store` | 别名：`memory_store` |
| 召回记忆 | `evermemory_recall` | 别名：`memory_recall` |
| 系统状态 | `evermemory_status` | 统计与 KPI |
| 启动摘要 | `evermemory_briefing` | Session 启动 briefing |
| 意图分析 | `evermemory_intent` | 确定性意图识别 |
| 反思 | `evermemory_reflect` | 经验提炼与候选规则 |
| 规则治理 | `evermemory_rules` | 读取、冻结、弃用、回滚 |
| 用户画像 | `evermemory_profile` | 读取或重算 |
| 首次引导 | `profile_onboard` | 首次使用问卷 |
| 记忆整理 | `evermemory_consolidate` | 合并与归档维护 |
| 决策解释 | `evermemory_explain` | 审计追溯 |
| 导出 | `evermemory_export` | 别名：`memory_export` |
| 导入 | `evermemory_import` | 别名：`memory_import` |
| 归档审查 | `evermemory_review` | 查看归档候选 |
| 归档恢复 | `evermemory_restore` | review/apply 两阶段恢复 |
| 智能度 | SDK-only | 尚未注册为宿主工具 |

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | embedding 模式：`local` / `openai` / `none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | 本地 embedding 模型 |
| `EVERMEMORY_OPENAI_MODEL` | provider default | OpenAI embedding 模型 |
| `OPENAI_API_KEY` | -- | 使用 OpenAI embedding 时必需 |

### 插件配置

| 字段 | 默认值 | 说明 |
|---|---|---|
| `databasePath` | 自动解析 | SQLite 数据库位置 |
| `bootTokenBudget` | `1200` | 启动 briefing token 预算 |
| `maxRecall` | `8` | 每次召回上限 |
| `debugEnabled` | `true` | 调试事件记录 |
| `semantic.enabled` | `false` | 语义检索开关 |
| `semantic.maxCandidates` | -- | 语义候选上限 |
| `semantic.minScore` | -- | 语义召回阈值 |
| `intent.useLLM` | 宿主配置 | LLM 意图增强 |
| `intent.fallbackHeuristics` | `true` | 确定性回退 |

## 性能

最近一次本地 `npm test` 报告的钩子基准中位数，以及存储/召回操作耗时：

| 操作 | 中位数 | 上限 |
|---|---:|---:|
| `sessionStart` | 2.4ms | 100ms |
| `messageReceived` | 3.7ms | 200ms |
| `sessionEnd` | 11.3ms | 500ms |
| `store` | 2.2ms | -- |
| `recall` | 1.1ms | -- |

## 文档

- [API 参考](docs/API.md)
- [使用指南](docs/GUIDE.md)
- [更新日志](docs/CHANGELOG.md)

## 参与贡献

提交变更前请先在本地通过验证：

```bash
npm run build
npm test
```

如果改动涉及插件行为，请同步检查 `docs/` 下的能力矩阵、使用指南和更新日志，确保文档与实现一致。详见 [CONTRIBUTING.md](docs/CONTRIBUTING.md)。

## 许可证

MIT

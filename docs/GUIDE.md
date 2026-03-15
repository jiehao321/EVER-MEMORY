# EverMemory 用户指南

## 什么是 EverMemory

EverMemory 是一个面向 OpenClaw 的长期记忆插件，提供可确定、可解释、可治理的记忆存储、检索、画像、反思与整理能力。

核心能力：

- 结构化记忆存储与召回
- 启动 briefing 与连续性注入
- 意图识别、反思、规则治理
- 用户画像与首次 onboarding
- 导入导出、归档审查、恢复与整理

## 安装

```bash
npm install evermemory

# 可选：启用语义搜索
npm install @xenova/transformers
```

如果你在 OpenClaw 中以插件方式安装，也可以直接绑定仓库路径：

```bash
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
openclaw plugins info evermemory
```

## 快速开始

### 1. 注册插件

```ts
import { initializeEverMemory } from "evermemory";

const evermemory = initializeEverMemory();
```

### 2. 首次运行 `profile_onboard`

首次接入建议先收集基础偏好，建立稳定画像。

```json
{
  "userId": "u_001",
  "responses": [
    { "questionId": "display_name", "answer": "Alice" },
    { "questionId": "language", "answer": "中文" }
  ]
}
```

### 3. 开始使用

最小调用链通常是：

1. `evermemory_store` 写入显式信息。
2. `evermemory_recall` 在新会话中召回相关上下文。
3. `evermemory_briefing` 在 session 启动时生成启动摘要。
4. `evermemory_profile` / `evermemory_rules` / `evermemory_explain` 在治理和排障时查看状态。

## 核心功能

### 记忆存储与召回

- `evermemory_store` 写入结构化记忆，支持类型、生命周期、作用域、标签与来源。
- `evermemory_recall` 支持 `structured`、`keyword`、`hybrid` 三种检索模式。
- 当安装了 `@xenova/transformers` 且语义检索启用时，`hybrid` 可使用本地 embedding 增强召回。

### 智能 Briefing

- `evermemory_briefing` 输出四类启动块：`identity`、`constraints`、`recentContinuity`、`activeProjects`。
- 适合在 `session_start` 前注入，帮助 agent 保持跨会话连续性。

### 主动学习

- `evermemory_intent` 将消息解析为确定性 intent record。
- `evermemory_reflect` 从经验日志生成 reflection 与 candidate rules。
- `evermemory_rules` 可读取、冻结、弃用或回滚行为规则。

### 用户画像

- `profile_onboard` 收集首次使用信息。
- `evermemory_profile` 提供稳定字段与弱提示字段两层画像。
- 派生字段被限制为 `weak_hint_only`，避免把不确定推断写成硬约束。

### 记忆整理

- `evermemory_consolidate` 执行 manual consolidation。
- `evermemory_review` 审查归档候选与规则来源。
- `evermemory_restore` 以 `review/apply` 两阶段恢复归档项。
- `evermemory_export` / `evermemory_import` 支持快照迁移与备份。

## 配置选项

常见环境变量：

- `EVERMEMORY_EMBEDDING_PROVIDER`
  可选 provider。常见值是本地 embedding 或 OpenAI provider。
- `EVERMEMORY_LOCAL_MODEL`
  本地 embedding 模型名。默认会回退到 `Xenova/all-MiniLM-L6-v2`。
- `OPENAI_API_KEY`
  当 embedding provider 使用 OpenAI 时需要。

常见默认行为：

- 数据库默认路径：`.openclaw/memory/evermemory/store/evermemory.db`
- 默认最大召回：`8`
- 默认 token 预算：`1200`
- 默认语义 sidecar：关闭；缺少依赖时会优雅降级

## 常见问题 (FAQ)

**Q: 语义搜索需要什么？**

需要安装 `@xenova/transformers`。如果未安装，EverMemory 仍可工作，但 `hybrid` 会退化为无语义增强的检索路径。

**Q: 记忆数据存在哪里？**

默认保存在 `.openclaw/memory/evermemory/store/evermemory.db` 的 SQLite 数据库中。

**Q: 如何导出/导入记忆？**

使用 `evermemory_export` 生成 `evermemory.snapshot.v1` 快照，或在 OpenClaw 注册层使用 `format=json|markdown` 导出文本。导入时使用 `evermemory_import`，推荐先走 `mode=review`，确认后再 `apply`。

**Q: 如何查看智能度？**

SDK 可直接调用 `evermemorySmartness`。它返回文本报告，展示整体分数和各维度趋势。当前该能力尚未注册为 OpenClaw 工具名。

**Q: `profile_onboard` 和 `evermemory_profile` 有什么区别？**

`profile_onboard` 负责首次采集与初始化，`evermemory_profile` 负责读取或重算当前画像。

**Q: 导入/恢复为什么有 `review` 和 `apply` 两步？**

这是治理设计的一部分。EverMemory 默认先展示计划和拒绝项，避免直接覆盖已有状态。

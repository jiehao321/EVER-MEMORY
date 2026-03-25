# EverMemory

[English](README.md) | 中文

**给 OpenClaw 的长期记忆系统，在真正需要的时候把重要信息带回来。**

`OpenClaw 插件` `本地 SQLite 记忆` `受控写入/召回` `可选语义检索`

它会帮助 agent 记住用户偏好、长期约束、反复出现的事实和会话上下文，并在合适的时候把这些信息重新带回来。它不是简单地把对话原文塞进数据库，而是用本地存储、受控写入和受控召回，把记忆变成 briefing、画像和真正可用的上下文。

## 为什么它不一样

- 它记住的不只是聊天历史，还包括偏好、身份事实、约束条件、重复模式和工作上下文。
- 它把记忆落到本地 SQLite，而不是把“记住了”建立在脆弱的短期上下文上。
- 它有写入和召回治理，不是看到什么都盲目保存。
- 它可以把记忆组织成 briefing、画像和规则上下文，而不是把一长串原始记录重新塞回提示词。
- 在需要时，它还能接入可选的语义召回，以及可选的 Butler 战略层。

## 一个具体场景

假设用户对你的 OpenClaw agent 说过：

- “代码评审意见尽量简洁。”
- “我在 Asia/Shanghai 时区工作。”
- “不要每次新会话都重新问我 onboarding 问题。”

有了 EverMemory，这些信息就不需要反复重复。后续会话里，系统可以把这些事实重新找回来，结合当前任务重新排序，再以 recall 结果、session briefing 或画像上下文的方式重新喂给 agent。

这就是它存在的意义：不是单纯“记住”，而是以 agent 真正能用的方式把记忆带回来。

## 快速开始

### 作为 OpenClaw 插件安装

```bash
openclaw plugins install evermemory@2.1.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### 作为 SDK 安装

```bash
npm install evermemory
```

## 你会得到什么

- 基于 `better-sqlite3` 的 SQLite 持久化记忆存储
- 面向 OpenClaw 工作流的受控记忆写入与召回
- 把重要上下文重新带回来的 recall 与 session briefing 流程
- 用于长期协作的画像投影与规则治理能力
- 用于迁移和备份的导入导出工具
- 可选的语义召回能力，可接本地 embedding 或 OpenAI embedding
- 可选的 Butler 战略层，用于摘要、复盘和更广义的上下文覆盖

## 工作方式

1. **捕获**
   agent 在消息、工具输出和会话事件中识别可能值得记住的内容。
2. **存储**
   EverMemory 判断哪些内容应该持久化，然后写入本地 SQLite 记忆库。
3. **召回**
   后续查询会通过受控的关键词、结构化和可选语义检索找回相关记忆。
4. **组织与治理**
   找回来的记忆可以进入 briefing、画像投影和规则流程，让 agent 不必每次都从零开始。

## 最小 SDK 示例

```ts
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({
  databasePath: './memory.db',
});

em.evermemoryStore({
  content: '用户希望代码评审意见更简洁。',
  source: { kind: 'tool', actor: 'system' },
  scope: { userId: 'user-1' },
});

const recall = await em.evermemoryRecall({
  query: '代码评审偏好',
  mode: 'hybrid',
  scope: { userId: 'user-1' },
  limit: 5,
});
```

## 运行要求

- Node.js `>=22`
- OpenClaw peer dependency `>=2026.3.22 <2027`
- `better-sqlite3` 原生依赖
- 本地 embedding 需要 `sharp` 与 `@xenova/transformers`

## 当前注意事项

- 当前维护的公开文档，以 [docs/INDEX.md](docs/INDEX.md) 链出的内容为准。历史内部资料不应被视为当前产品承诺。
- 当前仓库快照下，`npm run check` 通过。
- 当前仓库快照下，`npm test` 在发布打包覆盖上仍有失败，因此不能把原生依赖打包描述为“已完全验证”。
- `npm pack --dry-run` 通过，但发布打包可信度仍然受上面的失败测试约束。
- 语义召回是可选能力，embedding 依赖不可用时会降级。
- Butler 是可选层，但会显著扩大系统复杂度和运维面。

## 文档入口

- [文档总览](docs/INDEX.md)
- [使用指南](docs/GUIDE.md)
- [API 参考](docs/API.md)
- [架构说明](docs/ARCHITECTURE.md)
- [贡献指南](docs/CONTRIBUTING.md)
- [变更记录](docs/CHANGELOG.md)
- [安全策略](SECURITY.md)
- [English README](README.md)

## 开发视角的仓库状态

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

如果你是维护者或准备二次开发，建议从 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) 开始。

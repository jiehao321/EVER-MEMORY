# EverMemory

EverMemory 是一个面向 OpenClaw 的 TypeScript 记忆系统。它把本地 SQLite 记忆存储、检索与 briefing、画像投影、规则治理、导入导出，以及可选的 Butler 战略层放在同一个代码仓库里。

先说明当前仓库现实：

- `npm run check` 通过
- `npm test` 当前失败，失败点在发布打包覆盖
- `npm pack --dry-run` 通过

因此，本仓库里的文档以 `docs/INDEX.md` 指向的内容为准，不应继续把旧的内部规划文档当成当前状态说明。

## 当前包含的能力

- 基于 SQLite / `better-sqlite3` 的持久记忆
- 确定性写入策略与检索流程
- briefing、画像、反思、规则治理
- OpenClaw 插件接入与工具注册
- 可选本地语义检索 / OpenAI embedding
- 可选 Butler 子系统：战略摘要、任务队列、insight review

## 安装

### 作为 OpenClaw 插件

```bash
openclaw plugins install evermemory@2.1.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### 作为 SDK 依赖

```bash
npm install evermemory
```

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

- 仓库里仍保留了一批历史内部文档和过程文件；只有 `docs/INDEX.md` 链出的文档属于当前维护入口。
- 当前仓库快照下，发布打包相关测试并不全绿，因此文档不会再声称“原生依赖打包已完全验证”。
- 本地语义检索是可选能力，依赖不可用时会降级。
- Butler 已经进入代码和插件注册面，但它显著扩大了系统复杂度。

## 文档入口

- [文档总览](docs/INDEX.md)
- [使用指南](docs/GUIDE.md)
- [API 参考](docs/API.md)
- [架构说明](docs/ARCHITECTURE.md)
- [贡献指南](docs/CONTRIBUTING.md)
- [变更记录](docs/CHANGELOG.md)
- [安全策略](SECURITY.md)
- [English README](README.md)

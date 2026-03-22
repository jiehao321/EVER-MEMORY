<p align="center">
  <h1 align="center">EverMemory</h1>
  <p align="center">
    <strong>给你的 AI 助手一颗永不遗忘的大脑。</strong>
  </p>
  <p align="center">
    <a href="https://github.com/openclaw">OpenClaw</a> 智能记忆插件 —— <br/>
    存储知识、构建关系图谱、主动召回、持续进化。
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/evermemory"><img src="https://img.shields.io/npm/v/evermemory.svg?style=flat-square&color=cb3837" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/evermemory"><img src="https://img.shields.io/npm/dm/evermemory.svg?style=flat-square&color=blue" alt="npm downloads"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="license"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg?style=flat-square" alt="node"></a>
    <img src="https://img.shields.io/badge/tests-430%20passing-brightgreen.svg?style=flat-square" alt="tests">
    <img src="https://img.shields.io/badge/TypeScript-strict-blue.svg?style=flat-square" alt="typescript">
  </p>
</p>

<p align="center">
  <a href="#-快速开始">快速开始</a> &bull;
  <a href="#-核心能力">核心能力</a> &bull;
  <a href="#-工作原理">工作原理</a> &bull;
  <a href="#-工具一览">工具一览</a> &bull;
  <a href="docs/API.md">API 文档</a> &bull;
  <a href="docs/GUIDE.md">使用指南</a> &bull;
  <a href="./README.md">English</a>
</p>

---

## 痛点

AI 助手就像金鱼 —— 每次对话从零开始。决策被反复讨论，偏好被遗忘，辛苦建立的上下文在会话结束时蒸发殆尽。你不得不一遍又一遍地重复自己。

## 解决方案

EverMemory 为你的 AI 提供**持久化、智能化的记忆层**：

- **记住** 每次对话中的关键信息
- **连接** 知识 —— 自动构建知识图谱
- **主动推荐** 你还没问但应该知道的上下文
- **持续学习** 你的偏好，越用越懂你
- **全程可审计** —— 每条记忆可追溯，每条规则可回滚

> 把它想象成一个永远不会忘记任何对话、能预判你需求、并且越来越称职的 AI 管家。

---

## 快速开始

### 一键安装（OpenClaw 插件）

```bash
npx evermemory
```

就这么简单。EverMemory 自动注册为 OpenClaw 插件并立即开始工作。

### 或作为依赖安装

```bash
npm install evermemory
```

### TypeScript SDK 示例

```typescript
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({ databasePath: './memory.db' });

// 存储一条决策
em.evermemoryStore({
  content: '技术决策：所有新项目用 Vite 替换 Webpack。',
  type: 'decision',
  tags: ['tooling', 'frontend'],
});

// 召回相关记忆 —— 关键词 + 语义混合检索
const results = await em.evermemoryRecall({
  query: '构建工具决策',
  mode: 'hybrid',
  limit: 5,
});

// 生成会话启动摘要
const briefing = em.evermemoryBriefing({ tokenTarget: 900 });
```

---

## 核心能力

### 持久记忆

| 能力 | 说明 |
|:---|:---|
| **类型化存储** | 事实、决策、偏好、流程 —— 带生命周期追踪 |
| **混合检索** | 关键词 + 结构化 + 语义，一次查询三路并行 |
| **本地语义搜索** | 内置 `@xenova/transformers` embedding，无需外部 API |
| **编辑与浏览** | 更新、修正、删除、浏览记忆库存 |
| **导入 / 导出** | JSON 或 Markdown 格式的完整记忆归档 |

### 知识图谱

| 能力 | 说明 |
|:---|:---|
| **自动关系检测** | 存储时自动识别因果、矛盾、演变、支持关系 |
| **7 种关系类型** | `causes` `contradicts` `supports` `evolves_from` `supersedes` `depends_on` `related_to` |
| **图谱增强召回** | 利用关系连接提升搜索结果排名 |
| **传递推理** | A 导致 B，B 导致 C → A 间接导致 C |
| **矛盾告警** | 新记忆与已有知识冲突时实时预警 |

### 主动智能

| 能力 | 说明 |
|:---|:---|
| **主动召回** | 推送你没有问但应该知道的 —— 即将到期的承诺、关联上下文 |
| **预测上下文** | 基于历史会话模式预判你本次需要什么 |
| **自适应检索** | 根据你实际使用的记忆自动调优搜索权重 |
| **承诺提醒** | 提醒你关注可能需要跟进的决策和承诺 |
| **衰减预警** | 重要记忆长期未访问、即将归档时发出警报 |

### 持续进化

| 能力 | 说明 |
|:---|:---|
| **会话摘要** | 每次开始时生成 token 预算内的关键记忆总结 |
| **用户画像** | 跨会话追踪偏好、专长和工作风格 |
| **规则治理** | 定义、版本化、审计和回滚记忆塑形策略 |
| **记忆压缩** | 相似记忆随时间聚类为精炼摘要 |
| **自调优衰减** | 根据实际使用频率调整留存 —— 有用的记忆活得更久 |
| **偏好漂移检测** | 追踪偏好变化并标记反转 |

---

## 工作原理

```
                        ┌──────────────────────────────────────────┐
                        │           OpenClaw / 你的应用             │
                        └──────────────┬───────────────────────────┘
                                       │
                        ┌──────────────▼───────────────────────────┐
                        │          EverMemory 插件                  │
                        │                                          │
                        │  ┌──────────┐      ┌──────────────────┐  │
                        │  │ 生命周期  │      │   19 个 SDK 工具  │  │
                        │  │  钩子     │      │ 存储 · 召回       │  │
                        │  │ session  │      │ 编辑 · 浏览       │  │
                        │  │ message  │      │ 规则 · 摘要       │  │
                        │  └────┬─────┘      │ 图谱 · ...       │  │
                        │       │            └────────┬─────────┘  │
                        │  ┌────▼─────────────────────▼─────────┐  │
                        │  │            核心引擎                  │  │
                        │  │                                     │  │
                        │  │  记忆服务    知识图谱    主动召回      │  │
                        │  │                                     │  │
                        │  │  检索引擎    画像引擎    行为规则      │  │
                        │  │                                     │  │
                        │  │  反思引擎    压缩引擎    摘要构建      │  │
                        │  └──────────────┬─────────────────────┘  │
                        │                 │                         │
                        │  ┌──────────────▼─────────────────────┐  │
                        │  │   SQLite WAL (better-sqlite3)      │  │
                        │  │   18 次 schema 迁移 · 6 张核心表    │  │
                        │  └────────────────────────────────────┘  │
                        └──────────────────────────────────────────┘
```

**设计原则：**

- **确定性优先** —— 关键路径不依赖 LLM。检索、评分、关系检测全部基于规则算法。
- **零外部依赖** —— SQLite WAL + 可选本地 embedding。不需要云端 API。
- **全程可审计** —— 每次存储、召回、规则变更和关系创建都记录在调试事件中。
- **优雅降级** —— 语义搜索不可用？自动退回关键词。Embedding 冷启动？照常工作。

---

## 工具一览

EverMemory 提供 **19 个 SDK 工具**（18 个通过 OpenClaw 注册 + 1 个 SDK 独占）：

| 工具 | OpenClaw 名称 | 说明 |
|:---|:---|:---|
| **存储** | `evermemory_store` | 存储带标签和生命周期的类型化记忆 |
| **召回** | `evermemory_recall` | 关键词 + 结构化 + 语义混合搜索 |
| **编辑** | `evermemory_edit` | 更新、删除、修正、合并、置顶记忆 |
| **浏览** | `evermemory_browse` | 带归档风险标记的过滤记忆清单 |
| **图谱** | `evermemory_relations` | 列出、添加、删除关系边；探索子图 |
| **状态** | `evermemory_status` | 健康度、统计、KPI、语义状态、告警 |
| **摘要** | `evermemory_briefing` | Token 预算内的会话启动上下文 |
| **意图** | `evermemory_intent` | 确定性意图分析（支持中文疑问句） |
| **反思** | `evermemory_reflect` | 从经验中提炼教训和候选规则 |
| **规则** | `evermemory_rules` | 列出、冻结、弃用、回滚行为规则 |
| **画像** | `evermemory_profile` | 读取或重算用户偏好画像 |
| **引导** | `profile_onboard` | 新用户首次使用问卷 |
| **整理** | `evermemory_consolidate` | 合并重复、归档过期项 |
| **解释** | `evermemory_explain` | 写入、检索和规则决策的审计追溯 |
| **导出** | `evermemory_export` | 导出记忆归档（JSON / Markdown） |
| **导入** | `evermemory_import` | 导入验证、预览模式、自动去重 |
| **审查** | `evermemory_review` | 查看归档记忆候选 |
| **恢复** | `evermemory_restore` | 两阶段审查/执行归档恢复 |
| **智能度** | _仅 SDK_ | 各维度智能评分，附优化建议 |

---

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|:---|:---|:---|
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | `local`、`openai` 或 `none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | 本地 embedding 模型 |
| `EVERMEMORY_OPENAI_MODEL` | 默认 | OpenAI 模型覆盖 |
| `OPENAI_API_KEY` | — | 使用 `openai` provider 时必需 |

### 插件配置 (`openclaw.plugin.json`)

| 字段 | 默认值 | 说明 |
|:---|:---|:---|
| `databasePath` | 自动 | SQLite 数据库位置 |
| `bootTokenBudget` | `1200` | 启动摘要 token 预算 |
| `maxRecall` | `8` | 每次召回最大条数 |
| `debugEnabled` | `true` | 调试事件记录 |
| `semantic.enabled` | `true` | 语义搜索开关 |
| `semantic.maxCandidates` | `200` | 语义候选上限 |
| `semantic.minScore` | `0.15` | 语义相似度阈值 |

---

## 性能

Apple M2, Node.js 22, 10,000 条记忆数据库：

| 操作 | 延迟 | 预算上限 |
|:---|:---|:---|
| `store` | 2.2 ms | — |
| `recall` | 1.1 ms | < 300 ms |
| `messageReceived` 钩子 | 3.7 ms | < 500 ms |
| `sessionStart` 钩子 | 2.4 ms | — |
| `sessionEnd` 钩子 | 11.3 ms | < 8 s |

所有操作均远低于 OpenClaw 延迟预算。EverMemory 几乎不增加额外开销。

---

## 测试

```bash
npm test             # 430 个测试，36 个套件
npm run validate     # 完整验证（doctor + 类型检查 + 测试）
npm run e2e:smoke    # OpenClaw 真机冒烟测试
```

**质量指标：**
- 召回准确率：**1.0**
- 单元测试通过率：**100%**
- 跨会话连续性：**已验证**
- 自动捕获采纳率：**0.75**

---

## 文档

| 文档 | 说明 |
|:---|:---|
| [API 参考](docs/API.md) | 完整工具 API、参数和示例 |
| [使用指南](docs/GUIDE.md) | 入门、工作流、最佳实践 |
| [技术架构](docs/ARCHITECTURE.md) | 系统设计、数据流、Schema 详情 |
| [更新日志](docs/CHANGELOG.md) | 版本历史和迁移说明 |
| [贡献指南](docs/CONTRIBUTING.md) | 开发环境搭建和贡献规范 |

---

## 路线图

- [ ] 多语言 i18n（中/英自动检测）
- [ ] 首次使用引导流程
- [ ] 大结果集流式召回
- [ ] ClawHub 市场上架
- [ ] 可视化知识图谱浏览器
- [ ] 插件生态（自定义关系类型、检索策略）

---

## 参与贡献

欢迎贡献！提交 PR 前请阅读 [贡献指南](docs/CONTRIBUTING.md)。

```bash
git clone https://github.com/jiehao321/EVER-MEMORY.git
cd EVER-MEMORY
npm install
npm run validate   # 提交前必须通过
```

所有变更必须通过 `npm run validate`，测试覆盖率保持 80% 以上。

---

## 许可证

[MIT](LICENSE) —— 可自由用于个人和商业项目。

---

<p align="center">
  <sub>用 SQLite、TypeScript 和一个信念构建：AI 助手值得拥有真正的记忆。</sub>
</p>

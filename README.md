# EverMemory

Deterministic memory plugin for OpenClaw, focused on inspectable persistence, project continuity, and operator-grade reliability.

Single-file bilingual README (Chinese + English).

Language switch: [中文](#zh) | [English](#en)

---

<a id="zh"></a>
## 中文

### 1. 项目定位

EverMemory 是一个面向 OpenClaw 的记忆插件，目标是把“可持续对话记忆”做成可落地、可调试、可发布的工程能力，而不是黑盒记忆。

核心原则：
- 确定性优先：写入/召回结果可复现，可解释。
- 运维优先：有状态、有门禁、有回滚、有证据。
- 渐进增强：稳定核心 + 可选增强 + 实验能力分层。

### 2. 当前状态（2026-03-14）

- npm 插件：`evermemory@0.0.1` 已发布。
- ClawHub Skill：`openclaw-evermemory-installer@0.1.0` 已发布。
- 质量门禁最新基线：
  - `teams:status` PASS
  - `teams:dev` PASS
  - `teams:release` PASS
  - recall benchmark：`30 样本 / 29 通过 / 0.9667`
  - OpenClaw security gate：`critical=0`

### 3. 主要功能

#### 3.1 稳定核心（生产基线）

- 确定性写入：`evermemory_store`
  - 统一写入策略（低价值内容可拒绝并返回明确原因）。
- 确定性召回：`evermemory_recall`
  - 支持 `structured` / `keyword` / `hybrid` 模式。
  - 关键词召回含权重排序（覆盖度、时效性、质量信号）。
- 状态观测：`evermemory_status`
  - 返回 schema、计数、最近调试事件、运行态上下文。
- SQLite 持久化与幂等迁移。
- OpenClaw 生命周期集成：`session_start` / `before_agent_start` / `agent_end`。

#### 3.2 可选增强（按配置启用）

- semantic sidecar 语义检索（默认关闭）。
- LLM intent enrich（需要宿主注入 analyzer）。

#### 3.3 实验能力（已实现，谨慎生产使用）

- 意图分析与持久化（IntentService）。
- 反思与候选规则（ReflectionService）。
- 行为规则提炼、排序、冲突治理（BehaviorService）。
- 用户画像投影（stable/derived 严格分层）。
- 手动治理能力：consolidate / explain / export / import / review / restore。

### 4. 架构概览

```text
OpenClaw Runtime
  -> EverMemory Plugin Adapter (src/openclaw/plugin.ts)
      -> Core Services
         - MemoryService
         - RetrievalService
         - BriefingService
         - IntentService
         - ReflectionService
         - BehaviorService
         - ProfileProjectionService
      -> Storage Repositories
         - memory / intent / reflection / behavior / profile / briefing / debug
      -> SQLite (better-sqlite3)
```

关键数据流：
- 写入链路：tool/hook -> policy -> repo -> sqlite -> debug evidence
- 召回链路：query -> candidate load -> ranking/policy -> result + debug evidence
- 会话链路：session_start 建立上下文，before_agent_start 注入相关记忆，agent_end 生成经验与反思

### 5. 当前 OpenClaw 工具面（已完整注册）

已注册（插件默认暴露）：
- `evermemory_store`（别名：`memory_store`）
- `evermemory_recall`（别名：`memory_recall`）
- `evermemory_status`
- `evermemory_briefing`
- `evermemory_intent`
- `evermemory_reflect`
- `evermemory_rules`
- `evermemory_profile`
- `evermemory_consolidate`
- `evermemory_explain`
- `evermemory_export`
- `evermemory_import`
- `evermemory_review`
- `evermemory_restore`

### 6. 已完成的主要工作（工程交付）

- 完成 0.0.1 发布基线（代码、文档、门禁、回滚流程）。
- 完成 recall 路由与排序增强（项目连续性、下一步/进度/决策等查询优化）。
- 完成质量体系脚本化：
  - `teams:status` / `teams:dev` / `teams:release`
  - `quality:gate:openclaw`
  - `test:openclaw:smoke` / `test:openclaw:security`
  - `test:recall:benchmark`
- 完成发布链路：
  - npm 包发布（`evermemory@0.0.1`）
  - ClawHub Skill 发布（`openclaw-evermemory-installer@0.1.0`）
- 完成运维文档体系：安装、Runbook、Troubleshooting、Release Checklist、Rollback Procedure。

### 7. 快速开始

#### 7.1 本地开发验证

```bash
npm install
npm run check
npm run test:unit
npm run teams:dev
```

#### 7.2 安装到 OpenClaw（本地路径）

```bash
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
openclaw plugins info evermemory
```

#### 7.3 从 npm 安装

```bash
openclaw plugins install evermemory@0.0.1
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

#### 7.4 使用内置 Skill 执行安装/发布

```bash
# 安装插件
bash skills/openclaw-evermemory-installer/scripts/install_plugin.sh --source local --link --bind-slot --restart-gateway

# 校验安装
bash skills/openclaw-evermemory-installer/scripts/verify_install.sh
```

### 8. 质量门禁与发布

发布前必跑：

```bash
npm run teams:release
```

该命令会串联：
- 类型检查 / 构建 / 单测
- OpenClaw smoke
- OpenClaw security gate
- recall benchmark
- release pack

### 9. 目录结构（核心）

```text
src/
  core/           # memory/intent/reflection/behavior/profile 等核心能力
  retrieval/      # 召回策略与排序
  hooks/          # session_start / before_agent_start / agent_end
  storage/        # SQLite 仓储与迁移
  openclaw/       # OpenClaw 插件适配层
  tools/          # 工具封装
scripts/          # 质量门禁、发布、e2e、安全脚本
docs/             # 发布与运维文档
skills/           # OpenClaw Skill（安装与发布流程）
```

### 10. 文档入口

- 安装指南：`docs/evermemory-installation-guide.md`
- 运维手册：`docs/evermemory-operator-runbook.md`
- 发布清单：`docs/evermemory-release-checklist.md`
- 回滚流程：`docs/evermemory-rollback-procedure.md`
- 故障排查：`docs/evermemory-troubleshooting.md`
- 能力矩阵：`docs/evermemory-capability-matrix.md`
- 边界说明：`docs/evermemory-v1-boundary.md`

---

<a id="en"></a>
## English

### 1. Project Positioning

EverMemory is an OpenClaw memory plugin built for deterministic, inspectable, and operable long-term memory.

Engineering principles:
- Determinism first: repeatable write/recall outcomes.
- Operator first: observable state, quality gates, rollback-ready process.
- Progressive hardening: stable core + optional enhancements + experimental capabilities.

### 2. Current Status (2026-03-14)

- npm package published: `evermemory@0.0.1`.
- ClawHub skill published: `openclaw-evermemory-installer@0.1.0`.
- Latest quality snapshot:
  - `teams:status` PASS
  - `teams:dev` PASS
  - `teams:release` PASS
  - recall benchmark: `30 samples / 29 pass / 0.9667`
  - OpenClaw security gate: `critical=0`

### 3. Main Capabilities

#### 3.1 Stable Core (production baseline)

- Deterministic write path via `evermemory_store`.
- Deterministic recall path via `evermemory_recall` with `structured`/`keyword`/`hybrid`.
- Operational status surface via `evermemory_status`.
- SQLite persistence with idempotent migrations.
- OpenClaw lifecycle integration (`session_start`, `before_agent_start`, `agent_end`).

#### 3.2 Optional Enhancements

- Semantic sidecar retrieval (disabled by default).
- LLM intent enrichment (requires host-injected analyzer).

#### 3.3 Experimental Capabilities

- Intent analysis and persistence.
- Reflection and candidate-rule generation.
- Behavior-rule promotion/ranking/governance.
- Profile projection with stable/derived split.
- Manual governance tools: consolidate/explain/export/import/review/restore.

### 4. Architecture

```text
OpenClaw Runtime
  -> EverMemory Plugin Adapter (src/openclaw/plugin.ts)
      -> Core Services
      -> Storage Repositories
      -> SQLite
```

Primary flows:
- write: tool/hook -> policy -> repo -> sqlite -> debug evidence
- recall: query -> candidate loading -> ranking/policy -> output + evidence
- session: start context -> pre-agent memory injection -> end-of-session reflection

### 5. Current OpenClaw Tool Surface (fully registered)

Registered by default:
- `evermemory_store` (alias: `memory_store`)
- `evermemory_recall` (alias: `memory_recall`)
- `evermemory_status`
- `evermemory_briefing`
- `evermemory_intent`
- `evermemory_reflect`
- `evermemory_rules`
- `evermemory_profile`
- `evermemory_consolidate`
- `evermemory_explain`
- `evermemory_export`
- `evermemory_import`
- `evermemory_review`
- `evermemory_restore`

### 6. What Has Been Delivered

- Release 0.0.1 baseline (code + docs + gates + rollback procedure).
- Retrieval routing/ranking improvements for project continuity queries.
- Scripted quality system (teams/dev/release, OpenClaw smoke/security, recall benchmark).
- Distribution pipeline completed:
  - npm package published
  - ClawHub installer skill published
- Full operator documentation set (installation/runbook/troubleshooting/release/rollback).

### 7. Quick Start

```bash
npm install
npm run check
npm run test:unit
npm run teams:dev
```

Install into OpenClaw (local path):

```bash
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
openclaw plugins info evermemory
```

Install from npm:

```bash
openclaw plugins install evermemory@0.0.1
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### 8. Release Gate

Run before any release:

```bash
npm run teams:release
```

This gate covers typecheck/build/tests/OpenClaw smoke/OpenClaw security/benchmark/release pack.

### 9. Key Paths

- `src/` core implementation
- `scripts/` quality/release/e2e/security automation
- `docs/` release and operator documentation
- `skills/` OpenClaw installer/publisher skill

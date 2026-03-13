# EverMemory（Release 0.0.1 基线）

EverMemory 是一个面向 OpenClaw 的记忆插件，核心目标是提供可确定、可解释、可治理的长期记忆能力。

## 快速入口

- 英文 README：[`README.md`](README.md)
- 安装指南：`docs/evermemory-installation-guide.md`
- 运维手册：`docs/evermemory-operator-runbook.md`
- 发布清单：`docs/evermemory-release-checklist.md`
- 回滚流程：`docs/evermemory-rollback-procedure.md`
- 能力矩阵：`docs/evermemory-capability-matrix.md`
- v1 边界：`docs/evermemory-v1-boundary.md`
- OpenClaw 安装/发布技能：`skills/openclaw-evermemory-installer/SKILL.md`

## 当前状态（2026-03-13）

- `teams:status`：PASS
- `teams:dev`：PASS
- `teams:release`：PASS
- recall benchmark：30 样本 / 29 通过 / `0.9667`
- OpenClaw security gate：`critical=0`

项目定位：
- 稳定核心：`store / recall / status`
- 可选能力：semantic sidecar、LLM intent enrich（需宿主注入）
- 实验能力：reflection / rules / profile / import-export / restore

## 安装（本地开发推荐）

```bash
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
openclaw plugins info evermemory
```

## 质量门禁（发布前必跑）

```bash
npm run teams:dev
npm run teams:release
npm run test:recall:benchmark
```

建议阈值：
- 硬门禁：benchmark `>= 0.90`
- 冻结发布目标：benchmark `>= 0.95`

## 通过 Skill 执行安装/发布

已内置技能目录：
- `skills/openclaw-evermemory-installer/`

常用命令：

```bash
# 安装插件（本地路径）
bash skills/openclaw-evermemory-installer/scripts/install_plugin.sh --source local --link --bind-slot --restart-gateway

# 验证安装
bash skills/openclaw-evermemory-installer/scripts/verify_install.sh

# 发布 Skill 到 ClawHub（需先 clawhub login）
bash skills/openclaw-evermemory-installer/scripts/publish_skill.sh --version 0.1.0 --changelog "Initial release"

# 发布插件到 npm（默认 dry-run）
bash skills/openclaw-evermemory-installer/scripts/publish_plugin.sh --dry-run
```

## 边界说明

当前 OpenClaw 默认注册工具：
- `evermemory_store`
- `evermemory_recall`
- `evermemory_status`

库层已实现能力多于默认插件暴露能力。对外能力声明以 `docs/evermemory-v1-boundary.md` 与 `docs/evermemory-capability-matrix.md` 为准。

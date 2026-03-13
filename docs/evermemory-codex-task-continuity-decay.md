# EverMemory Codex 执行任务书：连续记忆与记忆衰减整改

## 1. 任务背景

EverMemory 当前已具备：
- persistence / migrations
- deterministic write baseline
- retrieval / reflection / behavior rules
- archive/review/restore
- debug / status / explainability

但根据 2026-03-13 的主机实测，仍未达到 operator 对“连续记忆系统”的预期，主要问题：

1. `memory_items` 被测试/E2E 数据主导，缺真实项目语料
2. 自动对话流程没有稳定把真实高价值交互沉淀为 durable memory
3. boot briefing 结构存在，但内容为空或价值不足
4. lifecycle 虽有 baseline，但缺成熟的 long-horizon decay / supersession / migration

参考文档：
- `docs/evermemory-continuity-decay-remediation-plan.md`
- `docs/evermemory-phase-roadmap.md`
- `docs/evermemory-v1-boundary.md`
- `docs/evermemory-capability-matrix.md`
- `docs/evermemory-troubleshooting.md`

## 2. 总体目标

把 EverMemory 从“记忆内核”推进到“可持续使用的连续记忆系统”，重点只做三件事：

1. 自动沉淀真实交互中的高价值记忆
2. 产出真正有用的 continuity briefing / project summary
3. 建立更成熟的 memory decay / lifecycle migration baseline

## 3. 约束

- 不要推倒现有架构
- 优先复用现有 repo/service/hook/tool 结构
- 不要夸大 README 中的默认生产能力
- 区分：代码已实现 / host 已注册 / 默认生产行为
- 如果新增能力默认不开启，必须写清开关和默认值
- 所有新行为必须补测试

## 4. 建议实施拆分

### Task A — Interaction Memory Extraction + Auto Store
目标：补齐自动 durable memory capture。

建议实现：
- 新增 interaction memory extractor（可放在 `src/core/memory/` 或 `src/hooks/` 配套目录）
- 在 `sessionEnd()` 链路中基于：
  - inputText
  - assistantText
  - intent
  - experience
  - reflection
  - scope
  生成 memory candidates
- candidate 类型至少支持：
  - `project_state`
  - `active_project`
  - `decision`
  - `explicit_constraint`
  - `user_preference`
  - `correction_lesson`
- 基于 deterministic policy 做 accept/reject
- accepted candidate 自动写入 `memory_items`
- debug 中保留 explainable trace

验收：
- 无需手工 `evermemory_store`，真实对话后可产生生产 memory
- 测试覆盖 accepted/rejected/superseded 场景

### Task B — Continuity Briefing V2
目标：boot briefing 不再是空骨架。

建议实现：
- 重构 briefing builder
- 至少输出：
  - identity
  - constraints
  - recentContinuity
  - activeProjects
  - operatorReminders（如合适）
- 引入 project summary memory，优先服务“项目进展”类问题
- `before_agent_start` 注入优先级调整为：
  1. active project summaries
  2. recent corrections / explicit constraints
  3. top recalled memory
  4. behavior rules

验收：
- 实测 sessionStart 后 `boot_briefings.sections_json` 不再长期为空
- 问“项目进展”时能优先命中项目 summary 或 project_state 类 memory

### Task C — Production vs Test Memory Separation
目标：避免 recall 被 smoke/E2E 数据污染。

建议实现：
- 增强 source kind / tags / scope discipline
- 默认 recall 对 `test`/`smoke`/`e2e` 类样本降权或过滤
- 如需要，增加 migration / cleanup utility / review script

验收：
- 真实 recall 默认不会优先返回测试样本
- 文档写清 operator 如何区分测试与生产数据

### Task D — Memory Decay & Lifecycle Migration Baseline
目标：引入真正可用的记忆衰减与迁移。

建议实现：
- 为 memory item 增加 decay score 计算（可动态或持久化）
- 引入 lifecycle migration baseline：
  - working -> episodic
  - episodic -> semantic
  - episodic -> archive
  - superseded -> archive
- 强化 consolidate：
  - light
  - daily
  - deep
- recall 命中后做 reinforcement（如 retrievalCount / lastAccessedAt）

验收：
- stale/unused memory 能自动弱化或归档
- 高频有用 memory 留存更稳定
- 阶段性项目状态可被 supersede

## 5. 测试要求

至少新增/更新这些测试：
- session_end auto memory capture
- candidate acceptance / rejection
- project summary generation
- project-progress recall routing
- source separation / test-data filtering
- lifecycle migration / decay scoring
- supersede + archive path
- boot briefing non-empty integration path

如能做到，建议再补一条 host-level smoke：
- 真正模拟一段项目推进对话
- 验证 auto memory capture + subsequent recall + briefing effectiveness

## 6. 文档同步要求

实现完成后，必须同步更新：
- `README.md`
- `docs/evermemory-phase-roadmap.md`
- `docs/evermemory-v1-boundary.md`
- `docs/evermemory-capability-matrix.md`
- `docs/evermemory-troubleshooting.md`
- 其他被实现改动影响的 operator/install/runbook 文档

## 7. 交付形式

请按以下格式回收：

1. Executive summary
2. Changed files
3. Design notes
4. Test evidence
5. Real behavior delta（之前 vs 之后）
6. Remaining risk / non-goals

## 8. 非目标

本轮不追求：
- 全量外部 LLM 依赖化
- 花哨 UI
- 复杂 scheduler 平台化
- 把所有 wrapper 都注册成默认工具

本轮唯一重点：
**让 EverMemory 真的更连贯、更会记、也更会忘。**

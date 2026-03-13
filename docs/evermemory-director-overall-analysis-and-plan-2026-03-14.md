# EverMemory 总监级全局分析与整体规划（2026-03-14）

## 1. 项目结论

EverMemory 当前已经不是“概念验证”项目，而是一个已经完成：
- 核心记忆内核
- OpenClaw 插件集成
- 质量门禁
- 发布链路
- 运维文档

的可交付系统。

但它距离“OpenClaw 里最强大的记忆系统”还差最后一段关键路程，这段路程不在“继续堆功能”，而在：
- 连续性质量稳定领先
- 自动沉淀真实有效
- 长周期记忆可验证
- 规则治理足够稳
- 发布与回滚足够工程化

当前最准确的定位是：

> EverMemory 已完成从“可用记忆插件”到“可发布、可运维、可扩展记忆系统底座”的跃迁，下一阶段任务是把连续性、治理性和长期稳定性打磨成生态级领先能力。

## 2. 当前架构分析

### 2.1 架构分层

当前代码结构已经形成清晰的五层架构：

1. OpenClaw 插件适配层
   - 入口：`src/openclaw/plugin.ts`
   - 职责：接入 OpenClaw hook、注册工具、处理宿主上下文绑定

2. 核心业务层
   - `src/core/memory/*`
   - `src/core/briefing/*`
   - `src/core/intent/*`
   - `src/core/reflection/*`
   - `src/core/behavior/*`
   - `src/core/profile/*`
   - 职责：承载记忆、召回、意图、反思、规则、画像等业务逻辑

3. 检索与运行时层
   - `src/retrieval/*`
   - `src/hooks/*`
   - `src/runtime/*`
   - 职责：处理召回排序、会话级注入、会话上下文维护

4. 存储层
   - `src/storage/*`
   - SQLite + repository abstraction
   - 职责：数据持久化、迁移、聚合、调试事件

5. 工具与发布运维层
   - `src/tools/*`
   - `scripts/*`
   - `skills/*`
   - 职责：对外工具面、测试/质量门禁、安装与发布

### 2.2 架构优点

- 分层已经足够清晰，后续扩展不会先天失控。
- 核心逻辑与插件适配层分离，便于未来做多宿主适配。
- 存储与调试事件设计合理，具备可解释性与运维价值。
- 质量门禁已经工程化，不是手工验收型项目。
- 工具层与技能层都已打通，具备真正的生态分发能力。

### 2.3 架构短板

- 自动记忆沉淀仍偏启发式，尚未形成“高置信真实项目沉淀”闭环。
- 当前更擅长“有明确 query 的 recall”，还不够擅长“长期连续状态建模”。
- 规则系统有能力，但还缺少足够强的冲突治理压测和长期演化验证。
- semantic / intent enrich 仍属可选增强，没有形成默认强能力闭环。
- 当前没有后台作业或异步治理管线，很多治理动作仍依赖显式触发。

## 3. 当前功能分析

### 3.1 已经稳定成立的能力

- 确定性写入：`evermemory_store`
- 确定性召回：`evermemory_recall`
- 运行状态与调试：`evermemory_status`
- Briefing 构建：`evermemory_briefing`
- Intent 分析：`evermemory_intent`
- Reflection：`evermemory_reflect`
- Rules 读取/治理：`evermemory_rules`
- Profile 投影：`evermemory_profile`
- Consolidation：`evermemory_consolidate`
- Explainability：`evermemory_explain`
- Import/Export：`evermemory_import` / `evermemory_export`
- Archive Review/Restore：`evermemory_review` / `evermemory_restore`

### 3.2 当前最强的部分

- 工程治理质量高
  - 有 release gate
  - 有 OpenClaw smoke/security
  - 有 recall benchmark
  - 有 rollback procedure

- 插件落地能力强
  - npm 包已发布
  - ClawHub skill 已发布
  - OpenClaw 工具面已完整注册

- 检索质量已有竞争力
  - recall benchmark 达到 `0.9667`
  - 项目类 query 已有专门路由与排序优化

### 3.3 当前最弱的部分

- 自动沉淀的真实价值仍未稳定领先
- project summary 与 continuity briefing 的长期质量仍需产品化
- 记忆治理更像“强引擎”，还不是“默认优秀产品体验”
- 长周期记忆验证矩阵还不够强

## 4. 项目成熟度判断

### 4.1 当前成熟度

- 核心内核：8.5/10
- 插件化集成：8.5/10
- 可运维性：8.5/10
- 连续性体验：6.5/10
- 长期记忆产品化：6/10
- 生态领先度：7/10

### 4.2 结论

当前 EverMemory 在工程完成度上已经领先多数“记忆插件”，但在“真实长期连续体验”上还没有形成断层优势。

这意味着：
- 它已经是强工程项目
- 但尚未完全成为强产品

## 5. 核心问题定义

如果目标是“成为 OpenClaw 里最强大的记忆系统”，核心问题不是缺功能，而是以下 4 个问题：

1. 自动沉淀是否足够准
   - 能不能把真正有价值的信息留下，而不是把噪音写进库里

2. 连续性是否足够稳
   - 下次进入会话时，系统是否真的能给出高价值 continuity，而不是泛泛摘要

3. 治理是否足够强
   - 规则是否会过度增长、冲突、退化、污染召回

4. 长期表现是否可验证
   - 是否能证明跨 session、跨日、跨项目后仍保持稳定质量

## 6. 整体规划

### 6.1 总体策略

后续规划按三条主线推进：

1. 主线 A：连续性领先
   - 提升自动沉淀质量
   - 强化 project summary / next-step / decision continuity

2. 主线 B：治理领先
   - 强化 rule lifecycle、冲突治理、explainability、operator 审批能力

3. 主线 C：工程领先
   - 压缩 release 成本
   - 提升回归覆盖
   - 强化长周期验证与可观测性

### 6.2 规划阶段

#### Phase A：连续性产品化

目标：
- 让系统真正“记住项目”

重点：
- 自动沉淀策略强化
- project continuity summary 质量提升
- next-step / progress / decision / constraint 召回稳定性提升

验收指标：
- `projectRouteHitRate >= 0.85`
- `projectSummary.acceptRate >= 0.80`
- recall benchmark 稳定 `>= 0.96`

#### Phase B：治理产品化

目标：
- 让系统长期运行不失控

重点：
- 规则冲突检测与冻结/回滚压测
- import/export/review/restore 流程稳定化
- explainability 与 debug 指标统一

验收指标：
- rule mutation 路径全覆盖
- 无未解释的规则退化
- operator 可独立完成 review/rollback

#### Phase C：长期稳定性验证

目标：
- 证明不是“短跑好看”，而是“长跑稳定”

重点：
- 跨 session、跨天、跨项目连续性测试矩阵
- soak + security + continuity 合并进长期验证流水线

验收指标：
- 长周期回归套件进入 release gate
- 关键 KPI 连续多个版本不回退

## 7. 可执行任务拆分

### P0 任务

1. 自动沉淀策略强化
   - 目标：减少噪音写入，提高项目价值命中
   - 交付：策略规则、测试、KPI 观测

2. Project continuity summary 强化
   - 目标：提升项目状态、约束、决策、下一步的结构化摘要质量
   - 交付：summary builder 增强、回归测试、真实样本验证

3. 长周期 continuity 测试矩阵
   - 目标：让连续性不再只依赖短链路样本
   - 交付：跨 session / 跨日验证脚本与基线

### P1 任务

1. 规则冲突治理压测
2. explainability 输出标准化
3. 发布流水线提速与分层缓存
4. operator dashboard 最小视图（若后续需要）

### P2 任务

1. semantic sidecar 深化
2. intent enrich 默认化评估
3. 多宿主适配能力抽象

## 8. 风险判断

### 高风险

- 自动沉淀过强会带来噪音污染
- rule promotion 过快会导致行为偏移
- 过早追求 semantic/LLM 可能破坏 deterministic baseline

### 中风险

- 文档与实现再度失配
- 指标很多但没有形成统一决策口径
- 发布链路变复杂后维护成本上升

### 低风险

- 当前构架扩展性不足

这一项目前不是问题，现有架构足以支撑下一阶段。

## 9. 总监决策

### 9.1 当前判断

EverMemory 不应该再把主要精力投入“再加几个工具”。

真正应该做的是：
- 提升自动沉淀质量
- 提升 continuity 产品效果
- 提升长期运行稳定性

### 9.2 后续原则

- 先做连续性质量，再做能力外延
- 先保 deterministic baseline，再引入可选智能增强
- 先做真实可验证指标，再谈“生态最强”

## 10. 最终规划结论

从项目总监视角看，EverMemory 当前已经具备成为 OpenClaw 最强记忆系统的基础条件：
- 架构成立
- 功能成立
- 发布成立
- 治理成立

接下来决定上限的，不是“还能不能做”，而是“能不能把连续性和长期稳定性做到行业级证明”。

因此，项目的下一阶段总目标明确为：

> 把 EverMemory 从“最完整的记忆底座”推进为“连续性效果最强、治理最稳、发布最硬的 OpenClaw 记忆系统”。

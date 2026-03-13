# EverMemory 项目总监级全局规划（2026-03-13）

## 1. 文档定位

本文档是 EverMemory 在 **2026-03-13** 的项目总控规划，目标是统一以下三件事：

1. 基于代码事实给出当前真实基线（而非仅依据历史计划文档）。
2. 把“功能已实现”升级为“可持续运营、可稳定发布、可持续优化”。
3. 形成 3-6 个月可执行、可验收、可回滚的全局推进方案。

适用对象：
- 项目总监 / PM（进度、资源、风险总控）
- Tech Lead（架构边界、发布策略、质量门禁）
- Core Dev / QA / Ops（按工作流执行并交付证据）

---

## 2. 盘点依据（代码事实）

本规划基于仓库当前状态盘点（2026-03-13）：

- 代码规模：`src` 76 个 TypeScript 文件
- 测试规模：`test` 28 个 TypeScript 文件
- 文档规模：`docs` 60 份 Markdown 文档
- 工程脚本：`package.json` 中 34 个脚本
- OpenClaw 插件已注册工具：3 个（`evermemory_store` / `evermemory_recall` / `evermemory_status`）
- 主要自动化钩子：`session_start` / `before_agent_start` / `agent_end` / `session_end`

关键参考文档（同仓库）：
- `README.md`
- `docs/evermemory-v1-boundary.md`
- `docs/evermemory-capability-matrix.md`
- `docs/evermemory-project-status-and-delivery-plan-2026-03-13.md`
- `docs/evermemory-real-test-and-accuracy-report-2026-03-13.md`
- `docs/evermemory-continuity-decay-remediation-plan.md`

---

## 3. 当前状态诊断（As-Is）

## 3.1 已经具备的能力（可作为当前基线）

1. **稳定基线**
- SQLite 持久化 + 幂等迁移
- deterministic 写入策略（accept/reject 可解释）
- keyword recall + 加权排序
- OpenClaw 运行时 hook 接入
- 插件对外 `store/recall/status` 三工具

2. **已实现但非默认对外能力（库级）**
- intent、reflection、behavior rules、profile
- consolidate / explain / import / export / review / restore
- semantic sidecar（默认关闭）

3. **质量与运维基础**
- `check` / `test:unit` / `validate` / `quality:gate` / `quality:gate:openclaw`
- host hardening 与 security recover 脚本
- recall benchmark 与 soak/continuity 测试脚本

## 3.2 当前核心问题（To-Be 之前必须正视）

1. **连续性价值尚未稳定达标**
- 自动沉淀虽已实现，但“真实项目连续性收益”仍在调优期。

2. **工具暴露层与库能力层存在落差**
- 代码里能力丰富，但插件默认公开工具仍是三项，外部预期易失真。

3. **主机配置漂移风险仍在**
- OpenClaw 安全门禁依赖主机配置，流程未固化时容易反复。

4. **文档体系规模大、口径重复**
- 文档充足但分散，缺少单一“总控视图”作为跨团队执行锚点。

---

## 4. 全局目标（2026-03-13 至 2026-09-30）

## 4.1 北极星目标

把 EverMemory 从“可运行的记忆插件”推进为“可持续运营的项目记忆基础设施”。

## 4.2 目标拆解（OKR 风格）

### O1：连续性可用性达到稳定生产水位（2026 Q2）
- KR1：项目进展类问题召回准确率 >= 97%
- KR2：`next_step` 类召回准确率 >= 95%
- KR3：连续链路回归（continuity）周度通过率 >= 99%

### O2：记忆治理能力可解释、可回滚、可运维（2026 Q2）
- KR1：每次发布均附带质量证据包与回滚步骤
- KR2：security gate 失败后恢复流程全自动化，恢复成功率 100%
- KR3：debug/status 可直接读取关键 continuity/decay KPI

### O3：能力对外边界清晰、发布节奏稳定（2026 Q2-Q3）
- KR1：库能力与插件暴露能力的边界文档零冲突
- KR2：形成固定 release train（双周评审 + 月度冻结）
- KR3：新增公开工具按“灰度->门禁->文档->发布”流程落地

### O4：技术债可控，迭代效率持续提升（2026 Q3）
- KR1：核心链路回归耗时稳定在可接受范围（由 QA 周报跟踪）
- KR2：文档主索引收敛为单入口，重复描述显著降低
- KR3：关键工作流均有 owner、SLA、升级路径

---

## 5. 总体策略

## 5.1 战略原则

1. **先产品化收口，再扩功能面**  
优先把 continuity/decay 变成稳定默认能力，再考虑扩大插件公开工具面。

2. **先证据后结论**  
每个阶段必须有门禁结果、回归报告、运行证据，不以“感觉可用”作为发布依据。

3. **双层能力清晰表达**  
明确区分“库级已实现”和“插件已公开”，避免对外承诺超前。

4. **快慢路径分离**  
保证主链路低延迟，重逻辑与治理动作尽量后置或批处理。

## 5.2 明确不做（阶段内）

- 不引入外部向量数据库作为本阶段前置条件
- 不在当前周期做重 UI 平台化
- 不在没有治理门禁前扩大“自动自演化”范围

---

## 6. 3 阶段路线图（Now -> Q3）

## 阶段 A：发布收口与生产稳定化（2026-03-13 ~ 2026-04-10）

目标：把“已实现能力”收口为“可发布能力”。

交付：
1. 完成当前大改动分批提交（按 continuity / retrieval / docs / ops 分组）。
2. README、边界文档、能力矩阵、runbook 口径统一。
3. 固化 `security fail -> harden -> retest -> release gate` 流程。
4. 连续两轮完整门禁通过（含 `quality:gate:openclaw`）。

退出标准（DoD）：
- 发布候选分支无高优先级阻塞项
- 关键门禁稳定复现通过
- 操作手册可由非开发角色独立执行

## 阶段 B：连续性效果拉升与治理强化（2026-04-11 ~ 2026-06-15）

目标：把 continuity 从“可用”提升到“高命中、低噪声、可观测”。

交付：
1. 完成 `next_step` 漏召回专项优化。
2. decay 参数配置化与灰度策略落地。
3. KPI 看板化（auto capture、project summary、suppression、route hit）。
4. 建立 30~50 条真实样本持续评测集，形成周报。

退出标准（DoD）：
- 连续两周 recall 准确率达到目标线
- 关键 KPI 可通过 status/debug 直接读取
- 具备“一键回退到稳态参数”的操作路径

## 阶段 C：能力对外扩展与版本化运营（2026-06-16 ~ 2026-09-30）

目标：在不破坏稳定性的前提下，逐步扩大对外可用能力。

交付：
1. 评估并灰度开放 1-3 个高价值工具（建议顺序：`evermemory_briefing` -> `evermemory_explain` -> `evermemory_review`）。
2. 发布节奏固定化（评审节奏、冻结窗口、补丁策略）。
3. 完成文档收敛工程（总索引 + 生命周期管理）。
4. 输出 v0.1.x -> v0.2.x 的升级与兼容策略。

退出标准（DoD）：
- 每个新增公开工具都有回归、监控、回滚预案
- 发布手册和质量清单可覆盖扩展工具
- 版本升级路径可验证

---

## 7. 五大工作流规划（按 owner 执行）

## Workstream 1：Continuity Productization（Owner: Team-A）

范围：
- `sessionEnd` 自动沉淀策略
- project summary 生成质量
- briefing 构建质量与去重裁剪

关键动作：
1. 优化自动候选筛选规则，降低 test/noise 写入。
2. 按项目上下文强化 “状态/决策/约束/下一步” 四元信息。
3. 建立“自动沉淀命中 -> recall 命中 -> 实际有效”闭环指标。

验收：
- `project_summary` 生成与接受率稳定
- 连续链路测试周度稳定

## Workstream 2：Retrieval & Decay Governance（Owner: Team-B）

范围：
- recall route、candidate policy、suppression policy
- decay 评分、迁移、归档策略

关键动作：
1. 完成 `next_step` 漏召回专项修正。
2. decay 权重与阈值配置化（含灰度）。
3. 保持 recall 排序策略可解释（route reason + top score evidence）。

验收：
- benchmark 持续达标
- 噪声召回率下降且无明显漏召回回归

## Workstream 3：Plugin Exposure Strategy（Owner: Tech Lead）

范围：
- 库能力到插件公开能力的分阶段开放
- schema、兼容、SLA、文档一致性

关键动作：
1. 建立“公开工具准入门禁”：稳定性、可解释性、回滚性、文档完备性。
2. 每次只新增少量工具，先灰度后默认。
3. 保持 `v1 boundary` 文档同步更新。

验收：
- 公开能力与文档完全一致
- 没有“代码有但对外不可控”的能力误用

## Workstream 4：Quality/Security/Release Ops（Owner: Team-C + Ops）

范围：
- 质量门禁
- 安全硬化
- 发布与回滚演练

关键动作：
1. 固化预发布证据包模板（测试、门禁、风险、回滚）。
2. 建立安全漂移巡检频率与自动修复机制。
3. 建立每次发布后的 24h/72h 观察清单。

验收：
- 发布失败可快速回退
- 安全门禁故障处理流程固定可复现

## Workstream 5：文档治理与知识收敛（Owner: PMO/Team-C）

范围：
- 文档目录治理、索引治理、变更治理

关键动作：
1. 建立总索引与文档生命周期标签（active / reference / archived）。
2. 合并重复文档，保留权威来源。
3. 发布前执行“文档-实现一致性”核对清单。

验收：
- 核心信息一跳可达
- 无关键口径冲突

---

## 8. KPI 与观测体系

| 类别 | 指标 | 口径 | 目标 | 数据源 | 频率 | Owner |
|---|---|---|---|---|---|---|
| 连续性 | project_progress 命中率 | 样本评测命中 | >=97% | recall benchmark | 每周 | Team-B |
| 连续性 | next_step 命中率 | 样本评测命中 | >=95% | recall benchmark | 每周 | Team-B |
| 自动沉淀 | autoMemoryAccepted/Generated | 接受率 | 稳定上升，异常波动可解释 | debug `session_end_processed` | 每日 | Team-A |
| 项目摘要 | projectSummaryAccepted | 接受数量与比例 | 稳定 > 0 且高价值 | debug `session_end_processed` | 每日 | Team-A |
| 噪声治理 | suppressedTestCandidates | 抑制数量 | 与误召回趋势同步下降 | debug `retrieval_executed` | 每周 | Team-B |
| 质量 | 单测通过率 | `test:unit` 通过 | 100% | CI/本地门禁 | 每次提交 | QA |
| 发布 | OpenClaw 质量门禁通过率 | `quality:gate:openclaw` | 100% | 门禁日志 | 每次预发布 | Team-C |
| 安全 | 配置漂移恢复成功率 | drill/real recover | 100% | security drill 报告 | 双周 | Ops |

说明：
- 若连续两期 KPI 未达标，自动升级为阻塞项，进入发布否决清单。

---

## 9. 组织与治理机制（RACI）

| 工作域 | PM | Tech Lead | Team-A | Team-B | Team-C | QA | Ops |
|---|---|---|---|---|---|---|---|
| 路线与优先级 | A | C | I | I | I | I | I |
| 架构边界与工具开放 | C | A/R | C | C | C | I | I |
| 连续性产品化 | C | C | A/R | C | I | C | I |
| 召回与衰减治理 | C | C | C | A/R | I | C | I |
| 发布门禁与证据包 | A | C | C | C | R | R | C |
| 安全硬化与恢复 | I | C | I | I | C | C | A/R |
| 文档一致性收口 | A | C | I | I | R | C | I |

治理节奏：
1. 每日 15 分钟执行站会（阻塞项 + 当日门禁）
2. 每周一次质量例会（KPI、失败样本、风险升降级）
3. 每双周一次发布评审（Go/No-Go）
4. 每月一次架构/文档收敛评审

---

## 10. 风险矩阵与预案（项目总控视角）

| 风险 | 等级 | 触发信号 | 预防动作 | 应急动作 | Owner |
|---|---:|---|---|---|---|
| 连续性效果回退 | P0 | benchmark 下滑、真实反馈变差 | 样本集周更、灰度参数 | 回退到上一个稳定参数集 | Team-B |
| 自动沉淀噪声上升 | P0 | auto capture 激增但 recall 质量下降 | 强化 noise suppression | 关闭高风险自动规则、人工复核 | Team-A |
| 安全配置漂移 | P0 | security gate fail | 周期巡检 + hardening | 执行 recover 流程并冻结发布 | Ops |
| 文档与实现冲突 | P1 | 发布评审出现口径冲突 | 发布前一致性清单 | 以边界文档为准强制修正 | Team-C |
| 工具开放过快导致不稳定 | P1 | 新工具引入后故障增多 | 工具准入门禁 | 降级为库级能力、取消默认暴露 | Tech Lead |
| 代码批次过大影响评审 | P1 | PR 超大、回归定位困难 | 主题化提交策略 | 拆批并延期发布 | PM + Tech Lead |

---

## 11. 发布与变更管理策略

## 11.1 Release Train（建议）

1. **周节奏**
- 周一：风险确认 + 本周目标冻结
- 周三：中期门禁与样本质量复核
- 周五：候选构建 + 预发布门禁

2. **月节奏**
- 月中：小版本（功能与优化）
- 月末：稳定版（仅修复与收口）

3. **变更准入**
- 必须满足：测试通过 + 门禁通过 + 文档更新 + 回滚路径可执行

## 11.2 Go/No-Go 清单

必须同时满足：
1. `quality:gate`、`quality:gate:openclaw` 全通过
2. 核心 KPI 无连续两期下降
3. 回滚脚本/步骤已演练并可执行
4. 对外边界文档已同步

任一不满足即 No-Go。

---

## 12. 未来 30 天行动计划（2026-03-14 ~ 2026-04-12）

## Week 1（03-14 ~ 03-20）
- 完成当前工作树改动分批提交
- 同步 README + 边界文档 + runbook
- 完成一次完整预发布门禁与证据归档

## Week 2（03-21 ~ 03-27）
- 完成 `next_step` 漏召回专项修复
- 增加 continuity KPI 输出并接入 status/debug
- 运行 20~30 条真实样本复核并出报告

## Week 3（03-28 ~ 04-03）
- decay 参数灰度与回滚策略落地
- 完成安全漂移演练与流程固化
- 完成第二轮完整门禁

## Week 4（04-04 ~ 04-12）
- 执行 Go/No-Go 评审
- 若通过，发布稳定候选版本
- 形成阶段复盘（问题清单 + 下阶段优先级）

---

## 13. 成功判定（项目总监口径）

满足以下条件即可判定本轮全局规划执行成功：

1. EverMemory 对“项目连续性”形成稳定正反馈，不再依赖人工兜底。
2. 发布流程标准化，门禁、安全、回滚可重复执行。
3. 团队对“库能力 vs 插件公开能力”有统一认知并落实到文档和发布承诺。
4. KPI 与风险治理进入常态化节奏，项目从“阶段冲刺”切换到“可持续运营”。

---

## 14. 附：执行命令基线（建议保留）

- `npm run check`
- `npm run test:unit`
- `npm run validate`
- `npm run quality:gate`
- `npm run quality:gate:openclaw`
- `npm run test:recall:benchmark`
- `npm run test:openclaw:continuity`
- `npm run test:openclaw:soak`
- `npm run openclaw:security:drill`

本附录用于保证“规划可执行”，避免文档停留在抽象层。

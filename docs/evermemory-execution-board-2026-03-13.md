# EverMemory 执行看板（2026-03-13）

## 1. 看板规则

- 状态仅使用：`todo` / `in_progress` / `blocked` / `done`
- 每天至少更新一次
- 若 `blocked` 超过 1 天，必须写明升级路径

关联任务拆分文档：
- `docs/evermemory-next-task-breakdown-2026-03-13.md`

---

## 2. 看板

| ID | Team | 状态 | 负责人 | 截止 | 当前动作 | 阻塞/风险 |
|---|---|---|---|---|---|---|
| R0 | Cross | in_progress | PM+TechLead | D1 | 按 R0 批次文档执行拆分提交 | 工作树改动面较大 |
| A1 | Team-A | done | Team-A Lead | D3 | 连续记忆 3 连跑通过，自动沉淀链路稳定 | 无 |
| A2 | Team-A | todo | Team-A Lead | D5 | decay 参数配置化 | 依赖 A1 |
| A3 | Team-A | done | Team-A Lead | D6 | status/debug continuity KPI 已上线 | 无 |
| B1 | Team-B | done | Team-B Lead | D3 | 路由边界与误召回压测已覆盖并通过 | 无 |
| B2 | Team-B | done | Team-B Lead | D6 | 20 条样本评分脚本落地，准确率 95% | 仍有 1 条 next_step 待优化 |
| B3 | Team-B | in_progress | Team-B Lead | D6 | suppression 阈值复核与 next_step 漏召回分析 | 需结合 B2 样本结果微调 |
| C1 | Team-C | in_progress | Team-C Lead | D3 | 文档一致性收口 | 需跟随代码最终状态 |
| C2 | Team-C | done | Team-C Lead | D2 | 质量证据归档规范已落地 | 无 |
| C3 | Team-C | done | Team-C Lead | D5 | 安全漂移演练脚本与实战记录已完成 | 无 |
| C4 | Team-C | todo | Team-C Lead | D6 | 发布/回滚清单终版 | 依赖 C1/C2/C3 |
| G1 | Cross | in_progress | PM | D8 | 预发布全门禁已跑通，等待 C4 文档签署 | 依赖 B3/C4 收口 |
| G2 | Cross | todo | PM | D10 | 发布冻结 | 依赖 G1 |

---

## 3. 今日已完成（2026-03-13）

1. 召回质量评分脚本与样本集已落地：`test:recall:benchmark`（20 样本，95%）
2. 安全漂移恢复流程已固化并完成实战演练：`openclaw:security:drill`
3. 连续记忆真实链路 3 连跑通过：`test:openclaw:continuity` x3
4. 高强度真实回归完成：`test:openclaw:soak`（16/16）
5. Agent Teams 门禁通过：`teams:dev`、`teams:release`、`teams:status`

---

## 4. 明日第一优先级

1. 完成 `C4`：发布清单与回滚清单终版
2. 完成 `B3`：抑制阈值复核与 next_step 漏召回修正
3. 推进 `G1 -> G2`：预发布签署与冻结发布

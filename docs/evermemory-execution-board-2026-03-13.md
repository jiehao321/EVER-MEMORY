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
| R0 | Cross | done | PM+TechLead | D1 | 批次拆分方案与评审入口已固化（按 R0 执行） | 无 |
| A1 | Team-A | done | Team-A Lead | D3 | 连续记忆 3 连跑通过，自动沉淀链路稳定 | 无 |
| A2 | Team-A | todo | Team-A Lead | D5 | decay 参数配置化 | 依赖 A1 |
| A3 | Team-A | done | Team-A Lead | D6 | status/debug continuity KPI 已上线 | 无 |
| B1 | Team-B | done | Team-B Lead | D3 | 路由边界与误召回压测已覆盖并通过 | 无 |
| B2 | Team-B | done | Team-B Lead | D6 | 30 条样本评分脚本落地，准确率 96.67% | 无 |
| B3 | Team-B | done | Team-B Lead | D6 | 完成 next_step 路由与候选回退修复并通过 benchmark | 无 |
| C1 | Team-C | done | Team-C Lead | D3 | README/Runbook/Checklist/Boundary 口径收口完成 | 无 |
| C2 | Team-C | done | Team-C Lead | D2 | 质量证据归档规范已落地 | 无 |
| C3 | Team-C | done | Team-C Lead | D5 | 安全漂移演练脚本与实战记录已完成 | 无 |
| C4 | Team-C | done | Team-C Lead | D6 | 发布清单与回滚清单终版已完成 | 无 |
| G1 | Cross | done | PM | D8 | Agent Teams `status/dev/release` 全链路通过并留存证据 | 无 |
| G2 | Cross | done | PM | D10 | 发布冻结与签署完成（附证据路径） | 无 |

---

## 3. 今日已完成（2026-03-13）

1. 召回质量评分脚本与样本集已收口：`test:recall:benchmark`（30 样本，96.67%）
2. 安全漂移恢复流程已固化并完成实战演练：`openclaw:security:drill`
3. 连续记忆真实链路 3 连跑通过：`test:openclaw:continuity` x3
4. 高强度真实回归完成：`test:openclaw:soak`（16/16）
5. Agent Teams 门禁通过：`teams:dev`、`teams:release`、`teams:status`
6. Team-B next_step 专项修复已完成：`src/retrieval/service.ts`（路由信号收敛 + project-oriented 零候选回退）
7. 发布冻结前复核门禁再次通过：`teams:release`（最新证据已归档）

---

## 4. 明日第一优先级

1. 持续执行 `teams:release` 作为发布前最后门禁
2. 每次参数/路由调整后同步更新 benchmark 基线证据
3. 按批次推进代码评审与合并

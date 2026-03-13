# EverMemory 可执行任务包（项目总监版，2026-03-13）

## 1. 目标

在不扩大 scope 的前提下，完成 EverMemory 发布前收口，确保：

1. 连续性与召回质量稳定达标。
2. OpenClaw 运行门禁与安全门禁稳定通过。
3. 发布与回滚流程可单人按文档执行。

---

## 2. Agent Teams 启动结果（已执行）

已执行命令：

1. `npm run teams:status`
2. `npm run teams:dev`
3. `npm run teams:release`

本轮关键证据：

- `/tmp/evermemory-agent-teams-status-2026-03-13T14-54-46.543Z.json`
- `/tmp/evermemory-agent-teams-dev-2026-03-13T15-03-37.476Z.json`
- `/tmp/evermemory-agent-teams-release-2026-03-13T15-05-19.172Z.json`
- `/tmp/evermemory-quality-gate-2026-03-13T15-03-37.254Z.json`
- `/tmp/evermemory-quality-gate-2026-03-13T15-05-18.931Z.json`
- `/tmp/evermemory-recall-benchmark-2026-03-13T15-05-18.992Z.json`
- `/tmp/evermemory-openclaw-security-gate-2026-03-13T15-05-18.911Z.json`

当前门禁结论：

- `quality:gate`：PASS
- `quality:gate:openclaw`：PASS
- `recall-benchmark`：30 样本，29 通过，准确率 `0.9667`
- `openclaw-security-gate`：critical=0

---

## 3. 可执行任务清单（按团队）

| ID | Team | 优先级 | 状态 | 任务 | 验收命令 | DoD |
|---|---|---:|---|---|---|---|
| A2 | Team-A | P1 | todo | decay 参数配置化与说明 | `npm run test:unit` | 参数可配置、默认值和回滚值文档化 |
| A4 | Team-A | P1 | todo | continuity KPI 周报模板落地 | `npm run teams:dev` | KPI 字段固定，周报可复用 |
| B3 | Team-B | P0 | done | next_step 漏召回修复 | `npm run test:recall:benchmark` | 准确率 >= 0.9（当前 0.9667） |
| B4 | Team-B | P1 | in_progress | 英文 next-step 语义命中率提升（目标 >= 0.9） | `npm run test:recall:benchmark` | next_step 分类准确率持续 >= 0.9 |
| C1 | Team-C | P0 | done | README/矩阵/边界/runbook 口径统一 | `npm run teams:dev` | 文档无“库能力=插件默认能力”误导 |
| C4 | Team-C | P0 | done | 发布清单与回滚清单终版签署 | `npm run teams:release` | 清单可单人执行，回滚路径可演练 |
| G2 | Cross | P0 | done | 发布冻结与签署 | `npm run teams:release` | 门禁通过 + 签署记录 + 回滚点确认 |
| R0 | Cross | P0 | done | 按批次拆分提交进入评审 | `npm run check && npm run test:unit` | 批次计划固定，门禁通过后可直接进入评审 |

---

## 4. 严格把关规则（强制）

1. 任何合并前必须通过：
- `npm run teams:dev`

2. 任何发布前必须通过：
- `npm run teams:release`

3. 任一项失败即阻塞发布：
- 回归失败
- benchmark < 0.9
- security gate 出现 critical > 0

4. 发布文档缺失（`C4` 未完成）时，不允许进入最终冻结。

---

## 5. 每日执行节奏（总监监督）

1. 开工：`npm run teams:status`
2. 日内集成：`npm run teams:dev`
3. 日终收口：更新执行看板 + 记录证据路径
4. 预发布日：`npm run teams:release`

---

## 6. 当前结论

项目已完成“团队启动 + 全链路门禁恢复 + next_step 关键回归修复”。

下一关键动作：

1. 按 R0 批次执行评审和合并
2. 维持 `teams:release` 连续通过并按周更新证据

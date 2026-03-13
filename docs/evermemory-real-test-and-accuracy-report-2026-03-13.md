# EverMemory 真实测试与准确率报告（2026-03-13）

## 1. 结论

- 记忆系统可用性：**可用**
- 本轮召回准确率（B2 基准样本）：**95%（19/20）**
- 连续记忆链路稳定性（A1）：**3/3 连续通过**
- 高强度真实回归（soak）：**16/16 通过**
- 安全漂移恢复流程（C3）：**演练通过（检测 -> 硬化 -> 复测 -> release 门禁）**

---

## 2. 本轮执行命令与结果

1. `node ./scripts/recall-benchmark.mjs --update-baseline`
   - 结果：PASS
   - 报告：`/tmp/evermemory-recall-benchmark-2026-03-13T09-55-25.161Z.json`
   - baseline：`.openclaw/reports/recall-benchmark-baseline.json`
2. `npm run openclaw:security:drill`
   - 结果：PASS
   - 报告：`/tmp/evermemory-openclaw-security-recover-2026-03-13T09-37-45.237Z.json`
3. `npm run teams:dev`
   - 结果：PASS
   - 报告：`/tmp/evermemory-agent-teams-dev-2026-03-13T09-40-26.640Z.json`
4. `npm run test:openclaw:continuity`（连续 3 次）
   - 结果：3/3 PASS
5. `npm run test:openclaw:soak`
   - 结果：PASS（16/16）
   - 报告：`/tmp/evermemory-openclaw-soak-2026-03-13T09-53-24.409Z.json`
6. `npm run teams:status`
   - 结果：PASS
   - 报告：`/tmp/evermemory-agent-teams-status-2026-03-13T09-53-31.247Z.json`

---

## 3. 准确率细项（B2 基准）

样本总数：20  
通过：19  
失败：1  
准确率：0.95

分类结果：

- `project_progress`：5/5
- `current_stage`：5/5
- `next_step`：4/5
- `last_decision`：4/4
- `suppression_guard`：1/1

说明：
- 当前主要薄弱点在 `next_step`（1 条样本未命中）。
- 该问题已进入下一轮 B3/C4 联合优化项（路由阈值与发布清单收口）。

---

## 4. 可用性判断依据

满足以下关键门槛：

1. 连续记忆脚本中 `autoMemoryEvents > 0` 且 `memoryCount > 0`
2. 真实 OpenClaw 回归（smoke + continuity + security）全通过
3. Agent Teams dev/release 门禁通过
4. 质量证据已归档，可追溯到具体 JSON 报告路径

因此当前可判定：
- “记忆系统不可用”结论不成立
- 当前更准确表述是“**可用且稳定，准确率高位（95%），仍有小幅优化空间**”

---

## 5. 风险与后续

- 风险：`next_step` 类别仍有小概率漏召回（当前样本中 1/5）
- 后续动作：
  1. 在 B3 中复核 test suppression 与路由阈值
  2. 在 C4 中固化发布/回滚终版清单
  3. 完成 G1 预发布签署

# EverMemory Codex 执行手册

## 1. 文档目的

本文档用于指导后续如何把 EverMemory 的规划文档交给 Codex 实现。

目标不是告诉 Codex“自由发挥”，
而是让 Codex：
- 严格按 phase / batch 执行
- 不乱扩范围
- 不跳步
- 不把规划文档里的边界搞乱

---

## 2. Codex 在本项目中的角色

Codex 的职责是：
- 阅读指定规划文档
- 按指定 batch 实现
- 自查 check/build/test
- 产出阶段汇报
- 停下等待审核

Codex **不是**：
- 项目经理
- 范围决策者
- 产品方向决定者
- 自己给自己扩 scope 的人

---

## 3. 每次发给 Codex 的最小上下文

每次派发任务时，至少要给 Codex：

1. 项目路径
2. 必读文档清单
3. 当前 batch 编号
4. scope in
5. scope out
6. 交付要求
7. 验证要求
8. 阶段汇报要求

---

## 4. 建议固定提示模板

可直接复用下面模板：

```text
你现在负责 EverMemory 项目中的一个指定 batch。

项目路径：
/root/.openclaw/workspace/projects/evermemory

必读文档：
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-master-plan.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-phase-roadmap.md
- /root/.openclaw/workspace/projects/evermemory/docs/evermemory-task-planning-principles.md
- <当前 batch 对应文档>

你本轮只做：<Batch 名称>

Scope in:
- ...

Scope out:
- ...

要求：
1. 严格按 batch 边界实现
2. 不要顺手扩到后续 phase
3. 优先复用已有 service / repo / runtime helpers
4. 保持 deterministic、可解释、可测试
5. 完成后运行：npm run check && npm run build && npm run test && npm run validate
6. 完成后第一时间给出阶段汇报
7. 然后暂停，等待审核
```

---

## 5. 阶段汇报格式要求

建议要求 Codex 每轮汇报都至少包含：

1. 本阶段完成内容
2. 新增/修改文件
3. 调用链路或关键实现说明
4. 验证结果
5. 当前风险
6. 下一步建议

如果缺这些，汇报不算合格。

---

## 6. 什么时候可以直接继续下一批

只有在以下条件同时满足时，才建议继续下一批：

1. 当前 batch 目标已命中
2. 没有明显 scope 漂移
3. `check/build/test` 已通过
4. 当前风险没有变成阻塞
5. 下一批边界已经清楚

否则应该先停下来修整。

---

## 7. 哪些情况必须打断 Codex

遇到这些情况应立即打断或回退：

1. 开始做未批准的 phase 内容
2. 大规模重构但没有必要
3. 修改公共 contract 却没说明影响
4. check/build/test 不通过还强行往下走
5. 开始用 LLM 黑箱掩盖本应 deterministic 的边界
6. 在关键路径引入明显重逻辑

---

## 8. 批次设计建议

后续对 Codex 的批次设计，建议遵循：

- 一个 batch 一个最小闭环
- 每批可独立审查
- 每批尽量能通过 check/build/test
- 每批结束后项目处于可交接状态

推荐大小：
- 3~8 个文件核心变更
- 1~3 个关键接口变化
- 1 组最小测试补强

---

## 9. 文档使用顺序建议

当 Codex 开始实现前，建议阅读顺序：

1. `evermemory-master-plan.md`
2. `evermemory-phase-roadmap.md`
3. `evermemory-task-planning-principles.md`
4. 当前 batch 对应任务文档
5. `PHASE1_COMPLETION_SUMMARY.md`

这样可以保证：
- 先理解全局
- 再理解阶段
- 再理解任务
- 最后看现状

---

## 10. 执行纪律总结

EverMemory 项目对 Codex 的核心要求只有四条：

1. **不要乱扩范围**
2. **不要跳步**
3. **不要把本来该解释清楚的东西糊成黑箱**
4. **不要做完了不汇报**

如果这四条守住，项目就会稳。

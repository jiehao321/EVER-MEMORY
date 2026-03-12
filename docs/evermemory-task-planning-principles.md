# EverMemory 任务规划原则

## 1. 文档目标

本文档定义后续所有任务拆分时必须遵守的 planning rules。

它不是功能说明书，而是“如何拆任务、如何安排顺序、如何避免乱做”的方法规则。

---

## 2. 总原则

### 2.1 一批只做一个闭环
每一批任务都必须尽量聚焦一个最小闭环。

错误例子：
- 一批里同时做 intent + reflection + behavior promotion

正确例子：
- 先做 intent schema + service + tool + message_received minimal wiring

### 2.2 先收紧边界，再开始实现
每个 batch 都要先明确：
- 做什么
- 不做什么
- 为什么现在做
- 做完后项目状态多了什么能力

### 2.3 文件级拆分优于概念级空话
任务拆分必须尽量落到：
- 新增什么文件
- 修改什么文件
- 每个文件做什么
- 接口如何变化
- 测试怎么补

### 2.4 小步、可验证、可中断
每个 batch 都应做到：
- 中途可以停
- 停下时状态仍然整洁
- check/build/test 能给出确定反馈

### 2.5 关键路径优先受保护
任何任务都不能把：
- deep retrieval
- reflection
- profile recompute
- archive/summarize

无脑塞进 critical path。

---

## 3. 什么样的 task 算合格

一个合格 task 至少应包含：

1. **Objective**
2. **Scope In**
3. **Scope Out**
4. **Files to add/change**
5. **Interfaces / contracts**
6. **Validation**
7. **Definition of Done**
8. **Risks / notes**

如果缺这些，就不算足够细。

---

## 4. 任务粒度控制

## 4.1 太大不行
例如：
- “把 reflection 做完”

这种太大，容易失控。

## 4.2 太碎也不行
例如：
- “写一个 type”
- “补一个 export”

这种太碎，管理成本高。

## 4.3 推荐粒度
推荐一个 batch 覆盖：
- 一个最小业务能力闭环
- 或一个稳定基础能力的最小可验证收口

比如：
- intent schema + service + tool + minimal hook integration
- experience log schema + repo + service + session_end minimal integration

---

## 5. 任务优先级判断规则

后续任务优先级按以下顺序判断：

1. **是否解锁后续阶段**
2. **是否保护关键路径稳定性**
3. **是否减少架构不确定性**
4. **是否提高 explainability / inspectability**
5. **是否只是锦上添花**

只属于第 5 类的，不应抢前面优先级。

---

## 6. 任务类型分类

建议后续 task 按类型标记：

- `FOUNDATION`
- `INTEGRATION`
- `QUALITY`
- `EXPLAINABILITY`
- `OPTIMIZATION`
- `EXPERIMENTAL`

其中：
- FOUNDATION / INTEGRATION / QUALITY 优先
- OPTIMIZATION 次之
- EXPERIMENTAL 最后

---

## 7. 每批任务的标准输出格式

建议每批任务文档都按以下格式写：

```md
# Batch X - Name

## Objective
...

## Why now
...

## Scope in
- ...

## Scope out
- ...

## Files to add
- ...

## Files to change
- ...

## Interfaces / contracts
- ...

## Validation
- npm run check
- npm run build
- npm run test

## Definition of Done
- ...

## Risks
- ...
```

这样后续交给 Codex 时，执行会更稳。

---

## 8. 不允许的坏味道

后续拆任务时，必须避免这些坏味道：

1. **scope 漂移**
   - 名义上做 intent，实际顺手做 reflection

2. **抽象过度**
   - 先写很多未来也许会用的框架

3. **测试债务滚大**
   - 一直说后面再补测试

4. **接口不稳定**
   - tool / service / runtime contract 每轮都在乱变

5. **把“智能”当成免设计借口**
   - 用 LLM 糊掉本应清晰的边界

---

## 9. 最终原则总结

EverMemory 的任务规划必须服务于一个核心目标：

**让项目在每一步都更清晰、更稳定、更可交付，而不是更复杂。**

因此：
- 先闭环
- 再增强
- 先稳
- 再聪明
- 先可解释
- 再高级

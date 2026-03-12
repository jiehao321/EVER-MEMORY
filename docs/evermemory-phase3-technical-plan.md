# EverMemory Phase 3 详细技术方案

## 1. 文档定位

本文档定义 EverMemory Phase 3（Reflection）的详细技术方案。

Phase 3 的目标不是直接让系统“学会改变自己”，
而是先让系统具备：
- 记录 interaction outcome
- 提炼 structured reflections
- 从重复纠正/成功/失败中生成 candidate lessons
- 为后续 behavior evolution 提供 evidence-backed 输入

换句话说：

**Phase 3 做的是“反思基础设施”，不是“行为自动演化系统”。**

---

## 2. 为什么 Phase 3 排在 Phase 2 之后

Reflection 不能建立在没有 understanding 的系统上。

如果系统还不能结构化理解：
- 当前消息是什么类型
- 用户是否在纠正
- 当前 interaction 是否需要 memory
- 当前 action 是成功还是失败

那么 reflection 就容易变成：
- 无结构日志
- 低质量 lesson
- 黑箱总结
- 错误 candidate rules

所以顺序必须是：
- Phase 1：memory substrate
- Phase 2：understanding
- **Phase 3：reflection**
- Phase 4：behavior evolution

---

## 3. Phase 3 核心目标

Phase 3 需要建立四个能力：

1. **Experience Logging**
   - 把 interaction outcome 记录成结构化 experience log

2. **Reflection Records**
   - 把 correction / success / failure / repeated pattern 变成 reflection records

3. **Candidate Lessons / Rules**
   - 从 reflection records 中生成 candidate lessons 或 candidate rules
   - 但先不激活 behavior rules

4. **Reviewable Outputs**
   - 所有 reflection 输出都必须可解释、可审查、可 debug

---

## 4. Phase 3 范围定义

## 4.1 Scope In

Phase 3 应包含：
- experience log schema + repo
- reflection record schema + repo
- experience logging service
- reflection service
- correction / success / failure triggers
- session_end minimal reflection integration
- optional heartbeat/manual reflection path
- candidate lessons
- candidate rules（候选态）
- reflect tool
- reflection debug events
- 最小测试
- README / docs 补充

## 4.2 Scope Out

Phase 3 不应包含：
- active behavior rules
- rule promotion to runtime
- profile recompute
- archive / summarize / semantic retrieval 大改
- multi-step autonomous self-improvement
- operator UI

---

## 5. 数据模型设计

## 5.1 ExperienceLog

建议最小结构：

```ts
interface ExperienceLog {
  id: string;
  sessionId?: string;
  messageId?: string;
  createdAt: string;
  inputSummary: string;
  actionSummary: string;
  outcomeSummary?: string;
  indicators: {
    userCorrection: boolean;
    userApproval: boolean;
    hesitation: boolean;
    externalActionRisk: boolean;
    repeatMistakeSignal: boolean;
  };
  evidenceRefs: string[];
}
```

### 作用
- 记录一次 interaction 的 outcome
- 为 reflection 提供结构化输入
- 为后续 behavior promotion 提供 evidence base

## 5.2 ReflectionRecord

建议最小结构：

```ts
interface ReflectionRecord {
  id: string;
  createdAt: string;
  trigger: {
    kind: 'correction' | 'mistake' | 'success' | 'repeat-pattern' | 'manual-review';
    experienceIds: string[];
  };
  analysis: {
    category: string;
    summary: string;
    whatWorked?: string;
    whatFailed?: string;
    nextTimeRecommendation?: string;
  };
  evidence: {
    refs: string[];
    confidence: number;
    recurrenceCount: number;
  };
  candidateRules: string[];
  state: {
    promoted: boolean;
    rejected: boolean;
    reviewedAt?: string;
  };
}
```

### 作用
- 结构化表达一次反思结论
- 把 lesson 和 evidence 放在一起
- 保持“建议层”地位，不直接控制 runtime

---

## 6. 存储层设计

## 6.1 新增表

Phase 3 建议新增：
- `experience_logs`
- `reflection_records`

## 6.2 Repo 设计

### experienceRepo
最小方法：
- `insert(log)`
- `findById(id)`
- `listRecentBySession(sessionId, limit)`
- `search(filters)`（可后置）

### reflectionRepo
最小方法：
- `insert(record)`
- `findById(id)`
- `listRecent(limit)`
- `listByTriggerKind(kind, limit)`

不要在 Phase 3 把 repo 扩成 analytics 平台。

---

## 7. Experience Logging 设计

## 7.1 何时记录 experience

建议在这些节点记录 experience：

1. **session_end**
   - 最自然的最小闭环入口

2. **明确用户纠正**
   - 如果 correction signal 高，可单独触发

3. **高风险动作反馈**
   - 如果未来 action path 增强，可在风险场景记 experience

Phase 3 第一版建议优先：
- `session_end`
- manual reflect tool path

这样可先把复杂度控制住。

## 7.2 记录内容

Experience log 不应保存完整巨量 transcript，
而应保存：
- inputSummary
- actionSummary
- outcomeSummary
- correction/approval flags
- evidence refs

这样既轻量，也更适合作为 reflection 输入。

---

## 8. Reflection Service 设计

## 8.1 核心职责

ReflectionService 负责：
1. 输入一组 experiences
2. 判断 trigger kind
3. 提炼 structured analysis
4. 输出 ReflectionRecord
5. 生成 candidate rules（候选）
6. 写 repo + debug events

## 8.2 触发类型

建议支持：
- `correction`
- `mistake`
- `success`
- `repeat-pattern`
- `manual-review`

## 8.3 输出要求

Reflection output 必须：
- 窄
- 清楚
- 可复用
- 不要写成空泛鸡汤

坏例子：
- “以后更聪明一点”

好例子：
- “对于高风险外部动作，如果用户没有明确要求直接执行，应先确认再做。”

---

## 9. Candidate Rule 设计

## 9.1 Phase 3 只生成 candidate，不激活

这是最重要的边界之一。

Phase 3 可以：
- 生成 candidate rule statements
- 记录 evidence/confidence/recurrence

Phase 3 不能：
- 直接把 candidate 变成 active runtime rule

## 9.2 Candidate Rule 质量要求

candidate rule 应满足：
- action-oriented
- reusable
- narrow enough
- evidence-backed
- 可 future promotion

---

## 10. Hook Integration 设计

## 10.1 session_end 最小接线

推荐链路：

```text
onSessionEnd(ctx)
  -> gather minimal interaction summary
  -> experienceService.create(...)
  -> if trigger threshold met:
       reflectionService.reflect(...)
  -> debugRepo.log(...)
```

## 10.2 不应在 session_end 做的事
- 不直接 promote rules
- 不重算 profile
- 不做复杂 archive/summarize jobs

---

## 11. Tool 设计：evermemory_reflect

## 11.1 目标

提供显式入口，让 operator / developer / reviewer 能手动触发 reflection。

## 11.2 输入

```ts
{
  sessionId?: string;
  mode?: 'light' | 'full';
}
```

## 11.3 输出

返回：
- reflection records
- candidate rules
- minimal summary

## 11.4 作用
- 调试 reflection 质量
- 对单 session 做手动 review
- 未来可作为 promotion 前 review 输入

---

## 12. Debug Events 设计

Phase 3 至少新增：
- `experience_logged`
- `reflection_created`
- `candidate_rule_generated`
- `reflection_skipped`

payload 要做到：
- concise
- 能回答“为什么产生了这条 reflection”

---

## 13. 测试策略

## 13.1 experience.test.ts
覆盖：
- experience log 结构合法
- correction / approval flags 写入正确

## 13.2 reflection.test.ts
覆盖：
- manual-review trigger 可生成 reflection
- correction trigger 可生成 candidate lesson/rule
- 空/弱 evidence 时 reflection 可被跳过或降级

## 13.3 session-end.test.ts
覆盖：
- session_end 路径可写 experience
- threshold 满足时可生成 reflection

---

## 14. 风险

### 风险 1：reflection 过早生成过多低质量结论
控制：
- threshold gating
- manual-review path first
- candidate only，不直接激活

### 风险 2：experience logs 太像全文转储
控制：
- 只保留 summary + evidence refs

### 风险 3：Phase 3 越界到 behavior evolution
控制：
- 明确禁止 active rule promotion

---

## 15. 完成定义

当以下条件满足时，Phase 3 可视为完成：

1. experience logs 可稳定写入
2. reflection records 可生成
3. correction / manual-review 至少有一条闭环跑通
4. candidate rules 可作为结构化输出存在
5. evermemory_reflect tool 可用
6. check/build/test 通过
7. 输出可解释、可 debug

---

## 16. 结论

Phase 3 的任务不是“让系统变聪明”，
而是：

**让系统开始有可治理的反思能力。**

这是后续 behavior evolution 唯一可靠的输入层。

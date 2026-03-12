# EverMemory Phase 2 详细技术方案

## 1. 文档定位

本文档是 EverMemory Phase 2 的详细技术方案文档。

目标不是重复总规划，而是把 **Phase 2：Understanding** 具体落到：
- 做什么
- 为什么现在做
- 要新增哪些模块
- 哪些文件该新增/修改
- 数据如何流动
- 哪些点必须保持轻量和可解释

它的目标读者是：
- 项目负责人
- 实现代理（Codex）
- 未来维护者

---

## 2. Phase 2 的目标

Phase 2 的核心目标只有一句话：

**让 EverMemory 从“被动 memory substrate”升级为“能理解当前输入是否需要 memory、需要哪类 memory、如何最小干预 runtime 的系统”。**

具体来说，Phase 2 要让系统获得以下能力：

1. 在消息进入时，输出结构化 `IntentRecord`
2. 判断当前消息的 `memoryNeed`
3. 生成最小 `retrievalHints`
4. 在需要时做 `targeted recall`
5. 把 recall 结果注入 runtime context
6. 提供一个可直接检查 intent 输出的工具接口
7. 保持 critical path 轻量，不把 Phase 2 做成慢系统

---

## 3. 为什么 Phase 2 现在做

当前 Phase 1 已经解决：
- 会存
- 会查
- 会启动 continuity
- 会通过 tools 显式使用 memory

但还没有解决两个关键问题：

### 3.1 系统不知道“什么时候该用 memory”
现在 recall 仍主要依赖：
- 显式工具调用
- 明确的 manual path

缺少：
- runtime-level message understanding
- 是否需要 recall 的判断

### 3.2 系统不知道“应该召回哪类 memory”
即使后续 message_received 接进来，
如果没有 intent-guided retrieval，就容易：
- recall 太多
- recall 错类型
- recall 错 scope
- recall 过深，拖慢关键路径

所以 Phase 2 的本质，是为后续所有智能层打底：

- Understanding 先行
- Reflection 才有意义
- Behavior evolution 才有依据

---

## 4. Phase 2 的设计原则

## 4.1 fast path 和 full analysis 分离

Phase 2 绝不能把“完整智能理解”无脑塞进关键路径。

### fast path 只允许做：
- scope resolve
- heuristic intent precheck
- correction / urgency / memoryNeed 粗判断
- retrieval strategy selection
- targeted recall（如确有必要）

### full analysis 可以做：
- richer subtype
- entities
- emotional nuance
- stronger retrieval hints
- structured LLM intent enrich

但 full analysis 必须是：
- 条件触发
- 可降级
- 可延后

---

## 4.2 heuristic first, LLM optional

Phase 2 不应一上来就依赖 LLM 解释一切。

推荐顺序：
1. obvious cases → heuristics
2. only when needed → LLM structured JSON
3. parser failure → fallback to heuristics

这样才能：
- 稳
- 可解释
- 可控成本
- 保护延迟

---

## 4.3 intent 是结构化信号，不是最终答案

Intent service 的目标不是生成回复，
而是输出可供下游使用的结构化信号：
- intentType
- subtype
- urgency
- actionNeed
- memoryNeed
- correctionSignal
- preferenceRelevance
- retrievalHints

---

## 5. Phase 2 范围定义

## 5.1 Scope In

Phase 2 应包含：
- intent schema
- intent repository
- intent service
- heuristic precheck
- optional LLM structured enrich path
- parser / validation / fallback
- message_received 最小接线
- intent-guided targeted recall
- runtime interaction context updates
- `evermemory_intent` tool
- intent / interaction debug events
- 最小测试补强
- README / operator notes 补充 Phase 2 说明

## 5.2 Scope Out

Phase 2 不应进入：
- reflection records
- experience logs
- candidate behavior rules
- behavior rule promotion
- profile recompute
- semantic embeddings / hybrid retrieval 大改
- archive / summarize jobs
- complex async orchestration
- UI / operator dashboard

---

## 6. Phase 2 新增能力概览

建议新增以下核心能力对象：

1. `IntentRecord`
2. `IntentAnalysisRequest`
3. `IntentAnalysisResult`
4. `InteractionRuntimeContext`
5. `RecallForIntentRequest`

---

## 7. 推荐文件结构变化

## 7.1 新增文件

建议新增：

- `src/core/intent/service.ts`
- `src/core/intent/heuristics.ts`
- `src/core/intent/parser.ts`
- `src/core/intent/prompt.ts`（如果启用 LLM enrich）
- `src/storage/intentRepo.ts`
- `src/hooks/messageReceived.ts`
- `src/tools/intent.ts`
- `test/intent.test.ts`
- `test/message-received.test.ts`

## 7.2 需要修改的文件

建议修改：
- `src/types.ts`
- `src/storage/migrations.ts`
- `src/index.ts`
- `src/runtime/context.ts`
- `src/retrieval/service.ts`
- `src/tools/index.ts`
- `README.md`

---

## 8. 数据模型设计

## 8.1 IntentRecord

建议至少包含：

```ts
interface IntentRecord {
  id: string;
  sessionId?: string;
  messageId?: string;
  createdAt: string;
  rawText: string;
  intent: {
    type: string;
    subtype?: string;
    confidence: number;
  };
  signals: {
    urgency: 'low' | 'medium' | 'high';
    emotionalTone: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'excited';
    actionNeed: 'none' | 'analysis' | 'answer' | 'execution' | 'confirmation';
    memoryNeed: 'none' | 'light' | 'targeted' | 'deep';
    preferenceRelevance: number;
    correctionSignal: number;
  };
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  retrievalHints: {
    preferredTypes: string[];
    preferredScopes: string[];
    preferredTimeBias: 'recent' | 'balanced' | 'durable';
  };
}
```

## 8.2 Runtime interaction context

建议在 runtime context 中新增 interaction-level state：

```ts
interface InteractionRuntimeContext {
  sessionId: string;
  intent?: IntentRecord;
  recalledItems?: MemoryItem[];
  updatedAt: string;
}
```

---

## 9. 存储层设计

## 9.1 新增 intent_records 表

建议 migration 新增：

- `intent_records`

最小字段：
- id
- session_id
- message_id
- created_at
- raw_text
- intent_type
- intent_subtype
- intent_confidence
- urgency
- emotional_tone
- action_need
- memory_need
- preference_relevance
- correction_signal
- entities_json
- retrieval_hints_json

## 9.2 intentRepo 职责

建议最小方法：
- `insert(intent: IntentRecord)`
- `findById(id: string)`
- `listRecentBySession(sessionId: string, limit: number)`

不要在 Phase 2 提前把 repo 做成过大的 analytics repo。

---

## 10. Intent Service 设计

## 10.1 核心职责

IntentService 负责：
1. 接收当前 message text + optional context
2. 跑 heuristic precheck
3. 根据配置决定是否做 LLM enrich
4. 合并结果并输出合法 IntentRecord
5. 写 debug / repo

## 10.2 分两层输出

### precheck output
快速回答：
- isCorrection?
- memoryNeed?
- likely intentType?
- likely preferredTypes?

### full analysis output
更完整输出：
- subtype
- emotionalTone
- entities
- richer retrievalHints

## 10.3 Heuristic precheck 规则建议

至少先支持这些 obvious patterns：

### correction
命中词：
- 不是这个意思
- 你又
- 不对
- 改一下
- 以后不要
- 先别
- 先不要

### memory request
命中词：
- 记住
- 记一下
- 你还记得
- 我之前说过
- 你记不记得

### execution
命中词：
- 去做
- 帮我做
- 开始
- 继续推进
- 执行

### planning/design
命中词：
- 规划
- 方案
- 设计
- 拆分 task
- 路线图

### urgency
命中词：
- 立刻
- 马上
- 赶紧
- 现在

这些 precheck 必须 deterministic。

---

## 11. LLM enrich 设计

## 11.1 使用条件

只有在：
- config enabled
- precheck 判断需要 richer analysis
- 或 message complexity 高

才调用 LLM。

## 11.2 输出要求

必须要求 LLM 输出严格 JSON，字段受 schema 限制。

## 11.3 fallback

如果：
- JSON 解析失败
- schema 不通过
- confidence 无效

则回退到 heuristic result，不能阻塞主流程。

---

## 12. message_received 最小接线

## 12.1 Phase 2 的 message_received 只做最小闭环

它不应承担过多逻辑。

### 推荐链路
```text
onMessageReceived(ctx)
  -> build scope
  -> intentService.analyze(message)
  -> persist intentRecord
  -> if memoryNeed != none:
       retrievalService.recallForIntent(...)
  -> write runtime interaction context
  -> debugRepo.log('interaction_processed', ...)
```

## 12.2 不要在这个 batch 做的事
- 不在这里做 reflection
- 不在这里做 candidate rules
- 不在这里做 profile recompute
- 不在这里做 archive jobs

---

## 13. RetrievalService 在 Phase 2 的变化

## 13.1 建议增加 recallForIntent

新增接口类似：

```ts
recallForIntent(intent: IntentRecord, scope: MemoryScope, opts?): Promise<RecallResult>
```

## 13.2 recall strategy 建议

### memoryNeed = none
- 不 recall

### memoryNeed = light
- 只查 constraint / identity / preference
- limit 小

### memoryNeed = targeted
- 按 `preferredTypes` 定向 recall

### memoryNeed = deep
- Phase 2 仍保持克制
- 可以扩大 top-k，但仍以 keyword + structured baseline 为主

---

## 14. Tool 设计：evermemory_intent

## 14.1 目标

提供一个显式入口，让 operator / developer 能直接看到 intent output。

## 14.2 输入

```ts
{
  message: string;
  sessionId?: string;
  chatId?: string;
  userId?: string;
  context?: string;
}
```

## 14.3 输出

直接返回结构化 IntentRecord，或轻微包装版。

## 14.4 作用
- 调试理解层
- 验证 heuristic / LLM enrich 输出
- 后续 regression 测试更方便

---

## 15. Debug Events 设计

Phase 2 至少新增：
- `intent_generated`
- `interaction_processed`
- `intent_recall_skipped`
- `intent_recall_executed`

payload 要做到：
- concise
- 可解释
- 不过量冗余

---

## 16. 测试策略

## 16.1 intent.test.ts

至少覆盖：
- correction phrase → correctionSignal 高
- planning phrase → ask_design / planning 类 intent
- memory phrase → memoryNeed != none
- invalid LLM JSON → fallback to heuristics

## 16.2 message-received.test.ts

至少覆盖：
- memoryNeed = none → 不 recall
- memoryNeed = targeted → recallForIntent 被调用
- runtime context 写入 intent + recalledItems
- interaction_processed debug event 被记录

## 16.3 回归要求

原有 Phase 1：
- check/build/test
- Phase 1 关键路径

不能被破坏。

---

## 17. 已知风险

### 风险 1：intent schema 过早过大
控制：
- Phase 2 只保留真正会被 runtime 用到的字段

### 风险 2：message_received 被做得太重
控制：
- 只做最小闭环，不带 reflection / profile / archive

### 风险 3：过度依赖 LLM
控制：
- heuristic first
- LLM optional
- strict fallback

### 风险 4：召回噪音上升
控制：
- scope strict
- preferredTypes
- capped limit

---

## 18. Phase 2 完成定义

当以下条件成立时，可认为 Phase 2 完成：

1. 系统可生成结构化 IntentRecord
2. 可稳定判断 memoryNeed
3. 可按 intent hints 做 targeted recall
4. message_received 路径跑通
5. evermemory_intent tool 可用
6. intent / interaction debug events 可检查
7. 所有新增路径 check/build/test 通过
8. fast path 未明显被拖慢

---

## 19. 结论

Phase 2 不该被做成“又一个大而全智能层”。

它真正要完成的是：

**把 EverMemory 从“有 memory 能力”推进到“知道什么时候该用 memory、该用哪类 memory”的状态。**

这一步做稳了，后面的 Reflection 和 Behavior Evolution 才有坚实基础。

# EverMemory API Reference

## Tools

EverMemory currently exports 16 tool functions from `src/tools/index.ts`.

- TypeScript SDK names use camelCase, for example `evermemoryStore`.
- OpenClaw registered tool names use snake_case, for example `evermemory_store`.
- `evermemorySmartness` is exported by the SDK but is not currently registered in `src/openclaw/tools/`.

### evermemoryStore
OpenClaw: `evermemory_store` (`memory_store`)

存储记忆项。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 记忆内容。 |
| type | `MemoryType` | 否 | 记忆类型：`identity` `fact` `preference` `decision` `commitment` `relationship` `task` `project` `style` `summary` `constraint`。 |
| lifecycle | `MemoryLifecycle` | 否 | 生命周期：`working` `episodic` `semantic` `archive`。 |
| scope | `MemoryScope` | 否 | 作用域：`{ userId?, chatId?, project?, global? }`。 |
| source | `MemorySource` | 否 | 写入来源：`{ kind, actor?, sessionId?, messageId?, channel? }`。默认 `{ kind: "tool", actor: "system" }`。 |
| tags | string[] | 否 | 标签。 |
| relatedEntities | string[] | 否 | 关联实体 ID。 |

**返回值**: `EverMemoryStoreToolResult`

```ts
{
  accepted: boolean;
  reason: string;
  memory: MemoryItem | null;
}
```

**示例**:

```json
{
  "content": "用户偏好 TypeScript",
  "type": "preference",
  "lifecycle": "semantic",
  "tags": ["language", "engineering"]
}
```

### evermemoryRecall
OpenClaw: `evermemory_recall` (`memory_recall`)

召回相关记忆。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| query | string | 是 | 查询文本。 |
| scope | `MemoryScope` | 否 | 召回作用域。 |
| types | `MemoryType[]` | 否 | 仅召回指定类型。 |
| lifecycles | `MemoryLifecycle[]` | 否 | 仅召回指定生命周期。 |
| mode | `RetrievalMode` | 否 | 检索模式：`structured` `keyword` `hybrid`。 |
| limit | number | 否 | 返回上限。 |

**返回值**: `RecallResult`

```ts
{
  items: MemoryItem[];
  total: number;
  limit: number;
}
```

**示例**:

```json
{
  "query": "用户对代码风格的偏好",
  "mode": "hybrid",
  "limit": 5
}
```

### evermemoryBriefing
OpenClaw: `evermemory_briefing`

构建启动 briefing。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 否 | 目标会话 ID。 |
| scope | `MemoryScope` | 否 | briefing 作用域。 |
| tokenTarget | number | 否 | 目标 token 预算。 |

**返回值**: `BootBriefing`

```ts
{
  id: string;
  sessionId?: string;
  userId?: string;
  generatedAt: string;
  sections: {
    identity: string[];
    constraints: string[];
    recentContinuity: string[];
    activeProjects: string[];
  };
  tokenTarget: number;
  actualApproxTokens: number;
  optimization?: {
    duplicateBlocksRemoved: number;
    tokenPrunedBlocks: number;
    highValueBlocksKept: number;
  };
}
```

**示例**:

```json
{
  "sessionId": "sess_123",
  "tokenTarget": 900
}
```

### evermemoryStatus
OpenClaw: `evermemory_status`

返回系统状态摘要。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 否 | 按用户过滤状态。 |
| sessionId | string | 否 | 关联会话 ID。 |

**返回值**: `EverMemoryStatusToolResult`

```ts
{
  schemaVersion: number;
  databasePath: string;
  memoryCount: number;
  activeMemoryCount?: number;
  archivedMemoryCount?: number;
  semanticIndexCount?: number;
  profileCount?: number;
  experienceCount?: number;
  reflectionCount?: number;
  activeRuleCount?: number;
  countsByType: Partial<Record<MemoryType, number>>;
  countsByLifecycle: Partial<Record<MemoryLifecycle, number>>;
  latestBriefing?: { id: string; generatedAt: string; userId?: string; sessionId?: string; };
  latestReflection?: { id: string; createdAt: string; triggerKind: ReflectionTriggerKind; confidence: number; };
  latestRule?: { id: string; updatedAt: string; category: BehaviorRule["category"]; priority: number; confidence: number; };
  latestProfile?: { userId: string; updatedAt: string; stableCanonicalFields?: object; derivedWeakHints?: object; };
  latestWriteDecision?: { createdAt: string; entityId?: string; accepted?: boolean; reason?: string; merged?: number; archivedStale?: number; profileRecomputed?: boolean; };
  latestRetrieval?: { createdAt: string; query?: string; requestedMode?: string; mode?: string; returned?: number; candidates?: number; };
  latestProfileRecompute?: { createdAt: string; userId?: string; memoryCount?: number; stable?: ProjectedProfile["stable"]; derived?: ProjectedProfile["derived"]; };
  recentDebugByKind?: Partial<Record<DebugEventKind, number>>;
  latestDebugEvents?: Array<{ createdAt: string; kind: DebugEventKind; entityId?: string; }>;
  continuityKpis?: {
    sampleWindow: { sessionEndEvents: number; retrievalEvents: number; };
    autoMemory: { generated: number; accepted: number; rejected: number; acceptRate?: number; generatedByKind?: Record<string, number>; acceptedByKind?: Record<string, number>; };
    projectSummary: { generated: number; accepted: number; acceptRate?: number; };
    retrievalPolicy: { suppressedTestCandidates: number; retainedTestCandidates: number; projectRoutedExecutions: number; projectRoutedHits: number; projectRouteHitRate?: number; };
  };
  runtimeSession?: RuntimeSessionContext;
  recentDebugEvents: number;
}
```

**示例**:

```json
{
  "userId": "u_001"
}
```

### evermemorySmartness
OpenClaw: 未注册

生成人类可读的智能度报告。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 否 | 目标用户 ID。 |

**返回值**: `string`

```ts
"🧠 智能度评分：87/100\n  ├─ Recall： 85分 (↑ improved)\n  └─ Governance： 90分 (→ stable)"
```

**示例**:

```json
{
  "userId": "u_001"
}
```

### evermemoryIntent
OpenClaw: `evermemory_intent`

分析消息意图并落库。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息文本。 |
| sessionId | string | 否 | 会话 ID。 |
| messageId | string | 否 | 消息 ID。 |
| scope | `MemoryScope` | 否 | 分析作用域。 |

**返回值**: `IntentRecord`

```ts
{
  id: string;
  sessionId?: string;
  messageId?: string;
  createdAt: string;
  rawText: string;
  intent: { type: IntentType; subtype?: string; confidence: number; };
  signals: {
    urgency: IntentUrgency;
    emotionalTone: IntentEmotionalTone;
    actionNeed: IntentActionNeed;
    memoryNeed: IntentMemoryNeed;
    preferenceRelevance: number;
    correctionSignal: number;
  };
  entities: Array<{ type: string; value: string; confidence: number; }>;
  retrievalHints: {
    preferredTypes: MemoryType[];
    preferredScopes: RetrievalScopeHint[];
    preferredTimeBias: RetrievalTimeBias;
  };
}
```

**示例**:

```json
{
  "message": "以后代码示例优先用 TypeScript，并尽量简洁。"
}
```

### evermemoryReflect
OpenClaw: `evermemory_reflect`

从经验记录生成反思与候选规则。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 否 | 仅处理指定会话的经验。 |
| mode | `"light" \| "full"` | 否 | 反思深度。 |

**返回值**: `EverMemoryReflectToolResult`

```ts
{
  reflections: ReflectionRecord[];
  candidateRules: string[];
  summary: {
    processedExperiences: number;
    createdReflections: number;
  };
}
```

**示例**:

```json
{
  "sessionId": "sess_123",
  "mode": "full"
}
```

### evermemoryRules
OpenClaw: `evermemory_rules`

查询规则，或对指定规则执行治理动作。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scope | `MemoryScope` | 否 | 规则作用域。 |
| intentType | `IntentType` | 否 | 按意图过滤。 |
| channel | string | 否 | 按渠道过滤。 |
| contexts | string[] | 否 | 按上下文标签过滤。 |
| limit | number | 否 | 返回上限。 |
| includeInactive | boolean | 否 | 包含 inactive 规则。 |
| includeDeprecated | boolean | 否 | 包含 deprecated 规则。 |
| includeFrozen | boolean | 否 | 包含 frozen 规则。 |
| action | `"freeze" \| "deprecate" \| "rollback"` | 否 | 治理动作；提供时需要 `ruleId`。 |
| ruleId | string | 否 | 目标规则 ID。 |
| reason | string | 否 | 动作原因。 |
| reflectionId | string | 否 | 关联反思 ID。 |
| replacementRuleId | string | 否 | 替代规则 ID。 |

**返回值**: `EverMemoryRulesToolResult`

```ts
{
  rules: BehaviorRule[];
  total: number;
  filters: {
    userId?: string;
    intentType?: IntentType;
    channel?: string;
    contexts?: string[];
    limit: number;
    includeInactive?: boolean;
    includeDeprecated?: boolean;
    includeFrozen?: boolean;
  };
  governance: {
    levels: BehaviorRule["lifecycle"]["level"][];
    maturities: BehaviorRule["lifecycle"]["maturity"][];
    frozenCount: number;
    staleCount: number;
    maxDecayScore: number;
  };
  mutation?: {
    action: BehaviorRuleMutationAction;
    changed: boolean;
    reason: string;
    rule: BehaviorRule | null;
  };
}
```

**示例**:

```json
{
  "intentType": "instruction",
  "limit": 5
}
```

### evermemoryProfile
OpenClaw: `evermemory_profile`

读取或重算用户画像。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 否 | 用户 ID；为空时返回最近画像。 |
| recompute | boolean | 否 | 是否强制重算。 |

**返回值**: `EverMemoryProfileToolResult`

```ts
{
  profile: ProjectedProfile | null;
  source: "recomputed" | "stored" | "latest" | "none";
  summary?: {
    stableCanonicalFields: number;
    derivedHintFields: number;
    derivedGuardrail: "weak_hint_only";
  };
}
```

**示例**:

```json
{
  "userId": "u_001",
  "recompute": true
}
```

### evermemoryOnboard
OpenClaw: `profile_onboard`

执行首次画像 onboarding。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| userId | string | 否 | 用户 ID；OpenClaw 注册层要求必须能解析出用户 ID。 |
| responses | `OnboardingResponse[]` | 否 | 回答列表：`[{ questionId, answer }]`。 |

**返回值**: `EverMemoryOnboardingToolResult`

```ts
{
  needsOnboarding: boolean;
  questions: readonly OnboardingQuestion[];
  welcomeMessage?: string;
  completionMessage?: string;
  result?: OnboardingResult;
}
```

**示例**:

```json
{
  "userId": "u_001",
  "responses": [
    { "questionId": "display_name", "answer": "Alice" },
    { "questionId": "language", "answer": "中文" }
  ]
}
```

### evermemoryConsolidate
OpenClaw: `evermemory_consolidate`

执行记忆整理与生命周期维护。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| mode | `ConsolidationMode` | 否 | 模式：`light` `daily` `deep`。 |
| scope | `MemoryScope` | 否 | 仅整理指定作用域。 |

**返回值**: `EverMemoryConsolidateToolResult`

```ts
{
  mode: ConsolidationMode;
  processed: number;
  merged: number;
  archivedStale: number;
}
```

**示例**:

```json
{
  "mode": "daily"
}
```

### evermemoryExplain
OpenClaw: `evermemory_explain`

解释写入、检索、规则、session、归档、intent 决策。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| topic | `EverMemoryExplainTopic` | 否 | 主题：`write` `retrieval` `rule` `session` `archive` `intent`。默认 `write`。 |
| entityId | string | 否 | 仅查看指定实体。 |
| limit | number | 否 | 返回条数，内部会限制在 1..20。 |

**返回值**: `EverMemoryExplainToolResult`

```ts
{
  topic: EverMemoryExplainTopic;
  total: number;
  items: Array<{
    createdAt: string;
    kind: DebugEventKind;
    entityId?: string;
    question: string;
    answer: string;
    evidence: Record<string, unknown>;
    meta?: {
      outcome: "accepted" | "rejected" | "skipped" | "applied" | "reviewed";
      affectedCount?: number;
      reason?: string;
      categories?: string[];
    };
  }>;
}
```

**示例**:

```json
{
  "topic": "retrieval",
  "limit": 3
}
```

### evermemoryExport
OpenClaw: `evermemory_export` (`memory_export`)

导出记忆快照。SDK 版本返回结构化 snapshot；OpenClaw 注册层额外支持 `format=json|markdown` 文本导出。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scope | `MemoryScope` | 否 | 导出作用域。 |
| includeArchived | boolean | 否 | 是否包含 archive。 |
| limit | number | 否 | 导出上限。 |

**OpenClaw 扩展参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| format | `"json" \| "markdown"` | 否 | 返回纯文本导出，而不是 snapshot 对象。 |

**返回值**: `EverMemoryExportToolResult`

```ts
{
  snapshot: {
    format: "evermemory.snapshot.v1";
    generatedAt: string;
    total: number;
    items: MemoryItem[];
  };
  summary: {
    exported: number;
    includeArchived: boolean;
    scope?: MemoryScope;
  };
}
```

**示例**:

```json
{
  "scope": { "userId": "u_001" },
  "includeArchived": true,
  "limit": 100
}
```

### evermemoryImport
OpenClaw: `evermemory_import` (`memory_import`)

导入记忆快照。SDK 版本接受 snapshot；OpenClaw 注册层额外支持 `content + format` 的 JSON/Markdown 导入。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| snapshot | `EverMemorySnapshotV1` | 是 | 待导入快照。 |
| mode | `"review" \| "apply"` | 否 | 导入模式。 |
| approved | boolean | 否 | 是否批准应用导入。 |
| allowOverwrite | boolean | 否 | 是否允许覆盖同 ID 项。 |
| scopeOverride | `MemoryScope` | 否 | 导入时强制覆盖 scope。 |

**OpenClaw 扩展参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 否 | JSON 或 Markdown 文本。 |
| format | `"json" \| "markdown"` | 否 | `content` 的格式。 |

**返回值**: `EverMemoryImportToolResult`

```ts
{
  mode: "review" | "apply";
  approved: boolean;
  applied: boolean;
  total: number;
  toCreate: number;
  toUpdate: number;
  imported: number;
  updated: number;
  rejected: Array<{ id?: string; reason: string; detail?: string; hint?: string; }>;
  summary: {
    totalRequested: number;
    accepted: number;
    rejected: number;
    acceptedByType: Record<string, number>;
    rejectedByReason: Record<string, number>;
  };
}
```

**示例**:

```json
{
  "snapshot": {
    "format": "evermemory.snapshot.v1",
    "generatedAt": "2026-03-15T10:00:00.000Z",
    "total": 1,
    "items": []
  },
  "mode": "review"
}
```

### evermemoryReview
OpenClaw: `evermemory_review`

审查已归档记忆，或附带查看规则溯源。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| scope | `MemoryScope` | 否 | 审查作用域。 |
| query | string | 否 | 关键词过滤。 |
| limit | number | 否 | 返回上限。 |
| includeSuperseded | boolean | 否 | 是否包含已被 supersede 的项。 |
| ruleId | string | 否 | 附带返回该规则的 review 结果。 |

**返回值**: `EverMemoryReviewToolResult`

```ts
{
  total: number;
  candidates: Array<{
    id: string;
    content: string;
    type: MemoryType;
    lifecycle: MemoryLifecycle;
    scope: MemoryScope;
    updatedAt: string;
    supersededBy?: string;
    restoreEligible: boolean;
    reason?: string;
  }>;
  ruleReview?: BehaviorRuleReviewRecord;
}
```

**示例**:

```json
{
  "query": "TypeScript",
  "includeSuperseded": false,
  "limit": 10
}
```

### evermemoryRestore
OpenClaw: `evermemory_restore`

恢复归档记忆。

**参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ids | string[] | 是 | 待恢复记忆 ID 列表。 |
| mode | `"review" \| "apply"` | 否 | 恢复模式。 |
| approved | boolean | 否 | 是否批准执行。 |
| targetLifecycle | `"working" \| "episodic" \| "semantic"` | 否 | 恢复后的生命周期。 |
| allowSuperseded | boolean | 否 | 是否允许恢复已被 supersede 的项。 |

**返回值**: `EverMemoryRestoreToolResult`

```ts
{
  mode: "review" | "apply";
  approved: boolean;
  applied: boolean;
  appliedAt?: string;
  total: number;
  restorable: number;
  restored: number;
  targetLifecycle: "working" | "episodic" | "semantic";
  userImpact?: {
    affectedUserIds: string[];
    restoredByType: Record<string, number>;
  };
  rejected: Array<{ id?: string; reason: string; }>;
}
```

**示例**:

```json
{
  "ids": ["mem_001", "mem_002"],
  "mode": "review",
  "targetLifecycle": "episodic"
}
```

## OpenClaw 注册名对照

| SDK 名称 | OpenClaw 名称 |
|------|------|
| evermemoryStore | `evermemory_store`, `memory_store` |
| evermemoryRecall | `evermemory_recall`, `memory_recall` |
| evermemoryBriefing | `evermemory_briefing` |
| evermemoryStatus | `evermemory_status` |
| evermemorySmartness | 未注册 |
| evermemoryIntent | `evermemory_intent` |
| evermemoryReflect | `evermemory_reflect` |
| evermemoryRules | `evermemory_rules` |
| evermemoryProfile | `evermemory_profile` |
| evermemoryOnboard | `profile_onboard` |
| evermemoryConsolidate | `evermemory_consolidate` |
| evermemoryExplain | `evermemory_explain` |
| evermemoryExport | `evermemory_export`, `memory_export` |
| evermemoryImport | `evermemory_import`, `memory_import` |
| evermemoryReview | `evermemory_review` |
| evermemoryRestore | `evermemory_restore` |

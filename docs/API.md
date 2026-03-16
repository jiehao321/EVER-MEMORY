# EverMemory API Reference

## Tools

EverMemory exports 16 tool functions from `src/tools/index.ts`.

- TypeScript SDK names use camelCase (e.g. `evermemoryStore`).
- OpenClaw registered names use snake_case (e.g. `evermemory_store`).
- `evermemorySmartness` is exported by the SDK but not currently registered in OpenClaw.

### evermemoryStore
OpenClaw: `evermemory_store` (`memory_store`)

Store a memory item.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| content | string | Yes | Memory content. |
| type | `MemoryType` | No | Memory type: `identity` `fact` `preference` `decision` `commitment` `relationship` `task` `project` `style` `summary` `constraint`. |
| lifecycle | `MemoryLifecycle` | No | Lifecycle stage: `working` `episodic` `semantic` `archive`. |
| scope | `MemoryScope` | No | Scope: `{ userId?, chatId?, project?, global? }`. |
| source | `MemorySource` | No | Write source: `{ kind, actor?, sessionId?, messageId?, channel? }`. Defaults to `{ kind: "tool", actor: "system" }`. |
| tags | string[] | No | Tags. |
| relatedEntities | string[] | No | Related entity IDs. |

**Returns**: `EverMemoryStoreToolResult`
```ts
{
  accepted: boolean;
  reason: string;
  memory: MemoryItem | null;
}
```

**Example**:
```json
{
  "content": "User prefers TypeScript",
  "type": "preference",
  "lifecycle": "semantic",
  "tags": ["language", "engineering"]
}
```

### evermemoryRecall
OpenClaw: `evermemory_recall` (`memory_recall`)

Recall relevant memories.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| query | string | Yes | Query text. |
| scope | `MemoryScope` | No | Recall scope. |
| types | `MemoryType[]` | No | Filter by memory types. |
| lifecycles | `MemoryLifecycle[]` | No | Filter by lifecycle stages. |
| mode | `RetrievalMode` | No | Retrieval mode: `structured` `keyword` `hybrid`. |
| limit | number | No | Maximum items to return. |

**Returns**: `RecallResult`
```ts
{
  items: MemoryItem[];
  total: number;
  limit: number;
}
```

**Example**:
```json
{
  "query": "code style preferences",
  "mode": "hybrid",
  "limit": 5
}
```

### evermemoryBriefing
OpenClaw: `evermemory_briefing`

Generate a session startup briefing.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | No | Target session ID. |
| scope | `MemoryScope` | No | Briefing scope. |
| tokenTarget | number | No | Target token budget. |

**Returns**: `BootBriefing`
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

**Example**:
```json
{
  "sessionId": "sess_123",
  "tokenTarget": 900
}
```

### evermemoryStatus
OpenClaw: `evermemory_status`

Return system status summary.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | No | Filter status by user. |
| sessionId | string | No | Associated session ID. |

**Returns**: `EverMemoryStatusToolResult`
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

**Example**:
```json
{
  "userId": "u_001"
}
```

### evermemorySmartness
OpenClaw: Not registered

Generate a human-readable smartness report.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | No | Target user ID. |

**Returns**: `string`

**Example**:
```json
{
  "userId": "u_001"
}
```

### evermemoryIntent
OpenClaw: `evermemory_intent`

Analyze message intent and persist the record.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| message | string | Yes | User message text. |
| sessionId | string | No | Session ID. |
| messageId | string | No | Message ID. |
| scope | `MemoryScope` | No | Analysis scope. |

**Returns**: `IntentRecord`
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

**Example**:
```json
{
  "message": "From now on, prefer TypeScript for code examples and keep them concise."
}
```

### evermemoryReflect
OpenClaw: `evermemory_reflect`

Generate reflections and candidate rules from experience records.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | string | No | Only process experiences from this session. |
| mode | `"light" \| "full"` | No | Reflection depth. |

**Returns**: `EverMemoryReflectToolResult`
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

**Example**:
```json
{
  "sessionId": "sess_123",
  "mode": "full"
}
```

### evermemoryRules
OpenClaw: `evermemory_rules`

Query rules or execute governance actions on a specific rule.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| scope | `MemoryScope` | No | Rule scope. |
| intentType | `IntentType` | No | Filter by intent type. |
| channel | string | No | Filter by channel. |
| contexts | string[] | No | Filter by context tags. |
| limit | number | No | Maximum items to return. |
| includeInactive | boolean | No | Include inactive rules. |
| includeDeprecated | boolean | No | Include deprecated rules. |
| includeFrozen | boolean | No | Include frozen rules. |
| action | `"freeze" \| "deprecate" \| "rollback"` | No | Governance action; requires `ruleId`. |
| ruleId | string | No | Target rule ID. |
| reason | string | No | Action reason. |
| reflectionId | string | No | Associated reflection ID. |
| replacementRuleId | string | No | Replacement rule ID. |

**Returns**: `EverMemoryRulesToolResult`
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

**Example**:
```json
{
  "intentType": "instruction",
  "limit": 5
}
```

### evermemoryProfile
OpenClaw: `evermemory_profile`

Read or recompute a user profile.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | No | User ID; returns latest profile if empty. |
| recompute | boolean | No | Force recomputation. |

**Returns**: `EverMemoryProfileToolResult`
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

**Example**:
```json
{
  "userId": "u_001",
  "recompute": true
}
```

### evermemoryOnboard
OpenClaw: `profile_onboard`

Execute first-run profile onboarding.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | No | User ID; OpenClaw registration layer requires a resolvable user ID. |
| responses | `OnboardingResponse[]` | No | Response list: `[{ questionId, answer }]`. |

**Returns**: `EverMemoryOnboardingToolResult`
```ts
{
  needsOnboarding: boolean;
  questions: readonly OnboardingQuestion[];
  welcomeMessage?: string;
  completionMessage?: string;
  result?: OnboardingResult;
}
```

**Example**:
```json
{
  "userId": "u_001",
  "responses": [
    { "questionId": "display_name", "answer": "Alice" },
    { "questionId": "language", "answer": "English" }
  ]
}
```

### evermemoryConsolidate
OpenClaw: `evermemory_consolidate`

Execute memory consolidation and lifecycle maintenance.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| mode | `ConsolidationMode` | No | Mode: `light` `daily` `deep`. |
| scope | `MemoryScope` | No | Only consolidate within this scope. |

**Returns**: `EverMemoryConsolidateToolResult`
```ts
{
  mode: ConsolidationMode;
  processed: number;
  merged: number;
  archivedStale: number;
}
```

**Example**:
```json
{
  "mode": "daily"
}
```

### evermemoryExplain
OpenClaw: `evermemory_explain`

Explain write, retrieval, rule, session, archive, or intent decisions.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| topic | `EverMemoryExplainTopic` | No | Topic: `write` `retrieval` `rule` `session` `archive` `intent`. Defaults to `write`. |
| entityId | string | No | Filter to a specific entity. |
| limit | number | No | Number of items to return (clamped to 1..20). |

**Returns**: `EverMemoryExplainToolResult`
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

**Example**:
```json
{
  "topic": "retrieval",
  "limit": 3
}
```

### evermemoryExport
OpenClaw: `evermemory_export` (`memory_export`)

Export a memory snapshot. SDK returns a structured snapshot; OpenClaw registration layer additionally supports `format=json|markdown` text export.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| scope | `MemoryScope` | No | Export scope. |
| includeArchived | boolean | No | Include archived items. |
| limit | number | No | Export limit. |

**OpenClaw Extended Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| format | `"json" \| "markdown"` | No | Return plain text export instead of snapshot object. |

**Returns**: `EverMemoryExportToolResult`
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

**Example**:
```json
{
  "scope": { "userId": "u_001" },
  "includeArchived": true,
  "limit": 100
}
```

### evermemoryImport
OpenClaw: `evermemory_import` (`memory_import`)

Import a memory snapshot. SDK accepts a snapshot; OpenClaw registration layer additionally supports `content + format` for JSON/Markdown import.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| snapshot | `EverMemorySnapshotV1` | Yes | Snapshot to import. |
| mode | `"review" \| "apply"` | No | Import mode. |
| approved | boolean | No | Whether to approve the import. |
| allowOverwrite | boolean | No | Allow overwriting items with the same ID. |
| scopeOverride | `MemoryScope` | No | Force scope override during import. |

**OpenClaw Extended Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| content | string | No | JSON or Markdown text. |
| format | `"json" \| "markdown"` | No | Format of `content`. |

**Returns**: `EverMemoryImportToolResult`
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

**Example**:
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

Review archived memories, optionally with rule provenance.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| scope | `MemoryScope` | No | Review scope. |
| query | string | No | Keyword filter. |
| limit | number | No | Maximum items to return. |
| includeSuperseded | boolean | No | Include superseded items. |
| ruleId | string | No | Also return the review result for this rule. |

**Returns**: `EverMemoryReviewToolResult`
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

**Example**:
```json
{
  "query": "TypeScript",
  "includeSuperseded": false,
  "limit": 10
}
```

### evermemoryRestore
OpenClaw: `evermemory_restore`

Restore archived memories.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| ids | string[] | Yes | Memory IDs to restore. |
| mode | `"review" \| "apply"` | No | Restore mode. |
| approved | boolean | No | Whether to approve execution. |
| targetLifecycle | `"working" \| "episodic" \| "semantic"` | No | Lifecycle after restoration. |
| allowSuperseded | boolean | No | Allow restoring superseded items. |

**Returns**: `EverMemoryRestoreToolResult`
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

**Example**:
```json
{
  "ids": ["mem_001", "mem_002"],
  "mode": "review",
  "targetLifecycle": "episodic"
}
```

## OpenClaw Name Mapping

| SDK Name | OpenClaw Name |
|----------|---------------|
| evermemoryStore | `evermemory_store`, `memory_store` |
| evermemoryRecall | `evermemory_recall`, `memory_recall` |
| evermemoryBriefing | `evermemory_briefing` |
| evermemoryStatus | `evermemory_status` |
| evermemorySmartness | Not registered |
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

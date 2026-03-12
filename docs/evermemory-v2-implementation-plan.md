# EverMemory v2 - Implementation-Level Technical Plan

**Version:** 2.0.0-implementation-draft  
**Status:** Implementation-ready design draft  
**Date:** 2026-03-11  
**Depends on:** `docs/evermemory-technical-design-v2.md`  
**Goal:** Define concrete implementation structure, storage schema, runtime flow, APIs, policies, and milestone plan for EverMemory v2.

---

# 1. Purpose of This Document

This document converts the formal EverMemory v2 architecture into an implementation-oriented plan.

It answers:
- what modules must exist,
- what files should be created,
- what tables and schemas should be used,
- how hooks should execute,
- how memory, intent, reflection, and behavior rules should interact,
- what the rollout order should be.

This document is written to support direct implementation planning and task breakdown.

---

# 2. Implementation Strategy

## 2.1 Development strategy

EverMemory v2 should be built incrementally.

### Rule 1: land stable memory first
Do not begin with reflection or evolution before the memory substrate is trustworthy.

### Rule 2: keep the first execution path deterministic
Early versions should prefer explicit heuristics + structured LLM outputs over opaque autonomous behavior.

### Rule 3: make all important writes inspectable
Every important decision should be debuggable via logs or tool outputs.

### Rule 4: evolution must be gated
No direct mutation from one reflection into permanent behavior without policy checks.

### Rule 5: protect first-reply latency
Any feature that is not strictly necessary for the current reply must not block the critical response path.
Fast-path logic should stay minimal. Slow-path learning and consolidation should run asynchronously.

## 2.2 Recommended build order

1. storage schema
2. memory CRUD and retrieval
3. boot briefing
4. intent analysis
5. experience logging
6. reflection generation
7. behavior rule promotion
8. optimization and tuning

---

# 3. Plugin Package Structure

## 3.1 Recommended repository structure

```text
evermemory/
├── package.json
├── plugin.json
├── README.md
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── storage.md
│   └── troubleshooting.md
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── types.ts
│   ├── constants.ts
│   │
│   ├── hooks/
│   │   ├── sessionStart.ts
│   │   ├── messageReceived.ts
│   │   ├── contextCompact.ts
│   │   ├── sessionEnd.ts
│   │   └── heartbeat.ts
│   │
│   ├── tools/
│   │   ├── store.ts
│   │   ├── recall.ts
│   │   ├── briefing.ts
│   │   ├── intent.ts
│   │   ├── profile.ts
│   │   ├── reflect.ts
│   │   ├── rules.ts
│   │   └── status.ts
│   │
│   ├── core/
│   │   ├── memory/
│   │   │   ├── service.ts
│   │   │   ├── policy.ts
│   │   │   ├── classifier.ts
│   │   │   ├── promotion.ts
│   │   │   ├── conflict.ts
│   │   │   └── summarizer.ts
│   │   │
│   │   ├── intent/
│   │   │   ├── service.ts
│   │   │   ├── prompt.ts
│   │   │   ├── parser.ts
│   │   │   └── heuristics.ts
│   │   │
│   │   ├── reflection/
│   │   │   ├── service.ts
│   │   │   ├── prompt.ts
│   │   │   ├── experience.ts
│   │   │   ├── candidateRules.ts
│   │   │   └── promotion.ts
│   │   │
│   │   ├── behavior/
│   │   │   ├── service.ts
│   │   │   ├── ranking.ts
│   │   │   └── applicability.ts
│   │   │
│   │   ├── briefing/
│   │   │   └── service.ts
│   │   │
│   │   └── profile/
│   │       └── projection.ts
│   │
│   ├── retrieval/
│   │   ├── service.ts
│   │   ├── keyword.ts
│   │   ├── semantic.ts
│   │   ├── hybrid.ts
│   │   └── ranking.ts
│   │
│   ├── storage/
│   │   ├── db.ts
│   │   ├── migrations.ts
│   │   ├── memoryRepo.ts
│   │   ├── intentRepo.ts
│   │   ├── reflectionRepo.ts
│   │   ├── behaviorRepo.ts
│   │   ├── profileRepo.ts
│   │   ├── archiveRepo.ts
│   │   └── debugRepo.ts
│   │
│   ├── llm/
│   │   ├── client.ts
│   │   ├── json.ts
│   │   └── guards.ts
│   │
│   ├── runtime/
│   │   ├── context.ts
│   │   ├── scoring.ts
│   │   ├── state.ts
│   │   └── ids.ts
│   │
│   └── util/
│       ├── clock.ts
│       ├── hash.ts
│       ├── jsonl.ts
│       ├── logger.ts
│       ├── text.ts
│       └── validate.ts
└── test/
    ├── memory.test.ts
    ├── intent.test.ts
    ├── reflection.test.ts
    ├── retrieval.test.ts
    ├── briefing.test.ts
    └── rules.test.ts
```

## 3.2 Directory rationale

- `hooks/`: OpenClaw integration points
- `tools/`: tool-exposed entry points
- `core/`: business logic
- `retrieval/`: search/ranking subsystem
- `storage/`: persistence implementation
- `llm/`: structured LLM invocation utilities
- `runtime/`: request/session-scoped orchestration helpers

---

# 4. Runtime Component Responsibilities

## 4.1 `src/index.ts`
Responsibilities:
- load config
- initialize DB
- register hooks
- register tools
- expose plugin metadata

## 4.2 `config.ts`
Responsibilities:
- parse plugin config
- apply defaults
- validate thresholds, schedules, token budgets, and enabled flags

## 4.3 `types.ts`
Responsibilities:
- define all public and internal TypeScript interfaces
- centralize enums and shared object models

---

# 5. Persistent Storage Design

## 5.1 Storage backend

Recommended primary backend for v2:
- SQLite as canonical transactional store
- optional vector sidecar/index for semantic retrieval
- JSONL debug artifacts for explainability

## 5.2 Database location

```text
~/.openclaw/memory/evermemory/store/evermemory.db
```

## 5.3 Core tables

### 5.3.1 `memory_items`

```sql
CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  lifecycle TEXT NOT NULL,

  source_kind TEXT NOT NULL,
  source_actor TEXT,
  session_id TEXT,
  message_id TEXT,
  channel TEXT,

  confidence REAL NOT NULL DEFAULT 0.5,
  importance REAL NOT NULL DEFAULT 0.5,
  explicitness REAL NOT NULL DEFAULT 0.5,
  stability REAL NOT NULL DEFAULT 0.5,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT,

  scope_user_id TEXT,
  scope_chat_id TEXT,
  scope_project TEXT,
  scope_global INTEGER NOT NULL DEFAULT 0,

  evidence_excerpt TEXT,
  evidence_refs_json TEXT,

  active INTEGER NOT NULL DEFAULT 1,
  archived INTEGER NOT NULL DEFAULT 0,
  superseded_by TEXT,
  conflict_with_json TEXT,

  related_memory_ids_json TEXT,
  related_entities_json TEXT,
  tags_json TEXT,

  access_count INTEGER NOT NULL DEFAULT 0,
  retrieval_count INTEGER NOT NULL DEFAULT 0
);
```

Recommended indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_items(type);
CREATE INDEX IF NOT EXISTS idx_memory_lifecycle ON memory_items(lifecycle);
CREATE INDEX IF NOT EXISTS idx_memory_scope_user ON memory_items(scope_user_id);
CREATE INDEX IF NOT EXISTS idx_memory_scope_chat ON memory_items(scope_chat_id);
CREATE INDEX IF NOT EXISTS idx_memory_updated_at ON memory_items(updated_at);
CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_items(active);
```

### 5.3.2 `intent_records`

```sql
CREATE TABLE IF NOT EXISTS intent_records (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL,
  raw_text TEXT NOT NULL,

  intent_type TEXT NOT NULL,
  intent_subtype TEXT,
  intent_confidence REAL NOT NULL,

  urgency TEXT NOT NULL,
  emotional_tone TEXT NOT NULL,
  action_need TEXT NOT NULL,
  memory_need TEXT NOT NULL,
  preference_relevance REAL NOT NULL,
  correction_signal REAL NOT NULL,

  entities_json TEXT NOT NULL,
  retrieval_hints_json TEXT NOT NULL
);
```

### 5.3.3 `experience_logs`

```sql
CREATE TABLE IF NOT EXISTS experience_logs (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  message_id TEXT,
  created_at TEXT NOT NULL,

  input_summary TEXT NOT NULL,
  action_summary TEXT NOT NULL,
  outcome_summary TEXT,

  user_correction INTEGER NOT NULL DEFAULT 0,
  user_approval INTEGER NOT NULL DEFAULT 0,
  hesitation INTEGER NOT NULL DEFAULT 0,
  external_action_risk INTEGER NOT NULL DEFAULT 0,
  repeat_mistake_signal INTEGER NOT NULL DEFAULT 0,

  evidence_refs_json TEXT NOT NULL
);
```

### 5.3.4 `reflection_records`

```sql
CREATE TABLE IF NOT EXISTS reflection_records (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,

  trigger_kind TEXT NOT NULL,
  experience_ids_json TEXT NOT NULL,

  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  what_worked TEXT,
  what_failed TEXT,
  next_time_recommendation TEXT,

  evidence_refs_json TEXT NOT NULL,
  evidence_confidence REAL NOT NULL,
  recurrence_count INTEGER NOT NULL DEFAULT 1,

  candidate_rules_json TEXT NOT NULL,

  promoted INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  reviewed_at TEXT
);
```

### 5.3.5 `behavior_rules`

```sql
CREATE TABLE IF NOT EXISTS behavior_rules (
  id TEXT PRIMARY KEY,
  statement TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  applies_to_user_id TEXT,
  applies_to_channel TEXT,
  intent_types_json TEXT,
  contexts_json TEXT,

  category TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,

  reflection_ids_json TEXT NOT NULL,
  memory_ids_json TEXT NOT NULL,
  evidence_confidence REAL NOT NULL,
  recurrence_count INTEGER NOT NULL DEFAULT 1,

  active INTEGER NOT NULL DEFAULT 1,
  deprecated INTEGER NOT NULL DEFAULT 0,
  superseded_by TEXT
);
```

### 5.3.6 `projected_profiles`

```sql
CREATE TABLE IF NOT EXISTS projected_profiles (
  user_id TEXT PRIMARY KEY,
  updated_at TEXT NOT NULL,
  stable_json TEXT NOT NULL,
  derived_json TEXT NOT NULL,
  behavior_hints_json TEXT NOT NULL
);
```

### 5.3.7 `boot_briefings`

```sql
CREATE TABLE IF NOT EXISTS boot_briefings (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  generated_at TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  token_target INTEGER NOT NULL,
  actual_approx_tokens INTEGER NOT NULL
);
```

### 5.3.8 `debug_events`

```sql
CREATE TABLE IF NOT EXISTS debug_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT NOT NULL
);
```

Kinds may include:
- memory_write_decision
- memory_promote_decision
- memory_conflict
- intent_generated
- retrieval_executed
- reflection_created
- rule_promoted
- rule_rejected

---

# 6. Optional Semantic Retrieval Sidecar

## 6.1 Goal
Support semantic retrieval without making the core design dependent on a heavyweight vector DB.

## 6.2 Implementation option
Store embeddings in a sidecar table or secondary local index.

Example table:

```sql
CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  dims INTEGER NOT NULL,
  embedding_blob BLOB NOT NULL,
  updated_at TEXT NOT NULL
);
```

## 6.3 v2 policy
Semantic retrieval is recommended but should be optional via config.
If disabled, keyword + structured retrieval must still work.

---

# 7. TypeScript Models

Below are the minimum implementation interfaces.

## 7.1 Core memory types

```ts
export type MemoryType =
  | 'identity'
  | 'fact'
  | 'preference'
  | 'decision'
  | 'commitment'
  | 'relationship'
  | 'task'
  | 'project'
  | 'style'
  | 'summary'
  | 'lesson'
  | 'constraint';

export type MemoryLifecycle =
  | 'working'
  | 'episodic'
  | 'semantic'
  | 'archive';
```

## 7.2 Tool return objects

Every tool should return structured JSON-safe objects suitable for both machine and human inspection.

---

# 8. Hook Execution Flow

## 8.0 Fast path vs background path

EverMemory must separate message handling into two paths.

### Fast path (reply-critical)
Allowed responsibilities:
- scope resolution
- lightweight intent precheck
- minimal applicable rule lookup
- targeted recall only when necessary
- minimal runtime context assembly

### Background path (non-blocking)
Must be moved out of the critical reply path whenever possible:
- full intent enrichment
- deep recall / expensive ranking
- memory candidate enrichment
- experience log completion
- reflection generation
- candidate rule creation
- rule promotion review
- profile recomputation
- archival and cleanup jobs

### Latency budget guidance
Recommended EverMemory overhead on the critical path:
- scope resolve: < 10ms
- intent precheck: < 50ms
- rule lookup: < 50ms
- fast recall: < 150ms
- total preferred EverMemory overhead: < 250-400ms

### Degradation policy
When the system is under load, it should degrade in this order:
1. skip deep retrieval
2. reduce recall top-k
3. skip nonessential enrichment
4. fall back to boot-level constraints and identity only
5. queue all learning work for later


## 8.1 `session_start`

### Responsibilities
1. identify current user/chat/session scope
2. load high-priority behavior rules
3. generate or load boot briefing
4. inject continuity context into runtime state
5. write debug event

### Pseudocode

```ts
async function onSessionStart(ctx) {
  const scope = buildScope(ctx);
  const rules = await behaviorService.getActiveRules(scope);
  const briefing = await briefingService.build(scope, { rules });
  runtimeState.setBootContext(ctx.sessionId, { rules, briefing });
  await debugRepo.log('boot_generated', ctx.sessionId, { scope, briefing });
}
```

## 8.2 `message_received`

### Responsibilities
1. run intent analysis
2. decide if memory retrieval is needed
3. perform targeted/hybrid retrieval
4. expose results to runtime state
5. run memory write candidate evaluation
6. log explainability artifacts

### Pseudocode

```ts
async function onMessageReceived(ctx) {
  const intent = await intentService.analyze(ctx.messageText, ctx);
  await intentRepo.insert(intent);

  let recalled = [];
  if (intent.signals.memoryNeed !== 'none') {
    recalled = await retrievalService.recallForIntent(intent, ctx);
  }

  runtimeState.setInteractionContext(ctx.sessionId, {
    intent,
    recalled,
  });

  const candidates = await memoryService.extractCandidates(ctx, intent, recalled);
  await memoryService.processCandidates(candidates, ctx);

  await debugRepo.log('interaction_processed', ctx.messageId, {
    intent,
    recalledCount: recalled.length,
    candidateCount: candidates.length,
  });
}
```

## 8.3 `context_compact`

### Responsibilities
- preserve high-value transient context
- create summary candidates
- avoid losing important unresolved context

## 8.4 `session_end`

### Responsibilities
1. write experience log
2. summarize session if needed
3. run lightweight reflection
4. persist unresolved task/commitment context

## 8.5 `heartbeat`

### Responsibilities
- archive low-value stale memory
- promote strong episodic memory
- recompute profiles if needed
- run deeper reflection job if enabled

---

# 9. Memory Write Pipeline

## 9.1 Pipeline stages

```text
source event
  → candidate extraction
  → type guess
  → confidence + importance scoring
  → lifecycle assignment
  → duplicate/conflict check
  → write decision
  → persistence
  → debug event
```

## 9.2 Candidate extraction inputs
- current message
- intent record
- recent recalled memory
- session runtime state
- explicit user memory requests

## 9.3 Write decision output

```ts
interface WriteDecision {
  accepted: boolean;
  reason: string;
  type?: MemoryType;
  lifecycle?: MemoryLifecycle;
  confidence?: number;
  importance?: number;
  explicitness?: number;
}
```

## 9.4 Heuristic scoring guidance

### Explicitness
- user explicitly says “remember”, “以后都这样”, “我喜欢…”, “不要…” → high
- inferred style from tone → low/medium

### Importance
Higher for:
- constraints
- decisions
- commitments
- repeated preferences
- active project state

Lower for:
- filler
- greeting
- one-off chatter

### Stability
Higher for:
- repeated signals
- historical consistency
- explicit durable facts

---

# 10. Intent Analysis Implementation

## 10.0 Split intent into precheck and full analysis

Intent analysis should be separated into two levels.

### Intent precheck (fast path)
Runs synchronously before reply generation and only answers:
- is this a correction?
- is memory needed?
- is this a high-risk action request?
- is this simple enough to answer directly?
- which memory types are most likely relevant?

### Intent full analysis (background or optional)
Runs after the reply-critical stage when possible and may enrich:
- subtype
- emotional nuance
- stronger preference relevance
- richer entities
- detailed retrieval hints

This split exists to preserve reply responsiveness while still enabling richer understanding.


## 10.1 Input
- current message text
- optional recent message context
- optional boot context
- optional user profile projection

## 10.2 Output
IntentRecord object.

## 10.3 Method

Intent analysis should use a two-step approach:

### Step 1: cheap heuristics
Use pattern rules for obvious cases:
- explicit correction phrases
- direct execution requests
- memory-related phrases
- urgent phrasing

### Step 2: LLM structured JSON analysis
Ask model for structured object only if needed or always if enabled.

## 10.4 Prompt structure
The prompt should request:
- intent type,
- subtype,
- urgency,
- emotional tone,
- action need,
- memory need,
- preference relevance,
- correction signal,
- entities,
- retrieval hints.

## 10.5 Parser and safety
- reject invalid JSON
- apply schema validation
- clamp confidence and score ranges
- fallback to heuristic-only intent record on parser failure

---

# 11. Retrieval Implementation

## 11.1 Retrieval modes

### Structured-only mode
Use type/lifecycle/scope filters + keyword search.

### Hybrid mode
Use:
- keyword retrieval,
- semantic retrieval,
- policy-weighted reranking.

## 11.2 Retrieval service API

```ts
interface RecallRequest {
  query: string;
  scope: RecallScope;
  preferredTypes?: MemoryType[];
  preferredLifecycles?: MemoryLifecycle[];
  limit: number;
  mode: 'structured' | 'keyword' | 'hybrid';
}
```

## 11.3 Ranking stages

1. candidate fetch
2. structural filtering
3. score calculation
4. dedupe
5. top-k return

## 11.4 Suggested score weights (initial)

```ts
const DEFAULT_RETRIEVAL_WEIGHTS = {
  semantic: 0.35,
  keyword: 0.20,
  recency: 0.10,
  importance: 0.10,
  confidence: 0.10,
  explicitness: 0.05,
  scopeMatch: 0.05,
  typePriority: 0.05,
};
```

These should be config-driven.

## 11.5 Type priorities by intent example

```ts
const INTENT_TYPE_PRIORITIES = {
  correction: ['constraint', 'lesson', 'decision', 'task'],
  ask_design: ['project', 'decision', 'preference', 'lesson'],
  request_execution: ['constraint', 'commitment', 'task', 'behavior'],
  request_memory: ['identity', 'preference', 'decision', 'summary'],
};
```

---

# 12. Briefing Implementation

## 12.1 Boot briefing content source order

1. identity memory
2. explicit constraints
3. active behavior rules
4. recent semantic memory
5. recent episodic continuity
6. active tasks/projects

## 12.2 Briefing generation rules
- concise bullets
- no redundant evidence traces in final briefing
- prefer stable facts over guesses
- target configurable token budget

## 12.3 Briefing generation pseudocode

```ts
async function buildBootBriefing(scope, opts) {
  const identity = await memoryRepo.findByType(scope, 'identity');
  const constraints = await memoryRepo.findByType(scope, 'constraint');
  const rules = await behaviorRepo.findActive(scope);
  const recent = await memoryRepo.findRecent(scope);
  const projects = await memoryRepo.findActiveProjects(scope);

  return briefingComposer.compose({
    identity,
    constraints,
    rules,
    recent,
    projects,
    tokenBudget: opts.tokenBudget,
  });
}
```

---

# 13. Experience Logging Implementation

## 13.1 When to log experiences
- end of interaction turn,
- explicit correction,
- risky action,
- strong approval/disapproval,
- session end.

## 13.2 Minimal log fields
- input summary
- action summary
- outcome summary
- correction/approval flags
- evidence refs

## 13.3 How to detect signals
Signal detection sources:
- intent correction score,
- user phrases (“不是这个意思”, “你又…”, “以后不要…”),
- operator-style phrases (“先问再做”),
- direct praise or acceptance.

---

# 14. Reflection Implementation

## 14.1 Reflection trigger policy

### Trigger immediately on:
- explicit user correction,
- important mistake,
- high-risk action failure.

### Trigger in batch on:
- session end,
- heartbeat,
- daily maintenance.

## 14.2 Reflection service responsibilities
- gather relevant experience logs,
- identify pattern,
- summarize lesson,
- propose candidate rules,
- assign confidence and recurrence.

## 14.3 Candidate rule generation rules
A candidate rule should be:
- action-oriented,
- reusable,
- narrow enough to apply safely,
- supported by specific evidence.

Bad candidate rule:
- “User is always angry.”

Good candidate rule:
- “For high-risk external actions, ask for confirmation before proceeding.”

## 14.4 Reflection review thresholds

Initial default thresholds:
- confidence >= 0.75
- recurrenceCount >= 2 for style rules
- recurrenceCount >= 1 for explicit correction-based safety rules

These values should be config-driven.

---

# 15. Behavior Rule Promotion Logic

## 15.1 Promotion inputs
- candidate rules from reflection
- existing active rules
- recent contradictions
- category-specific thresholds

## 15.2 Promotion states

```text
candidate
  → active
  → deprecated
  → superseded
  → rejected
```

## 15.3 Promotion checks

A candidate rule should be rejected if:
- confidence too low,
- evidence too weak,
- too broad or too vague,
- conflicts with higher-priority rules,
- duplicates an existing rule.

## 15.4 Rule applicability ranking
At runtime, behavior rules should be ranked by:
- user scope match,
- channel match,
- intent type match,
- priority,
- freshness,
- evidence confidence.

---

# 16. Profile Projection Implementation

## 16.1 Recompute triggers
- semantic memory changes,
- rule promotion/deprecation,
- explicit preference changes,
- scheduled refresh.

## 16.2 Projection logic
Stable profile values come from semantic memory.
Derived values come from weighted aggregation.

## 16.3 Projection safety
Never let a derived profile field overwrite a stable explicit field.

---

# 17. Config Design

## 17.1 Example config

```json
{
  "evermemory": {
    "enabled": true,
    "storage": {
      "path": "~/.openclaw/memory/evermemory/store/evermemory.db",
      "semantic": {
        "enabled": true,
        "provider": "local"
      }
    },
    "boot": {
      "enabled": true,
      "tokenBudget": 1200
    },
    "memory": {
      "autoWrite": true,
      "semanticPromotion": true,
      "archiveEnabled": true,
      "maxRecall": 8
    },
    "intent": {
      "enabled": true,
      "useLLM": true,
      "fallbackHeuristics": true
    },
    "reflection": {
      "enabled": true,
      "sessionEnd": true,
      "heartbeat": true,
      "minConfidence": 0.75
    },
    "behavior": {
      "enabled": true,
      "autoPromote": true,
      "styleRuleMinRecurrence": 2,
      "safetyRuleMinRecurrence": 1
    },
    "retrieval": {
      "mode": "hybrid",
      "limit": 8,
      "weights": {
        "semantic": 0.35,
        "keyword": 0.20,
        "recency": 0.10,
        "importance": 0.10,
        "confidence": 0.10,
        "explicitness": 0.05,
        "scopeMatch": 0.05,
        "typePriority": 0.05
      }
    },
    "debug": {
      "enabled": true,
      "jsonl": true
    }
  }
}
```

---

# 18. Tool Specifications

## 18.1 `evermemory_store`

### Input
- content
- optional type
- optional lifecycle
- optional tags
- optional importance/confidence

### Output
- id
- final write decision
- normalized metadata

## 18.2 `evermemory_recall`

### Input
- query
- optional types
- optional lifecycle filters
- optional limit

### Output
- ordered memories
- scores summary
- retrieval mode used

## 18.3 `evermemory_intent`

### Input
- message
- optional context

### Output
- structured IntentRecord

## 18.4 `evermemory_reflect`

### Input
- optional sessionId
- mode: light/full

### Output
- reflection records
- candidate rules
- promoted/rejected summary

## 18.5 `evermemory_rules`

### Output
- active behavior rules sorted by priority and scope relevance

## 18.6 `evermemory_status`

### Output should include
- memory counts by lifecycle/type
- active rules count
- last reflection run
- last boot briefing
- archive stats
- debug stats

---

# 19. Debug Artifact Format

## 19.1 JSONL record example

```json
{
  "id": "dbg_123",
  "createdAt": "2026-03-11T08:00:00Z",
  "kind": "memory_write_decision",
  "entityId": "mem_456",
  "payload": {
    "accepted": true,
    "reason": "explicit user preference",
    "type": "preference",
    "lifecycle": "semantic",
    "confidence": 0.96
  }
}
```

## 19.2 Required debug kinds
- memory_write_decision
- memory_write_rejected
- intent_generated
- retrieval_executed
- reflection_created
- candidate_rule_generated
- rule_promoted
- rule_rejected
- profile_recomputed

---

# 20. Testing Plan

## 20.1 Unit tests
- memory classification
- write policy
- retrieval ranking
- conflict resolution
- reflection rule generation
- rule promotion gating

## 20.2 Integration tests
- boot briefing generation
- message_received full pipeline
- session_end reflection pipeline
- profile recomputation

## 20.3 Behavior tests
Test scenarios such as:
- explicit preference remembered correctly
- one-off emotion not promoted to semantic
- correction leads to reflection
- repeated correction creates rule
- active rule affects later retrieval/briefing context

## 20.4 Regression tests
- no duplicate semantic promotion
- no silent overwrite of explicit facts
- no rule promotion from weak evidence

---

# 21. Milestone Breakdown

## Milestone 1 — Foundation
Deliver:
- plugin skeleton
- config
- SQLite migrations
- memory repo/service
- store/recall tool

## Milestone 2 — Continuity
Deliver:
- boot briefing service
- session_start integration
- recent continuity retrieval

## Milestone 3 — Understanding
Deliver:
- intent service
- intent tool
- message_received retrieval hints

## Milestone 4 — Reflection
Deliver:
- experience logs
- reflection records
- session_end reflection flow

## Milestone 5 — Evolution
Deliver:
- behavior rules table/service
- promotion logic
- rules tool
- runtime rule ranking

## Milestone 6 — Quality
Deliver:
- debug artifacts
- profile projection
- archive logic
- tuning and tests

---

# 22. Immediate Implementation Priorities

If starting today, the first concrete coding tasks should be:

1. define `types.ts`
2. create SQLite migrations
3. implement `memoryRepo.ts`
4. implement `memory/service.ts`
5. implement `tools/store.ts`
6. implement `tools/recall.ts`
7. implement `briefing/service.ts`
8. wire `sessionStart.ts`
9. implement `intent/service.ts`
10. wire `messageReceived.ts`

Only after that:
11. implement experience logs
12. reflection generation
13. rule promotion

This ordering reduces risk.

---

# 23. Implementation Risks

## 23.1 Risk: overfitting user behavior
Mitigation:
- recurrence thresholds
- explicit-vs-inferred separation
- rejection of vague rules

## 23.2 Risk: bad structured LLM outputs
Mitigation:
- strict schema validation
- heuristic fallback
- debug logging

## 23.3 Risk: memory pollution
Mitigation:
- write governance
- episodic-first policy
- archive cleanup

## 23.4 Risk: behavior drift
Mitigation:
- evidence-backed promotion only
- deprecation/supersede logic
- no direct mutation from single event

---

# 24. Definition of Done

EverMemory v2 should be considered functionally complete when:

1. memory can be stored, recalled, promoted, and archived,
2. boot continuity works reliably,
3. intent records are generated on incoming messages,
4. experience logs and reflections are produced,
5. candidate behavior rules can be promoted safely,
6. active behavior rules influence future continuity or retrieval,
7. all critical mutations are explainable via debug data,
8. user-perceived continuity and personalization clearly improve.

---

# 25. Final Recommendation

Do not implement all subsystems at once.

Build EverMemory v2 as a strict layered rollout:
- memory first,
- understanding second,
- reflection third,
- evolution fourth.

That sequence gives the best chance of producing a system that actually feels smarter instead of merely sounding more complicated.

---

**End of Implementation-Level Technical Plan**

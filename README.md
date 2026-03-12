# EverMemory (Phase 5 Complete + Phase 6A/6B/6C/6D/6E Landed)

EverMemory is an OpenClaw memory plugin package focused on deterministic, inspectable persistence and continuity.

## Current status

The project now includes:

- typed config loading
- SQLite bootstrap and idempotent migrations
- repositories for memory / briefing / debug events / intent / reflection / behavior rules / projected profile
- deterministic write policy baseline
- memory service with explicit accept/reject results
- deterministic keyword recall with weighted ranking (keyword coverage + recency + quality signals)
- optional semantic sidecar index (disabled by default)
- retrieval modes integration: `structured` / `keyword` / `hybrid`
- lifecycle maintenance baseline: dedupe/merge + stale episodic archive
- projected profile recompute baseline (stable/derived split + explicit-over-inferred guard)
- richer status/debug surface baseline (schema/debug snapshots for operators)
- explainability tool baseline (`evermemory_explain` for write/retrieval/rule)
- import/export baseline with reviewed import (`evermemory_export` / `evermemory_import`)
- archive review/restore baseline (`evermemory_review` / `evermemory_restore`)
- operator runbook + troubleshooting docs for phase handoff
- boot briefing generation and persistence
- deterministic intent analysis baseline (`IntentService`)
- optional LLM intent enrichment path with strict parser + fallback
- `messageReceived` hook with intent-guided targeted recall
- experience logging (`ExperienceService`)
- reflection record generation with candidate rules (`ReflectionService`)
- behavior rule promotion with evidence/conflict/dedup gating (`BehaviorService`)
- `sessionEnd` reflection + automatic rule promotion integration
- runtime session context helpers
- minimal `session_start` wiring
- minimal tools surface:
  - `evermemory_store`
  - `evermemory_recall`
  - `evermemory_briefing`
  - `evermemory_status`
  - `evermemory_intent`
  - `evermemory_reflect`
  - `evermemory_rules`
  - `evermemory_profile`
  - `evermemory_consolidate`
  - `evermemory_explain`
  - `evermemory_export`
  - `evermemory_import`
  - `evermemory_review`
  - `evermemory_restore`
- key-path tests for migrations, repositories, intent enrichment/fallback, behavior promotion/ranking, message/session end integration, reflection flow, and tools
  - retrieval ranking refinement coverage

## Not included yet

- bundled external LLM provider integration (adapter must be injected by host)
- vector retrieval / embeddings
- schedulers or background workers
- complex operator UI

## Package entrypoints

Main module exports:

- `initializeEverMemory(config?)`
- `getPluginDefinition()`
- `getDefaultConfig()`

`plugin.json` declares a minimal plugin entry pointing to `dist/index.js` and names the exported initialize/definition functions.

## Minimal initialization example

```ts
import { initializeEverMemory } from './dist/index.js';

const evermemory = initializeEverMemory();

const session = evermemory.sessionStart({
  sessionId: 'sess-1',
  userId: 'user-1',
  chatId: 'chat-1',
});

console.log(session.briefing);
```

Intent analysis example:

```ts
const intent = evermemory.analyzeIntent({
  text: '更正一下，不是 A 方案，改为 B 方案。',
  sessionId: 'sess-1',
  scope: { userId: 'user-1' },
});

console.log(intent.intent.type); // correction
```

Message hook example:

```ts
const messageResult = evermemory.messageReceived({
  sessionId: 'sess-1',
  messageId: 'msg-1',
  text: '结合之前的项目计划，继续推进下一步。',
  scope: { userId: 'user-1', project: 'evermemory' },
});

console.log(messageResult.recall.total);
```

Session end reflection example:

```ts
const endResult = evermemory.sessionEnd({
  sessionId: 'sess-1',
  messageId: 'msg-2',
  inputText: '更正一下，先确认再执行。',
  actionSummary: '执行前确认',
  outcomeSummary: '用户确认通过',
});

console.log(endResult.reflection?.candidateRules ?? []);
```

## Tool surface

### `evermemory_store`
Input:
- `content`
- optional `type`
- optional `lifecycle`
- optional `scope`
- optional `source`
- optional `tags`
- optional `relatedEntities`

Call chain:
- tool -> `MemoryService.store()` -> deterministic write policy -> repository write or reject path

Return:
```ts
{
  accepted: boolean,
  reason: string,
  memory: MemoryItem | null,
}
```

Behavior:
- low-value chatter is rejected without throwing
- reject path returns an explicit `reason`
- tool and service now share the same single evaluation path

### `evermemory_recall`
Input:
- `query`
- optional `scope`
- optional `types`
- optional `lifecycles`
- optional `mode` (`structured` | `keyword` | `hybrid`)
- optional `limit`

Call chain:
- tool -> `RetrievalService.recall()` -> repository candidate fetch -> keyword retrieval

Return:
```ts
{
  items: MemoryItem[],
  total: number,
  limit: number,
}
```

Behavior:
- empty result is valid and non-exceptional
- supports `structured` / `keyword` / `hybrid` retrieval modes
- `hybrid` mode auto-falls back to `keyword` when semantic sidecar is disabled

### `evermemory_briefing`
Input:
- optional `sessionId`
- optional `scope`
- optional `tokenTarget`

Call chain:
- tool -> `BriefingService.build()` -> repository reads -> briefing persistence

Return:
- a `BootBriefing`

Behavior:
- empty memory still yields a valid structured briefing

### `evermemory_status`
Input:
- optional `userId`
- optional `sessionId`

Return:
```ts
{
  schemaVersion: number,
  databasePath: string,
  memoryCount: number,
  activeMemoryCount?: number,
  archivedMemoryCount?: number,
  semanticIndexCount?: number,
  profileCount?: number,
  experienceCount?: number,
  reflectionCount?: number,
  activeRuleCount?: number,
  countsByType: Partial<Record<MemoryType, number>>,
  countsByLifecycle: Partial<Record<MemoryLifecycle, number>>,
  latestBriefing?: {...},
  latestReflection?: {...},
  latestRule?: {...},
  latestProfile?: {...},
  latestWriteDecision?: {...},
  latestRetrieval?: {...},
  latestProfileRecompute?: {...},
  recentDebugByKind?: Record<string, number>,
  latestDebugEvents?: Array<{ kind: string, createdAt: string, entityId?: string }>,
  runtimeSession?: RuntimeSessionContext,
  recentDebugEvents: number,
}
```

Behavior:
- status uses repository-level count/countBy aggregation instead of coarse list-length counting
- status includes schema/debug snapshots for operator explainability
- designed for engineering/operator visibility, not a full UI

### `evermemory_intent`
Input:
- `message`
- optional `sessionId`
- optional `messageId`
- optional `scope`

Call chain:
- tool -> `IntentService.analyze()` -> heuristics -> optional LLM enrich/parser -> intent persistence

Return:
- an `IntentRecord`

### `evermemory_reflect`
Input:
- optional `sessionId`
- optional `mode` (`light` | `full`)

Call chain:
- tool -> `ReflectionService.reflect()` -> reflection persistence + candidate rule output

Return:
- reflection list
- candidate rules
- summary (`processedExperiences`, `createdReflections`)

### `evermemory_rules`
Input:
- optional `scope`
- optional `intentType`
- optional `channel`
- optional `contexts`
- optional `limit`

Call chain:
- tool -> `BehaviorService.getActiveRules()` -> applicability/ranking -> active rule list

Return:
- `rules` (sorted active rules)
- `total`
- `filters` (effective lookup filters)

### `evermemory_profile`
Input:
- optional `userId`
- optional `recompute`

Call chain:
- tool -> `ProfileProjectionService` -> projected profile recompute/read

Return:
```ts
{
  profile: ProjectedProfile | null,
  source: 'recomputed' | 'stored' | 'latest' | 'none',
}
```

Behavior:
- enforces `stable/derived` separation via profile projection service
- when `userId` is omitted, returns latest profile snapshot if available

### `evermemory_consolidate`
Input:
- optional `mode` (`light` | `daily` | `deep`)
- optional `scope`

Call chain:
- tool -> `MemoryService.consolidate()` -> lifecycle maintenance pass

Return:
```ts
{
  mode: 'light' | 'daily' | 'deep',
  processed: number,
  merged: number,
  archivedStale: number,
}
```

Behavior:
- executes manual dedupe/merge + stale episodic archive pass
- safe on empty datasets (returns zero counts)

### `evermemory_explain`
Input:
- optional `topic` (`write` | `retrieval` | `rule`)
- optional `entityId`
- optional `limit`

Call chain:
- tool -> debug events query -> structured explanation output

Return:
```ts
{
  topic: 'write' | 'retrieval' | 'rule',
  total: number,
  items: Array<{
    createdAt: string,
    kind: string,
    entityId?: string,
    question: string,
    answer: string,
    evidence: Record<string, unknown>,
  }>,
}
```

Behavior:
- provides explainability for write/retrieval/rule decisions
- defaults to `write` topic when omitted

### `evermemory_export`
Input:
- optional `scope`
- optional `includeArchived`
- optional `limit`

Call chain:
- tool -> `MemoryTransferService.exportSnapshot()` -> memory query -> snapshot artifact

Return:
```ts
{
  snapshot: {
    format: 'evermemory.snapshot.v1',
    generatedAt: string,
    total: number,
    items: MemoryItem[],
  },
  summary: {
    exported: number,
    includeArchived: boolean,
    scope?: MemoryScope,
  }
}
```

Behavior:
- exports deterministic snapshot artifacts from canonical store
- `includeArchived=false` by default to reduce noise in migration snapshots

### `evermemory_import`
Input:
- `snapshot` (`evermemory.snapshot.v1`)
- optional `mode` (`review` | `apply`)
- optional `approved`
- optional `allowOverwrite`
- optional `scopeOverride`

Call chain:
- tool -> `MemoryTransferService.importSnapshot()` -> review gate -> optional apply path

Return:
```ts
{
  mode: 'review' | 'apply',
  approved: boolean,
  applied: boolean,
  total: number,
  toCreate: number,
  toUpdate: number,
  imported: number,
  updated: number,
  rejected: Array<{ id?: string, reason: string }>,
}
```

Behavior:
- defaults to `review` mode (no writes)
- `apply` mode requires `approved=true`
- duplicate IDs are rejected unless `allowOverwrite=true`

### `evermemory_review`
Input:
- optional `scope`
- optional `query`
- optional `limit`
- optional `includeSuperseded`

Call chain:
- tool -> `MemoryArchiveService.reviewArchived()` -> archived memory query -> restore candidates

Return:
```ts
{
  total: number,
  candidates: Array<{
    id: string,
    content: string,
    type: MemoryType,
    lifecycle: MemoryLifecycle,
    scope: MemoryScope,
    updatedAt: string,
    supersededBy?: string,
    restoreEligible: boolean,
    reason?: string,
  }>,
}
```

Behavior:
- returns archived memory candidates for operator review
- superseded archive entries are hidden by default (`includeSuperseded=false`)

### `evermemory_restore`
Input:
- `ids`
- optional `mode` (`review` | `apply`)
- optional `approved`
- optional `targetLifecycle` (`working` | `episodic` | `semantic`)
- optional `allowSuperseded`

Call chain:
- tool -> `MemoryArchiveService.restoreArchived()` -> review gate -> optional apply path

Return:
```ts
{
  mode: 'review' | 'apply',
  approved: boolean,
  applied: boolean,
  total: number,
  restorable: number,
  restored: number,
  targetLifecycle: 'working' | 'episodic' | 'semantic',
  rejected: Array<{ id?: string, reason: string }>,
}
```

Behavior:
- defaults to `review` mode (no writes)
- `apply` mode requires `approved=true`
- superseded archived memories are blocked unless `allowSuperseded=true`

## Config

Default config:

```ts
{
  enabled: true,
  databasePath: '.openclaw/memory/evermemory/store/evermemory.db',
  bootTokenBudget: 1200,
  maxRecall: 8,
  debugEnabled: true,
  semantic: {
    enabled: false,
    maxCandidates: 200,
    minScore: 0.15
  },
  intent: {
    useLLM: false,
    fallbackHeuristics: true
  },
  retrieval: {
    keywordWeights: {
      keyword: 0.38,
      recency: 0.13,
      importance: 0.14,
      confidence: 0.12,
      explicitness: 0.08,
      scopeMatch: 0.07,
      typePriority: 0.05,
      lifecyclePriority: 0.03
    },
    hybridWeights: {
      keyword: 0.5,
      semantic: 0.35,
      base: 0.15
    }
  }
}
```

## Storage

Default database path:

```text
.openclaw/memory/evermemory/store/evermemory.db
```

Tables created by current migrations:
- `memory_items`
- `boot_briefings`
- `debug_events`
- `intent_records`
- `experience_logs`
- `reflection_records`
- `behavior_rules`
- `semantic_index`
- `projected_profiles`
- `schema_version`

## Operator notes

- Memory write decisions remain deterministic.
- Intent enrichment is optional and disabled by default (`intent.useLLM=false`).
- If LLM enrichment is enabled, parser/fallback protects runtime from malformed outputs.
- Reflection outputs in session-end flow can auto-promote into governed active behavior rules.
- Semantic sidecar indexing is optional and disabled by default.
- Duplicate/near-duplicate memory can be consolidated; stale episodic memory can be auto-archived.
- `session_start` creates a boot briefing and caches it in process memory.
- `session_start` / `message_received` both load applicable behavior rules into runtime context.
- Runtime session context is in-memory only and will not survive process restart.
- `evermemory_status` is intentionally minimal and engineering-oriented.
- Recall supports `structured` / `keyword` / `hybrid` modes (hybrid depends on optional semantic sidecar).
- Retrieval ranking weights are configurable (`retrieval.keywordWeights` / `retrieval.hybridWeights`) and auto-normalized.
- Lifecycle maintenance keeps active memory cleaner via dedupe/merge/archive baseline.
- Runtime interaction context now tracks the latest message intent and recalled items per session.
- import baseline is review-first and requires explicit approval before apply.
- archive restore baseline is review-first and requires explicit approval before apply.
- operator runbook: `docs/evermemory-operator-runbook.md`
- troubleshooting guide: `docs/evermemory-troubleshooting.md`

## Environment health

Use Node `22.x` (see `.nvmrc`) and run:

```bash
npm run doctor
```

If native SQLite probe fails (including `SIGSEGV`), run:

```bash
npm rebuild better-sqlite3
```

## Validation

Build and type-check:

```bash
npm run check
npm run build
```

Run unit tests (without environment doctor gate):

```bash
npm run test
```

Run full validation (environment + type-check + tests):

```bash
npm run validate
```

Run real OpenClaw smoke test (plugin loaded + store/recall + DB evidence):

```bash
npm run test:openclaw:smoke
```

Notes:
- Requires local OpenClaw gateway running and `evermemory` plugin loaded.
- Uses default DB path `/root/.openclaw/memory/evermemory/store/evermemory.db` unless `EVERMEMORY_DB_PATH` is set.

## OpenClaw integration (real host wiring)

This repository now provides native OpenClaw plugin assets:

- `openclaw.plugin.json`
- root `index.js` (exports `dist/openclaw/plugin.js`)
- package manifest `openclaw.extensions`

### Minimal OpenClaw config

Use an absolute path for stable loading:

```json
{
  "plugins": {
    "load": {
      "paths": [
        "/root/.openclaw/workspace/projects/evermemory"
      ]
    },
    "entries": {
      "evermemory": {
        "enabled": true,
        "config": {
          "databasePath": "/root/.openclaw/memory/evermemory/store/evermemory.db",
          "maxRecall": 8,
          "debugEnabled": true
        }
      }
    },
    "slots": {
      "memory": "evermemory"
    }
  }
}
```

Then restart gateway:

```bash
openclaw gateway restart
```

Compatibility aliases provided:

- `memory_store` -> `evermemory_store`
- `memory_recall` -> `evermemory_recall`

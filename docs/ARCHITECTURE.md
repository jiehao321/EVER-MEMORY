# EverMemory Technical Architecture

EverMemory is a deterministic memory plugin for OpenClaw. It provides knowledge storage, recall, behavior rule governance, and user profile projection through reliable, explainable, and rollback-safe workflows.

**Version:** 1.0.4
**Runtime:** Node.js 22.x, TypeScript strict ESM
**Storage:** SQLite WAL via better-sqlite3
**Validation:** TypeBox schemas

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Core Data Model](#2-core-data-model)
3. [Storage Layer](#3-storage-layer)
4. [Retrieval Pipeline](#4-retrieval-pipeline)
5. [Lifecycle Hooks](#5-lifecycle-hooks)
6. [Embedding System](#6-embedding-system)
7. [Behavior Rule Lifecycle](#7-behavior-rule-lifecycle)
8. [Profile Projection](#8-profile-projection)
9. [Schema Versions](#9-schema-versions)

---

## 1. System Overview

EverMemory follows a layered architecture. Each layer depends only on the layer directly below it, enforcing clear separation of concerns and enabling independent testing.

```
+---------------------------------------------------------------+
|                       OpenClaw Host                           |
|  (Agent runtime — manages sessions, messages, tool dispatch)  |
+---------------------------------------------------------------+
        |                    |                    |
        v                    v                    v
+---------------+  +------------------+  +------------------+
|   Lifecycle   |  |   Tool Surface   |  |  Plugin Adapter  |
|    Hooks      |  |  (16 commands)   |  | (src/openclaw/)  |
| (src/hooks/)  |  |  (src/tools/)    |  |                  |
+---------------+  +------------------+  +------------------+
        |                    |                    |
        +--------------------+--------------------+
                             |
                             v
+---------------------------------------------------------------+
|                        Core Services                          |
|  memory/  behavior/  briefing/  intent/  reflection/          |
|  profile/  analytics/  io/  policy/  setup/                   |
|                       (src/core/)                             |
+---------------------------------------------------------------+
        |                    |
        v                    v
+-------------------+  +--------------------+
|  Retrieval Layer  |  |  Embedding Layer   |
| (src/retrieval/)  |  |  (src/embedding/)  |
| strategies/       |  |  local / openai /  |
| keyword, semantic |  |  none providers    |
+-------------------+  +--------------------+
        |                    |
        +--------------------+
                 |
                 v
+---------------------------------------------------------------+
|                       Storage Layer                           |
|  SQLite WAL  |  Idempotent Migrations  |  Repositories       |
|  db.ts  migrations.ts  memoryRepo.ts  behaviorRepo.ts  ...   |
|                     (src/storage/)                            |
+---------------------------------------------------------------+
```

### Source Directory Map

| Directory | Responsibility |
|-----------|---------------|
| `src/core/` | Core domain services: memory management, behavior rules, briefing generation, intent analysis, reflection, profile projection, analytics, import/export, policy enforcement, setup |
| `src/retrieval/` | Retrieval service and strategy implementations (keyword, semantic, hybrid) |
| `src/embedding/` | Embedding provider abstraction with local and OpenAI implementations |
| `src/storage/` | SQLite database access, idempotent migrations, and typed repository classes |
| `src/hooks/` | OpenClaw lifecycle hook handlers (sessionStart, messageReceived, sessionEnd, beforeAgentStart) |
| `src/openclaw/` | Plugin adapter binding EverMemory to the OpenClaw plugin interface |
| `src/tools/` | 16 tool implementations exposed to the agent (store, recall, rules, briefing, status, import/export, profile, etc.) |
| `src/types/` | TypeScript type definitions and TypeBox schemas |
| `src/runtime/` | Runtime context management |
| `src/util/` | Shared utility functions |

### Initialization

The entry point `src/index.ts` exports `initializeEverMemory()`, which performs the following sequence:

1. Opens the SQLite database with WAL mode enabled.
2. Runs idempotent migrations (schema versions 1 through 9).
3. Instantiates all repository classes against the database handle.
4. Creates core service instances, wiring repositories and configuration.
5. Returns a unified API object exposing all tool methods and lifecycle hooks.

---

## 2. Core Data Model

### MemoryItem

The fundamental unit of stored knowledge.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `content` | string | The knowledge content |
| `type` | enum | One of 11 types classifying the memory (fact, preference, experience, observation, instruction, context, relationship, skill, goal, constraint, meta) |
| `lifecycle` | enum | Storage tier: `working`, `episodic`, `semantic`, `archive` |
| `scope` | string | Visibility scope (session, project, global) |
| `source` | string | Origin of the memory (user, agent, system) |
| `tags` | string[] | Categorical labels for filtering |
| `confidence` | number | Confidence score (0.0 - 1.0) |
| `importance` | number | Importance weight (0.0 - 1.0) |
| `explicitness` | number | How explicitly the user stated this (0.0 - 1.0) |
| `createdAt` | string | ISO timestamp of creation |
| `updatedAt` | string | ISO timestamp of last modification |

### BehaviorRule

Governs agent behavior based on learned patterns.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `category` | string | Rule category |
| `pattern` | string | Trigger pattern |
| `response` | string | Prescribed agent behavior |
| `lifecycle` | object | Governance state (see section 7) |
| `lifecycle.level` | enum | `candidate`, `active`, `frozen`, `deprecated` |
| `lifecycle.maturity` | number | Maturity score |
| `lifecycle.confidence` | number | Confidence score |
| `evidence` | object[] | Supporting evidence records |
| `tags` | string[] | Categorical labels |

### IntentRecord

Captures analyzed user intent from a message.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `rawText` | string | Original user message |
| `intent` | object | Classified intent |
| `intent.type` | string | Primary intent type |
| `intent.subtype` | string | Intent subtype |
| `intent.confidence` | number | Classification confidence |
| `signals` | object | Contextual signals |
| `signals.urgency` | number | Urgency level |
| `signals.emotionalTone` | string | Detected emotional tone |
| `signals.actionNeed` | number | How much the intent requires action |
| `signals.memoryNeed` | number | How much the intent requires memory recall |
| `entities` | object[] | Extracted entities |
| `retrievalHints` | object | Hints for the retrieval pipeline |

### ReflectionRecord

Captures post-session reflections and lessons learned.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `triggerKind` | string | What triggered the reflection |
| `confidence` | number | Confidence in the reflection |
| `lessons` | object[] | Extracted lessons |
| `createdAt` | string | ISO timestamp |

### ProjectedProfile

Represents the user profile as a combination of stable facts and inferred hints.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `stableFields` | object | Canonical fields explicitly collected via onboarding |
| `derivedHints` | object | Weak hints inferred from interaction history (marked `weak_hint_only`) |
| `updatedAt` | string | ISO timestamp of last recomputation |

---

## 3. Storage Layer

### SQLite with WAL Mode

EverMemory uses SQLite in Write-Ahead Logging (WAL) mode via the `better-sqlite3` driver. WAL mode provides:

- Concurrent read access during writes.
- Crash resilience with automatic recovery.
- Deterministic, single-file storage suitable for plugin deployment.

### Tables

| Table | Data Model | Introduced |
|-------|-----------|------------|
| `memory_items` | MemoryItem | Schema v1 |
| `boot_briefings` | Briefing snapshots | Schema v2 |
| `debug_events` | Debug/audit log entries | Schema v3 |
| `intent_records` | IntentRecord | Schema v4 |
| `experience_records` | Experience capture data | Schema v5 |
| `reflection_records` | ReflectionRecord | Schema v6 |
| `behavior_rules` | BehaviorRule | Schema v7 |
| `semantic_vectors` | Embedding vectors for semantic search | Schema v8 |
| `projected_profiles` | ProjectedProfile | Schema v9 |

### Idempotent Migrations

Migrations are defined in `src/storage/migrations.ts` and executed during initialization. Each migration:

1. Checks whether it has already been applied (idempotent guard).
2. Creates or alters the target table within a transaction.
3. Records the migration version in a metadata table.

This design ensures that EverMemory can be upgraded in place without data loss and that any migration can safely be re-run.

### Repository Classes

Each table is accessed through a dedicated typed repository:

- `memoryRepo.ts` — CRUD for memory items, lifecycle transitions, tag queries.
- `behaviorRepo.ts` — Rule storage, promotion, freeze, deprecation.
- `briefingRepo.ts` — Briefing snapshot persistence.
- `debugRepo.ts` — Debug event logging and retrieval.
- `experienceRepo.ts` — Experience capture records.
- `intentRepo.ts` — Intent analysis records.
- `profileRepo.ts` — Profile projection storage and retrieval.
- `reflectionRepo.ts` — Reflection records.
- `semanticRepo.ts` — Embedding vector storage and nearest-neighbor queries.

All repositories follow a consistent interface pattern with `findAll`, `findById`, `create`, `update`, and `delete` operations where applicable.

---

## 4. Retrieval Pipeline

The retrieval pipeline is managed by `RetrievalService` in `src/retrieval/service.ts` and supports three modes.

### Strategies

| Strategy | Location | Description |
|----------|----------|-------------|
| **Structured** | Built into service | Direct database queries using filters (type, tags, scope, lifecycle) |
| **Keyword** | `src/retrieval/strategies/keyword/` | Text-based search with tokenization and relevance scoring |
| **Semantic** | `src/retrieval/strategies/semantic/` | Vector similarity search using stored embeddings |

### Hybrid Mode

Hybrid retrieval combines keyword and semantic results using configurable weights:

```
finalScore = (keywordWeight * keywordScore) + (semanticWeight * semanticScore)
```

Weights are configurable at initialization and can be adjusted per query. When semantic embeddings are unavailable (provider set to `none` or degraded), hybrid mode falls back gracefully to keyword-only scoring.

### Scoring and Ranking

Results from each strategy are normalized to a 0.0-1.0 range, combined according to mode weights, and returned in descending score order. The retrieval service also applies:

- Lifecycle filtering (excludes archived items by default).
- Confidence thresholds (configurable minimum confidence).
- Deduplication across strategies.

### Semantic Sidecar

Semantic retrieval operates as an optional sidecar. When an embedding provider is available, new memory items are automatically embedded and stored in the `semantic_vectors` table. When no provider is configured, the system operates in keyword/structured mode only with no degradation of core functionality.

---

## 5. Lifecycle Hooks

EverMemory integrates with the OpenClaw host through four lifecycle hooks, defined in `src/hooks/`.

### Hook Flow

```
Session Start                Message Loop                    Session End
     |                           |                               |
     v                           v                               v
sessionStart()           messageReceived()                 sessionEnd()
     |                           |                               |
     |-- Generate briefing       |-- Analyze intent              |-- Capture experience
     |-- Load active rules       |-- Match behavior rules        |-- Run reflection
     |-- Inject profile          |-- Execute retrieval            |-- Promote rules
     |   context                 |-- Inject semantic context      |-- Recompute profile
     v                           v                               |-- Run housekeeping
  Ready                    Response enriched                      v
                                                            Session closed
```

### sessionStart

Triggered when a new session begins. Responsibilities:

1. **Briefing generation** — Compiles a boot briefing from recent memories, active rules, and profile data. This briefing is injected into the agent's initial context.
2. **Rule loading** — Fetches all behavior rules with `active` lifecycle level and prepares them for pattern matching.
3. **Profile injection** — Loads the projected profile and injects stable fields and relevant derived hints into the session context.

### messageReceived

Triggered on each incoming user message. Responsibilities:

1. **Intent analysis** — Classifies the message into intent type/subtype with confidence scoring, extracts entities, and computes contextual signals (urgency, emotional tone, action need, memory need).
2. **Behavior rule matching** — Evaluates active rules against the current message and intent signals. Matched rules influence the agent's response.
3. **Retrieval** — Executes the configured retrieval strategy (structured, keyword, hybrid) using intent-derived retrieval hints.
4. **Semantic injection** — When relevant memories are retrieved, they are injected into the agent's context for the current turn.

### sessionEnd

Triggered when a session closes. Responsibilities:

1. **Experience capture** — Records notable interactions from the session as experience records.
2. **Reflection** — Analyzes the session for lessons learned, generating reflection records.
3. **Rule promotion** — Evaluates candidate rules for promotion to active status (see section 7).
4. **Profile recomputation** — Updates derived profile hints based on new session data.
5. **Housekeeping** — Performs maintenance tasks such as lifecycle transitions for stale working memories.

### beforeAgentStart

Triggered before the agent runtime initializes. Used for pre-flight setup and validation.

---

## 6. Embedding System

The embedding system provides vector representations of memory content for semantic retrieval. It is implemented in `src/embedding/` with a provider abstraction that supports graceful degradation.

### Provider Architecture

```
EmbeddingManager (src/embedding/manager.ts)
     |
     |-- selects provider based on configuration
     |
     +-- LocalProvider  (src/embedding/local.ts)
     |     Model: @xenova/transformers (all-MiniLM-L6-v2)
     |     Runs entirely in-process, no external API calls
     |
     +-- OpenAIProvider (src/embedding/openai.ts)
     |     Calls OpenAI embeddings API
     |     Requires API key configuration
     |
     +-- NoneProvider   (src/embedding/provider.ts)
           No-op provider, disables semantic features
```

### Provider Selection

The `EmbeddingManager` selects a provider based on configuration:

1. If `embedding.provider` is set to `"local"`, the local Xenova transformer model is loaded.
2. If set to `"openai"`, the OpenAI provider is initialized with the configured API key.
3. If set to `"none"` or omitted, semantic features are disabled.

### Graceful Degradation

The embedding system is designed to never block core functionality:

- If the local model fails to load (missing dependency, insufficient memory), the manager falls back to `none`.
- If the OpenAI API is unreachable, the manager falls back to `none`.
- When operating in `none` mode, memory storage and keyword retrieval continue to function normally. Only semantic retrieval is unavailable.
- Degradation events are logged to the debug events table for operator visibility.

### Vector Storage

Embeddings are stored in the `semantic_vectors` table, keyed by memory item ID. When a memory item is created or updated, the manager generates an embedding (if a provider is available) and upserts it into the table. The semantic retrieval strategy performs nearest-neighbor queries against this table using cosine similarity.

---

## 7. Behavior Rule Lifecycle

Behavior rules follow a governed lifecycle that ensures only well-evidenced patterns influence agent behavior.

### Lifecycle States

```
                  confidence >= 0.85
                  evidence >= 2
  [candidate] -----------------------> [active]
       ^                                  |
       |                                  |-- manual freeze
       |                                  v
       |                              [frozen]
       |                                  |
       |                                  |-- manual deprecate
       |                                  v
       +--- rollback <-------------- [deprecated]
```

| State | Description |
|-------|-------------|
| `candidate` | Newly extracted from reflections. Not yet influencing agent behavior. |
| `active` | Promoted after meeting confidence and evidence thresholds. Actively matched against incoming messages. |
| `frozen` | Manually suspended by operator or governance action. Not matched, but retained for potential reactivation. |
| `deprecated` | Permanently retired. Retained for audit purposes. |

### Promotion Criteria

A candidate rule is promoted to `active` when both conditions are met:

- **Confidence** >= 0.85 — The rule's confidence score, derived from supporting evidence quality.
- **Evidence** >= 2 — At least two independent evidence records support the rule.

Promotion is evaluated during the `sessionEnd` hook.

### Decay Scoring

Active rules are subject to decay scoring to prevent stale rules from persisting indefinitely:

- Rules that have not been matched within a configurable window receive a decaying confidence adjustment.
- When confidence drops below the promotion threshold, the rule is flagged for operator review.
- Operators can freeze, deprecate, or refresh a rule through governance tools.

### Governance Actions

Operators can perform the following governance actions via the rules tool:

- **Freeze** — Suspend an active rule without deleting it.
- **Deprecate** — Permanently retire a rule.
- **Rollback** — Revert a rule to candidate status for re-evaluation.
- **Refresh** — Reset decay counters on a still-relevant rule.

All governance actions are logged for audit trail purposes.

---

## 8. Profile Projection

Profile projection maintains a model of the user by combining explicitly provided information with interaction-derived inferences.

### Two-Tier Architecture

| Tier | Name | Source | Trust Level |
|------|------|--------|-------------|
| 1 | **Stable canonical fields** | Explicitly collected via onboarding or direct user statements | High — treated as ground truth |
| 2 | **Derived weak hints** | Inferred from interaction history, memory patterns, and behavioral signals | Low — marked as `weak_hint_only` |

### Guardrails

The profile system enforces strict guardrails to prevent overconfident inferences:

1. **Weak hint annotation** — All derived fields carry a `weak_hint_only` marker, ensuring downstream consumers know the data is inferred rather than confirmed.
2. **No promotion without confirmation** — Derived hints are never automatically promoted to stable fields. Only explicit user confirmation can elevate a hint.
3. **Decay on contradiction** — If new evidence contradicts a derived hint, the hint's confidence is reduced or the hint is removed.
4. **Operator visibility** — The profile tool exposes both tiers clearly, allowing operators to inspect, correct, or remove any field.

### Cross-Project Transfer

Profile data supports cross-project transfer for global constraints:

- Stable canonical fields are transferable across projects by default.
- Derived hints are project-scoped unless explicitly marked as global.
- Transfer respects the `weak_hint_only` annotation, ensuring receiving projects do not treat inferred data as confirmed.

### Recomputation

Profile recomputation occurs during the `sessionEnd` hook:

1. New session data is analyzed for profile-relevant signals.
2. Derived hints are recalculated against the full interaction history.
3. Stable fields are checked for consistency with new data (contradictions are flagged).
4. The updated profile is persisted to the `projected_profiles` table.

---

## 9. Schema Versions

EverMemory's database schema has evolved through 9 versions, each corresponding to a development phase.

| Version | Phase | Changes |
|---------|-------|---------|
| 1 | Phase 1 | Initial schema. Created `memory_items` table with core fields (content, type, lifecycle, scope, source, tags, confidence, importance, explicitness, timestamps). |
| 2 | Phase 2 | Added `boot_briefings` table for session briefing snapshots. |
| 3 | Phase 3 | Added `debug_events` table for audit logging and operational diagnostics. |
| 4 | Phase 4 | Added `intent_records` table for storing analyzed user intents, signals, entities, and retrieval hints. |
| 5 | Phase 5 | Added `experience_records` table for capturing notable session interactions. |
| 6 | Phase 6 | Added `reflection_records` table for post-session reflection and lesson extraction. |
| 7 | Phase 7 | Added `behavior_rules` table with full lifecycle governance (candidate, active, frozen, deprecated), evidence tracking, and decay scoring. |
| 8 | Phase 7+ | Added `semantic_vectors` table for embedding storage, enabling semantic retrieval as an optional sidecar. |
| 9 | Phase 7+ | Added `projected_profiles` table for two-tier user profile projection (stable fields and derived hints). |

All migrations are forward-only and idempotent. The current schema version is **9**.

# EverMemory - Technical Design Specification

**Version:** 1.0.0-draft  
**Status:** Draft for review  
**Date:** 2026-03-11  
**Scope:** New OpenClaw plugin system for persistent agent memory  
**Language:** English (system name and spec)  

---

## 1. Executive Summary

EverMemory is a new OpenClaw memory plugin system designed to provide **persistent, structured, reviewable, and evolvable memory** for agents across sessions.

It is created as a clean restart based on lessons from the previous NiuMa Memory design work, but with a tighter scope and clearer boundaries.

### Core principle

EverMemory is **memory infrastructure**, not the entire agent brain.

It is responsible for:
- capturing durable memory signals,
- normalizing and storing them,
- retrieving relevant memory,
- compressing and consolidating old context,
- managing lifecycle and forgetting,
- exposing memory safely to the agent runtime.

It is **not** primarily responsible for:
- full reply generation,
- general intent orchestration,
- broad analytics dashboards,
- personality simulation as a core subsystem.

Those may consume EverMemory, but they are not the plugin’s core responsibility.

---

## 2. Problem Statement

OpenClaw agents face several persistent memory problems:

1. **Session discontinuity**  
   After restart or context reset, the agent loses continuity.

2. **Repeated questioning**  
   The agent asks for the same preferences, facts, and constraints repeatedly.

3. **Weak decision traceability**  
   Past decisions, commitments, and instructions are not easy to retrieve reliably.

4. **Context bloat**  
   Raw conversation history accumulates faster than it can be meaningfully reused.

5. **No governance layer**  
   Systems often store too much, too little, or the wrong things.

EverMemory exists to solve these problems with a governed memory lifecycle.

---

## 3. Product Goals

### 3.1 Primary goals

1. **Persistent continuity**  
   Preserve useful cross-session memory.

2. **Structured storage**  
   Store memory as typed records rather than raw undifferentiated logs.

3. **Governed memory writes**  
   Make memory writes selective, explicit, and confidence-aware.

4. **Relevant retrieval**  
   Return the right memory at the right time with minimal noise.

5. **Lifecycle management**  
   Support promotion, summarization, archive, overwrite, and forgetting.

6. **Human-auditable design**  
   Keep the system inspectable and debuggable.

### 3.2 Non-goals (v1)

EverMemory v1 will **not** try to fully solve:
- agent reply generation,
- complex knowledge graphs,
- multi-user shared memory networks,
- autonomous self-improvement loops,
- broad business observability suites,
- cloud synchronization.

---

## 4. Design Principles

### 4.1 Boundary first
Memory should be a platform capability, not a catch-all intelligence layer.

### 4.2 Durable facts must be conservative
The system should prefer **missing a write** over **writing a wrong long-term fact**.

### 4.3 Type and lifecycle are separate dimensions
A memory’s **type** is not the same as its **retention level**.

### 4.4 Derived profile is not source-of-truth
Stable memory records are canonical. Profile summaries are projections derived from them.

### 4.5 Progressive sophistication
Start with reliable memory capture and retrieval. Add fancy ranking and inference later.

### 4.6 Human inspectability
Important memory artifacts should remain reviewable and understandable.

---

## 5. System Boundaries

## 5.1 In scope
EverMemory v1 includes:
- memory capture policy,
- memory normalization,
- memory storage,
- memory retrieval,
- boot briefing,
- background consolidation,
- archive/forget logic,
- profile projection,
- plugin tool APIs.

## 5.2 Out of scope
EverMemory v1 excludes:
- final answer generation,
- channel-specific output formatting,
- generalized intent routing,
- autonomous strategy planning,
- external SaaS connectors,
- graph-native reasoning engines.

---

## 6. Terminology

### Memory Item
A structured unit of remembered information.

### Type
What kind of memory it is.
Examples: fact, preference, decision, commitment.

### Lifecycle Level
How the memory is retained and used over time.
Examples: working, episodic, semantic, archive.

### Promotion
Movement of memory from a shorter-lived level to a longer-lived level.

### Projection
A derived summary view built from canonical memory records.

### Evidence
The source material or source reference supporting a memory item.

---

## 7. Conceptual Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                        EverMemory                            │
├──────────────────────────────────────────────────────────────┤
│ Ingestion Layer                                              │
│  - hook listeners                                            │
│  - explicit save tool                                         │
│  - capture policy                                             │
├──────────────────────────────────────────────────────────────┤
│ Normalization Layer                                          │
│  - type classification                                        │
│  - confidence scoring                                         │
│  - dedupe / merge checks                                      │
│  - evidence linkage                                           │
├──────────────────────────────────────────────────────────────┤
│ Storage Layer                                                │
│  - canonical memory store                                     │
│  - profile projections                                        │
│  - summaries                                                  │
│  - archive                                                    │
├──────────────────────────────────────────────────────────────┤
│ Retrieval Layer                                              │
│  - keyword retrieval                                          │
│  - semantic retrieval                                         │
│  - hybrid ranking                                             │
│  - policy weighting                                           │
├──────────────────────────────────────────────────────────────┤
│ Lifecycle Layer                                              │
│  - promotion                                                  │
│  - overwrite/supersede                                        │
│  - summarization                                              │
│  - forgetting/archive                                         │
├──────────────────────────────────────────────────────────────┤
│ Runtime Interface Layer                                      │
│  - boot briefing                                              │
│  - recall tool                                                │
│  - status/debug tools                                         │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Memory Model

EverMemory uses **two orthogonal dimensions**:

1. **Memory Type** — what the memory is
2. **Lifecycle Level** — how long and where it lives

This separation is foundational.

### 8.1 Memory types

Initial supported types:
- `identity`
- `fact`
- `preference`
- `decision`
- `commitment`
- `relationship`
- `task`
- `project`
- `style`
- `summary`

### 8.2 Lifecycle levels

- `working` — short-lived, current session / immediate context
- `episodic` — recent experiences and interaction history
- `semantic` — durable stable knowledge
- `archive` — cold storage, recoverable but not actively loaded

### 8.3 Memory item schema

```ts
interface MemoryItem {
  id: string;
  content: string;
  type: MemoryType;
  lifecycle: MemoryLifecycle;

  source: {
    kind: 'message' | 'tool' | 'manual' | 'summary' | 'inference';
    sessionId?: string;
    messageId?: string;
    channel?: string;
    actor?: 'user' | 'assistant' | 'system';
  };

  confidence: number;      // confidence in correctness
  importance: number;      // importance to future usefulness
  explicitness: number;    // how directly the user stated it

  timestamps: {
    createdAt: string;
    updatedAt: string;
    lastAccessedAt?: string;
  };

  state: {
    active: boolean;
    archived: boolean;
    supersededBy?: string;
  };

  evidence: {
    excerpt?: string;
    references?: string[];
  };

  tags: string[];
  relatedEntities: string[];
  scope: {
    userId?: string;
    chatId?: string;
    project?: string;
  };

  stats: {
    accessCount: number;
    retrievalCount: number;
  };
}
```

### 8.4 Canonicality rules

Not all stored records are equal.

Priority order:
1. Explicit user statements
2. Repeated stable observations
3. Confirmed summaries
4. Weak inferences

Weak inferences must not silently override explicit facts.

---

## 9. Memory Governance

This is the most important subsystem in the design.

## 9.1 Write policy

A memory write should answer:
- Is this worth remembering?
- What type is it?
- What lifecycle does it start in?
- How confident are we?
- What evidence supports it?

### 9.1.1 Auto-write categories

Safe auto-write candidates:
- explicit preferences,
- explicit identity facts,
- explicit constraints,
- clear decisions,
- explicit commitments,
- stable project state updates,
- useful conversation summaries.

### 9.1.2 Episodic-first categories

Should default to episodic before semantic promotion:
- inferred preferences,
- working task context,
- repeated but not yet stable habits,
- interaction style observations,
- inferred project assumptions.

### 9.1.3 Do-not-store-long-term categories

Should not enter semantic memory by default:
- generic small talk,
- one-off emotional bursts,
- temporary operational details,
- low-confidence guesses,
- repetitive acknowledgements,
- raw chatter without future value.

## 9.2 Promotion policy

Promotion from episodic → semantic should require at least one of:
- explicit user request to remember,
- repeated occurrence across sessions,
- decision/constraint with ongoing relevance,
- high confidence and strong evidence,
- manual confirmation.

## 9.3 Overwrite and supersede policy

When new information conflicts with old:
- never hard-delete immediately,
- mark older record as superseded,
- preserve evidence chain,
- prefer explicit recent user statements over inferred past memory.

## 9.4 Forgetting policy

A memory may be archived or forgotten when:
- it is stale and low-value,
- it has been superseded,
- it has not been accessed for a long time,
- it is clearly temporary context,
- retention policy requires cleanup.

## 9.5 Privacy policy

Sensitive memory should default to stricter retention and narrower scope.
Potential future extension: memory sensitivity classes.

---

## 10. Capture and Ingestion Design

### 10.1 Capture sources

1. `session_start` hook
2. `message_received` hook
3. `context_compact` hook
4. `session_end` hook
5. `heartbeat` / scheduled consolidation
6. explicit tool calls (`evermemory_store`)

### 10.2 Capture modes

#### Passive capture
Triggered by hooks and filtered by write policy.

#### Explicit capture
When user says “remember this” or a tool explicitly stores memory.

#### Consolidated capture
Generated by summarization jobs from raw episodic content.

### 10.3 Ingestion pipeline

```text
Raw input
  → eligibility check
  → candidate extraction
  → type classification
  → confidence scoring
  → duplicate/conflict check
  → lifecycle assignment
  → persistence
```

### 10.4 Candidate extraction

v1 should keep extraction modest and reliable.

Candidate classes:
- named preferences,
- rules/constraints,
- commitments,
- key decisions,
- stable facts,
- active tasks,
- concise summaries.

---

## 11. Retrieval Design

### 11.1 Retrieval objectives

The goal is not “retrieve the most semantically similar text.”
The goal is:
- retrieve the **most useful memory for this moment**,
- with low noise,
- with stable ranking behavior.

### 11.2 Retrieval modes

#### Boot retrieval
Used at session start to build continuity.

#### Query-driven retrieval
Used when a user message or tool request needs memory.

#### Targeted retrieval
Used for specific memory classes such as preferences or decisions.

### 11.3 Retrieval pipeline

```text
Input query
  → retrieval strategy selection
  → keyword search
  → semantic search
  → merge and score
  → policy weighting
  → dedupe
  → top-k results
```

### 11.4 Ranking signals

Proposed score dimensions:
- semantic relevance
- keyword relevance
- recency
- importance
- confidence
- explicitness
- type priority
- scope match
- source reliability

### 11.5 Initial ranking formula

```text
final_score =
  semantic_score
+ keyword_score
+ recency_weight
+ importance_weight
+ confidence_weight
+ explicitness_weight
+ type_priority
+ scope_match
```

### 11.6 Retrieval strategy policy

Examples:
- short factual query → keyword-heavy
- conceptual user question → hybrid
- preference recall → preference-first filters
- “what did I say before?” → decision/project/recency weighted retrieval

---

## 12. Boot Protocol

The plugin should not dump all memory into context at startup.
It should load the **minimum useful continuity set**.

### 12.1 Boot layers

#### Boot Layer 0: identity and hard constraints
- assistant identity
- user name / preferred address
- critical user constraints
- channel/runtime constraints

#### Boot Layer 1: recent continuity
- active tasks
- unresolved commitments
- recent key events
- last known project focus

#### Boot Layer 2: targeted first-message recall
- retrieve memory relevant to the first user message of the new session

#### Boot Layer 3: on-demand recall only
- everything else remains retrievable but unloaded

### 12.2 Boot briefing target

A boot briefing should be:
- concise,
- structured,
- low-noise,
- under configurable token budget.

Suggested sections:
- identity / address
- active constraints
- current projects
- recent continuity
- important durable memories

---

## 13. Profile Projection Design

Profiles are **derived summaries**, not canonical truth.

### 13.1 Stable profile fields

Can be directly sourced from canonical memory:
- display name
- preferred form of address
- timezone
- explicit preferences
- durable constraints

### 13.2 Derived profile fields

Must be tagged as inferred / recomputable:
- communication style tendency
- active hours tendency
- likely interests
- probable work patterns

### 13.3 Projection rules

Every derived profile field should track:
- source memory ids,
- confidence,
- last recompute time.

---

## 14. Summarization and Consolidation

This is where old context becomes usable memory.

### 14.1 Consolidation goals

1. Remove noise
2. Compress repetition
3. Promote durable facts
4. Preserve traceability

### 14.2 Consolidation jobs

#### Job A: dedupe and merge
- identify near-duplicate memories
- merge where safe
- preserve evidence

#### Job B: episodic summarization
- summarize old conversation fragments into event-like records

#### Job C: promotion review
- move strong episodic items into semantic

#### Job D: stale archive
- move low-value stale items to archive

### 14.3 Consolidation cadence

Possible defaults:
- lightweight cleanup: hourly or on heartbeat
- summarization: daily
- archive sweep: daily or weekly

---

## 15. Storage Design

### 15.1 Storage philosophy

Canonical memory should be structured and durable.
Readable artifacts should exist where helpful.

### 15.2 Proposed storage structure

```text
~/.openclaw/memory/evermemory/
├── store/
│   ├── memory.db              # canonical persistent store
│   ├── memory.db-wal
│   └── memory.db-shm
├── projections/
│   ├── profiles/
│   │   └── {user_id}.json
│   └── boot/
│       └── {session_id}.json
├── summaries/
│   ├── daily/
│   └── sessions/
├── archive/
│   ├── by-month/
│   └── tombstones/
└── debug/
    ├── writes.jsonl
    ├── promotions.jsonl
    └── retrievals.jsonl
```

### 15.3 Storage backend recommendation

For v1:
- canonical store: SQLite
- optional semantic index: SQLite extension or sidecar vector index
- projections: JSON
- summaries/debug artifacts: JSONL/Markdown as needed

Reasoning:
- local,
- inspectable,
- operationally simple,
- good enough for v1.

### 15.4 Why not start with a graph DB

Graph DB adds complexity too early.
EverMemory v1 should use relational + metadata links first.

---

## 16. Minimal Relation Layer

Instead of a full knowledge graph, v1 uses lightweight relations:
- `relatedEntities`
- `relatedMemoryIds`
- `scope.project`
- `scope.userId`
- `scope.chatId`

This gives most of the practical value without full graph complexity.

---

## 17. API and Tool Surface

### 17.1 Core tools

```ts
// store an explicit memory
async function evermemory_store(input: {
  content: string;
  type?: MemoryType;
  lifecycle?: MemoryLifecycle;
  importance?: number;
  confidence?: number;
  tags?: string[];
  scope?: Record<string, any>;
}): Promise<{ id: string }>;

// recall memory
async function evermemory_recall(input: {
  query: string;
  types?: MemoryType[];
  lifecycles?: MemoryLifecycle[];
  limit?: number;
}): Promise<MemoryItem[]>;

// boot briefing
async function evermemory_briefing(input?: {
  sessionId?: string;
  budgetTokens?: number;
}): Promise<BootBriefing>;

// profile projection
async function evermemory_profile(input?: {
  userId?: string;
}): Promise<ProjectedProfile>;

// status / debug
async function evermemory_status(): Promise<MemorySystemStatus>;

// maintenance
async function evermemory_consolidate(input?: {
  mode?: 'light' | 'daily' | 'deep';
}): Promise<ConsolidationReport>;
```

### 17.2 Future tools (not v1 core)
- conflict review
- archive restore
- memory explainability
- relationship query

---

## 18. Hook Integration

### 18.1 Hook responsibilities

#### `session_start`
- build boot briefing
- load minimal continuity

#### `message_received`
- evaluate write candidates
- optionally trigger targeted recall

#### `context_compact`
- preserve high-value in-flight context
- generate session summary candidates

#### `session_end`
- finalize episodic summary
- flush deferred writes

#### `heartbeat`
- run cleanup/promotions if configured

---

## 19. Conflict Handling

Conflicts are normal and must be modeled.

### 19.1 Conflict classes
- preference changed
- task status changed
- decision reversed
- inferred fact contradicted by explicit fact

### 19.2 Conflict resolution rules
- explicit beats inferred
- recent explicit beats older explicit when same scope
- project-specific fact does not automatically override global fact
- supersede rather than delete

---

## 20. Security and Safety Considerations

### 20.1 Risks
- storing wrong long-term facts
- storing sensitive data too broadly
- retrieval contamination from low-quality memory
- cross-scope leakage
- opaque memory mutation

### 20.2 Safety controls
- conservative semantic promotion
- scope-aware retrieval filters
- evidence-preserving writes
- debug logs for mutation visibility
- archive rather than destructive delete by default

---

## 21. Performance Design

### 21.1 v1 priorities
Performance priorities should be ordered as:
1. correct writes
2. stable retrieval relevance
3. low operational complexity
4. speed optimization

### 21.2 Early optimization to avoid
Do not lead with:
- graph databases,
- complex rerank stacks,
- overengineered analytics,
- premature cache hierarchies.

### 21.3 Practical optimization targets
- bounded boot load
- incremental consolidation
- top-k capped retrieval
- lightweight debug logging

---

## 22. Observability and Debuggability

v1 should include simple but strong introspection.

### 22.1 Debug artifacts
- write decisions
- promotion decisions
- archive decisions
- retrieval result explanations

### 22.2 Required introspection questions
The system should help answer:
- why was this remembered?
- why was this not remembered?
- why was this memory retrieved?
- why did this fact change?
- what promoted this to semantic memory?

---

## 23. Evaluation Metrics

The system needs measurable success criteria.

### 23.1 Core metrics
- memory write precision
- semantic memory precision@k
- false positive long-term writes
- stale memory rate
- contradiction rate
- boot briefing usefulness
- token overhead per session
- explicit preference adherence

### 23.2 Qualitative evaluation
- does the agent stop repeating questions?
- does the agent preserve constraints correctly?
- does memory feel helpful instead of intrusive?
- does startup continuity feel natural?

---

## 24. Rollout Plan

### Phase 1 — reliable foundation
- canonical schema
- write policy
- working/episodic/semantic/archive levels
- explicit store/recall tools
- boot briefing
- basic summaries

### Phase 2 — retrieval quality
- hybrid retrieval
- dedupe
- weighted ranking
- confidence-aware promotion

### Phase 3 — smarter projections
- profile projection improvements
- explainability
- archive restore
- richer debugging

### Phase 4 — advanced extensions
- relationship layer expansion
- multi-scope memory
- external memory import
- optional connector ecosystem

---

## 25. Recommended v1 Decisions

If we want this project to stay focused, I strongly recommend v1 choose the following:

1. **English name:** `EverMemory`
2. **Plugin role:** memory infrastructure only
3. **Canonical store:** SQLite
4. **Dimensions:** memory type + lifecycle level
5. **Long-term memory policy:** conservative
6. **Profile model:** projection, not truth source
7. **Relation model:** lightweight metadata links only
8. **Startup model:** boot protocol with minimal continuity
9. **Background jobs:** dedupe, summarize, promote, archive
10. **Evaluation:** precision and usefulness over feature count

---

## 26. Open Questions for Design Review

Before implementation, these questions should be explicitly answered:

1. Should semantic promotion require human confirmation in some cases?
2. What sensitivity classes should exist for memory scope control?
3. Should summaries become canonical memory items or only supporting artifacts?
4. Do we want append-only history for every semantic mutation?
5. Should explicit “remember this” bypass normal promotion thresholds?
6. What is the exact default boot token budget?
7. How much inference should v1 allow at write time?

---

## 27. Final Position

EverMemory should be built as a **disciplined memory platform**, not as an overgrown all-in-one intelligence engine.

The design succeeds if it does three things well:
1. remembers what matters,
2. forgets what does not,
3. restores useful continuity without polluting the agent.

That is the center of the system.

---

**End of Draft**

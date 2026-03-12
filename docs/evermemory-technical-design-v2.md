# EverMemory v2 - Formal Technical Design

**Version:** 2.0.0-draft  
**Status:** Formal technical design for review  
**Date:** 2026-03-11  
**Plugin Type:** OpenClaw enhancement plugin  
**Primary Goal:** Make OpenClaw feel persistently smarter, more personal, and more consistent through governed memory, structured understanding, and guided self-evolution.

---

# 1. Vision

EverMemory is not just a storage plugin.

It is a new enhancement layer for OpenClaw that gives the agent three visible upgrades:

1. **Continuity** — the agent does not feel freshly reset every session.  
2. **Understanding** — the agent becomes better at understanding the user’s intent, preferences, and priorities.  
3. **Evolution** — the agent learns from repeated corrections, successes, and failures in a controlled way.

The user-facing outcome should be clear:

> After installing EverMemory, OpenClaw should feel more consistent, more aware of the user, less repetitive, and less likely to repeat old mistakes.

---

# 2. Product Positioning

## 2.1 What EverMemory is

EverMemory is an **OpenClaw enhancement plugin** that provides:
- persistent memory infrastructure,
- structured intent understanding signals,
- reflective learning and behavior evolution,
- boot-time continuity restoration,
- memory-driven personalization.

## 2.2 What EverMemory is not

EverMemory is not:
- a replacement for the base model,
- a full autonomous planning framework,
- a general-purpose analytics platform,
- a graph-native reasoning engine,
- a cloud SaaS memory backend.

It augments the agent runtime. It does not replace it.

---

# 3. Core Experience Goals

The design should optimize for the following subjective user-visible outcomes.

## 3.1 Continuity
The agent remembers who the user is, what matters, recent context, and previous constraints.

## 3.2 Personal understanding
The agent better recognizes what the user actually wants, not just what the user literally said.

## 3.3 Reduced repetition
The agent stops repeating the same mistakes, questions, and over-explanations.

## 3.4 Better judgment
The agent becomes better at choosing when to ask, when to retrieve memory, when to be concise, and when to be detailed.

## 3.5 Stable identity
The assistant feels like the same assistant over time rather than a new instance every session.

---

# 4. High-Level Architecture

EverMemory v2 consists of four major subsystems.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           EverMemory v2                              │
├──────────────────────────────────────────────────────────────────────┤
│  A. Memory Core                                                      │
│     - structured memory                                               │
│     - lifecycle management                                            │
│     - retrieval                                                       │
│     - summaries and archive                                           │
├──────────────────────────────────────────────────────────────────────┤
│  B. Understanding Engine                                              │
│     - intent analysis                                                 │
│     - urgency / emotion / action cues                                 │
│     - memory need estimation                                          │
│     - preference relevance                                            │
├──────────────────────────────────────────────────────────────────────┤
│  C. Reflection Engine                                                 │
│     - post-interaction reflection                                     │
│     - error pattern extraction                                        │
│     - success/failure lessons                                         │
│     - candidate behavior updates                                      │
├──────────────────────────────────────────────────────────────────────┤
│  D. Behavior Layer                                                    │
│     - stable operating preferences                                    │
│     - user-specific behavior rules                                    │
│     - promoted reflection outcomes                                    │
└──────────────────────────────────────────────────────────────────────┘
```

Dependency direction:
- Memory Core is foundational.
- Understanding Engine consumes Memory Core.
- Reflection Engine consumes interaction traces + memory + outcomes.
- Behavior Layer is updated from governed reflection outputs.

---

# 5. Design Principles

## 5.1 Governed intelligence over uncontrolled automation
The system should become smarter without becoming self-delusional.

## 5.2 Evidence over vibes
Long-term behavior and personalization must be backed by evidence, not one-off intuition.

## 5.3 Memory is canonical; profiles are projections
Stable records are the truth source. Derived summaries are recalculable.

## 5.4 Reflection can suggest, but promotion must be strict
Not every insight deserves to become a long-term rule.

## 5.5 Better judgment, not just more retrieval
The plugin should improve timing, prioritization, and decision quality.

## 5.6 User-visible improvement is the real metric
The plugin succeeds only if the user feels the assistant is meaningfully smarter.

## 5.7 Latency principle
EverMemory must preserve reply responsiveness.
Only minimal understanding and targeted recall may run on the critical response path.
Reflection, rule generation, profile recomputation, consolidation, and archival tasks must run asynchronously whenever possible.

---

# 6. Scope Boundaries

## 6.1 In scope for v2
- structured memory model,
- lifecycle policy,
- boot continuity,
- intent analysis,
- preference and constraint recall,
- reflection capture,
- candidate behavior rules,
- promoted behavior rules,
- controlled self-evolution,
- profile projection,
- debug and introspection artifacts.

## 6.2 Out of scope for v2
- full autonomous planning,
- general-purpose world modeling,
- graph database infrastructure,
- massive connector ecosystem,
- collaborative shared memory between many users,
- unsupervised long-horizon self-reprogramming.

---

# 7. Data Model Overview

EverMemory v2 stores four primary categories of objects:

1. `MemoryItem`
2. `IntentRecord`
3. `ReflectionRecord`
4. `BehaviorRule`

A derived `ProjectedProfile` is built from those records.

---

# 8. Memory Core Design

## 8.1 Purpose
Memory Core provides persistent, structured, and auditable memory.

It must answer:
- what should be remembered,
- how it should be stored,
- how it should be retrieved,
- when it should be promoted,
- when it should be archived or forgotten.

## 8.2 Memory dimensions

Memory uses two orthogonal dimensions.

### Dimension A: Type
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
- `lesson`
- `constraint`

### Dimension B: Lifecycle
- `working`
- `episodic`
- `semantic`
- `archive`

## 8.3 Memory item schema

```ts
interface MemoryItem {
  id: string;
  content: string;
  type: MemoryType;
  lifecycle: MemoryLifecycle;

  source: {
    kind: 'message' | 'tool' | 'manual' | 'summary' | 'reflection' | 'inference';
    actor?: 'user' | 'assistant' | 'system';
    sessionId?: string;
    messageId?: string;
    channel?: string;
  };

  scores: {
    confidence: number;
    importance: number;
    explicitness: number;
    stability: number;
  };

  timestamps: {
    createdAt: string;
    updatedAt: string;
    lastAccessedAt?: string;
  };

  scope: {
    userId?: string;
    chatId?: string;
    project?: string;
    global?: boolean;
  };

  evidence: {
    excerpt?: string;
    refs?: string[];
  };

  state: {
    active: boolean;
    archived: boolean;
    supersededBy?: string;
    conflictWith?: string[];
  };

  links: {
    relatedMemoryIds: string[];
    relatedEntities: string[];
  };

  stats: {
    accessCount: number;
    retrievalCount: number;
  };

  tags: string[];
}
```

## 8.4 Memory governance rules

### Auto-write safe
- explicit identity facts,
- explicit preferences,
- explicit user constraints,
- clear decisions,
- clear commitments,
- stable project state,
- useful summaries.

### Episodic-first
- inferred preferences,
- working task state,
- style observations,
- potential lessons,
- not-yet-confirmed assumptions.

### Do-not-store-long-term by default
- casual banter,
- one-off emotions,
- low-confidence guesses,
- temporary ops chatter,
- repetitive filler.

## 8.5 Promotion rules

Promotion to semantic requires at least one of:
- explicit user “remember this”,
- repeated recurrence,
- strong decision/constraint value,
- confirmed correction pattern,
- high confidence + strong evidence,
- manual operator approval (future option).

## 8.6 Conflict handling

If new memory contradicts old memory:
- preserve both,
- prefer explicit over inferred,
- prefer recent explicit over older explicit when same scope,
- mark superseded rather than delete.

---

# 9. Understanding Engine Design

## 9.1 Purpose
The Understanding Engine gives EverMemory the ability to interpret the current interaction in a structured way.

It should answer:
- what is the user trying to do,
- how urgent is it,
- is memory needed,
- which memory classes matter,
- is the user signaling a preference or correction,
- how should downstream systems adapt.

## 9.2 Output philosophy

The Understanding Engine does **not** generate final replies.
It generates structured signals for use by:
- retrieval,
- reflection,
- behavior update logic,
- optional runtime guidance.

## 9.3 Intent record schema

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

## 9.4 Core intent dimensions

### Intent type examples
- ask_fact
- ask_analysis
- ask_design
- ask_debug
- request_execution
- request_memory
- request_preference
- correction
- complaint
- planning
- social

### Memory need levels
- `none`: no retrieval needed
- `light`: maybe check stable preferences/constraints
- `targeted`: recall focused memory types
- `deep`: use hybrid retrieval on broader context

## 9.5 How it improves the user experience

The Understanding Engine makes OpenClaw feel smarter by improving:
- when memory is consulted,
- what kind of memory is consulted,
- recognition of corrections,
- sensitivity to urgency and tone,
- awareness of whether the user wants an answer, action, or confirmation.

---

# 10. Reflection Engine Design

## 10.1 Purpose
The Reflection Engine is the controlled learning subsystem.

It transforms raw interaction history into structured lessons without allowing immediate uncontrolled self-rewriting.

## 10.2 Reflection pipeline

```text
Interaction trace
  → outcome signal detection
  → success/failure pattern extraction
  → reflection record generation
  → candidate rule generation
  → promotion review
  → behavior layer update (if approved by policy)
```

## 10.3 Experience log

Before reflection, EverMemory should preserve a lightweight experience record.

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

## 10.4 Reflection record schema

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

## 10.5 Reflection triggers

Reflection should run on:
- explicit user correction,
- repeated failure pattern,
- repeated success pattern,
- risky action with feedback,
- session-end review,
- manual operator request.

## 10.6 Reflection rules

Reflection may recommend. It may not directly mutate long-term identity without policy checks.

---

# 11. Behavior Layer Design

## 11.1 Purpose
The Behavior Layer stores promoted operating rules that shape future behavior.

This is how the system “gets smarter” over time in a stable way.

## 11.2 Behavior rule schema

```ts
interface BehaviorRule {
  id: string;
  statement: string;
  createdAt: string;
  updatedAt: string;

  appliesTo: {
    userId?: string;
    channel?: string;
    intentTypes?: string[];
    contexts?: string[];
  };

  category: 'style' | 'safety' | 'execution' | 'confirmation' | 'memory' | 'planning';

  priority: number;

  evidence: {
    reflectionIds: string[];
    memoryIds: string[];
    confidence: number;
    recurrenceCount: number;
  };

  state: {
    active: boolean;
    deprecated: boolean;
    supersededBy?: string;
  };
}
```

## 11.3 Example behavior rules

- “Before high-risk external actions, ask for confirmation unless the user explicitly said to proceed.”
- “For design review requests, lead with boundary and tradeoff analysis before implementation details.”
- “The user prefers direct answers first, detailed expansion second.”
- “Do not turn one-off emotional statements into long-term preference memory.”

## 11.4 Promotion policy for behavior rules

A candidate rule becomes active only if:
- evidence confidence is high enough,
- it appears across multiple experiences,
- it is not contradicted by stronger newer evidence,
- it does not conflict with higher-priority safety rules.

## 11.5 Why behavior rules matter

Behavior rules are what converts memory + reflection into **persistent qualitative improvement**.

Without them, the system may remember but still fail to improve behavior.

---

# 12. Projected Profile Design

## 12.1 Purpose
ProjectedProfile provides a synthesized, human-meaningful view of the user.

It is derived from:
- semantic memories,
- preference memories,
- behavior rules,
- interaction patterns.

## 12.2 It is not canonical truth
ProjectedProfile must always be recomputable and evidence-backed.

## 12.3 Profile schema

```ts
interface ProjectedProfile {
  userId: string;
  updatedAt: string;

  stable: {
    displayName?: string;
    preferredAddress?: string;
    timezone?: string;
    explicitPreferences: Record<string, any>;
    explicitConstraints: string[];
  };

  derived: {
    communicationStyle?: {
      tendency: string;
      confidence: number;
      evidenceRefs: string[];
    };
    likelyInterests: Array<{
      value: string;
      confidence: number;
      evidenceRefs: string[];
    }>;
    workPatterns: Array<{
      value: string;
      confidence: number;
      evidenceRefs: string[];
    }>;
  };

  behaviorHints: string[];
}
```

---

# 13. Boot Continuity Protocol

## 13.1 Purpose
Boot continuity should restore the minimum high-value state that makes the agent feel persistent and familiar.

## 13.2 Boot layers

### Layer 0 — identity and hard constraints
- who the user is,
- how to address them,
- critical constraints,
- critical behavior rules.

### Layer 1 — recent continuity
- active tasks,
- recent project state,
- unresolved commitments,
- recent high-value events.

### Layer 2 — first-message targeted retrieval
- use the Understanding Engine on the first user message,
- retrieve only the memory classes indicated by the intent record.

### Layer 3 — on-demand deep recall
- all other retrieval remains explicit or situational.

## 13.3 Boot artifact

```ts
interface BootBriefing {
  generatedAt: string;
  userId?: string;
  sections: {
    identity: string[];
    constraints: string[];
    recentContinuity: string[];
    activeProjects: string[];
    importantRules: string[];
  };
  budget: {
    tokenTarget: number;
    actualApproxTokens: number;
  };
}
```

---

# 14. Retrieval Design

## 14.1 Retrieval goals
Retrieval is not just semantic similarity.
It must optimize usefulness, relevance, and behavioral correctness.

## 14.2 Retrieval modes
- `boot`
- `targeted`
- `hybrid`
- `behavior`
- `profile`

## 14.3 Retrieval signals
Ranking may use:
- semantic score,
- keyword score,
- recency,
- importance,
- confidence,
- explicitness,
- scope match,
- type priority,
- behavior relevance.

## 14.4 Example retrieval formula

```text
final_score =
  semantic_score
+ keyword_score
+ recency_weight
+ importance_weight
+ confidence_weight
+ explicitness_weight
+ scope_match
+ type_priority
+ behavior_relevance
```

## 14.5 Retrieval strategy by intent

Examples:
- correction → prioritize recent action + constraints + behavior rules
- design review → prioritize project decisions + prior critiques + preferences
- casual question → likely no deep retrieval
- action request → prioritize execution preferences + confirmation rules + recent tasks

---

# 15. Lifecycle Management

## 15.1 Core actions
- create
- merge
- supersede
- promote
- summarize
- archive
- restore

## 15.2 Summarization
Summarization converts repeated or long episodic traces into compact, useful memory.

## 15.3 Archive strategy
Archive should preserve recoverability while reducing noise in active recall.

## 15.4 Forgetting strategy
Forget low-value, stale, low-confidence, and superseded data according to policy.

---

# 16. Storage Design

## 16.1 Recommended v2 backend
- canonical store: SQLite
- optional semantic layer: vector index sidecar
- projections and debug artifacts: JSON / JSONL

## 16.2 Directory structure

```text
~/.openclaw/memory/evermemory/
├── store/
│   ├── evermemory.db
│   ├── evermemory.db-wal
│   └── evermemory.db-shm
├── projections/
│   ├── profiles/
│   └── boot/
├── summaries/
│   ├── sessions/
│   └── daily/
├── reflection/
│   ├── experiences.jsonl
│   ├── reflections.jsonl
│   └── promotions.jsonl
├── archive/
│   ├── cold/
│   └── tombstones/
└── debug/
    ├── writes.jsonl
    ├── retrievals.jsonl
    ├── intents.jsonl
    └── rules.jsonl
```

## 16.3 Why SQLite first
- local
- inspectable
- operationally light
- enough for v2
- easier to debug than a graph-first architecture

---

# 17. Hook and Runtime Integration

## 17.1 Hook responsibilities

### `session_start`
- load boot briefing
- activate continuity state

### `message_received`
- run intent analysis
- determine memory need
- run targeted retrieval if needed
- evaluate memory write candidates

### `context_compact`
- preserve high-value transient context
- create summary candidates

### `session_end`
- create experience logs
- run session reflection candidates
- store episodic summary

### `heartbeat`
- cleanup
- summarization
- promotion checks
- archive checks

---

# 18. API and Tool Surface

## 18.1 Core tools

```ts
async function evermemory_store(input: {
  content: string;
  type?: string;
  lifecycle?: string;
  confidence?: number;
  importance?: number;
  tags?: string[];
}): Promise<{ id: string }>;

async function evermemory_recall(input: {
  query: string;
  types?: string[];
  lifecycles?: string[];
  limit?: number;
}): Promise<MemoryItem[]>;

async function evermemory_briefing(input?: {
  sessionId?: string;
  tokenBudget?: number;
}): Promise<BootBriefing>;

async function evermemory_intent(input: {
  message: string;
  context?: string;
}): Promise<IntentRecord>;

async function evermemory_profile(input?: {
  userId?: string;
}): Promise<ProjectedProfile>;

async function evermemory_reflect(input?: {
  sessionId?: string;
  mode?: 'light' | 'full';
}): Promise<ReflectionRecord[]>;

async function evermemory_rules(): Promise<BehaviorRule[]>;

async function evermemory_status(): Promise<Record<string, any>>;
```

## 18.2 Why these tools matter
- `store` and `recall` provide explicit control,
- `intent` exposes understanding,
- `reflect` exposes evolution,
- `rules` exposes learned behavior,
- `briefing` exposes continuity,
- `status` supports debugging.

---

# 19. Controlled Self-Evolution Policy

This is the heart of v2.

## 19.1 Principle
Inference may guide behavior, but only evidence-backed patterns may shape long-term identity.

## 19.2 Evolution ladder

```text
interaction
  → experience log
  → reflection
  → candidate lesson
  → candidate rule
  → promotion review
  → active behavior rule
```

## 19.3 Promotion thresholds
Behavior evolution should consider:
- confidence,
- recurrence,
- recency,
- contradiction risk,
- safety priority.

## 19.4 What should not self-evolve automatically
- core system rules,
- safety boundaries,
- irreversible behavioral changes,
- strong personal assumptions from one incident.

---

# 20. Safety and Failure Modes

## 20.1 Primary failure risks
- false long-term preference writes,
- overfitted behavior rules,
- retrieval pollution,
- user understanding drift,
- self-evolution based on bad evidence.

## 20.2 Mitigations
- conservative semantic promotion,
- episodic-first inference handling,
- evidence refs for rules,
- supersede instead of destructive replacement,
- reflection confidence gating,
- debug visibility for all important updates.

---

# 21. Observability and Explainability

The system should explain itself.

## 21.1 Required explainability questions
- Why was this memory written?
- Why was this memory recalled?
- Why was this rule created?
- What evidence supports this profile hint?
- Why did the system think the user wanted this?

## 21.2 Debug records
- intent outputs,
- write decisions,
- retrieval scores,
- reflection outputs,
- rule promotions,
- conflict resolutions.

---

# 22. Evaluation Metrics

## 22.1 Product-level metrics
- continuity usefulness,
- user-perceived personalization,
- reduction in repeated mistakes,
- reduction in repeated user corrections,
- preference adherence rate,
- constraint adherence rate.

## 22.2 System-level metrics
- memory precision@k,
- false positive semantic writes,
- rule promotion precision,
- stale memory rate,
- contradiction rate,
- boot token overhead.

## 22.3 Reflection quality metrics
- successful lesson extraction rate,
- repeat-mistake reduction,
- rule conflict rate,
- invalid rule rollback count.

---

# 23. Delivery Plan

## Phase 1 — Core continuity
- memory schema
- storage
- write policy
- recall
- boot briefing
- profile baseline

## Phase 2 — Understanding
- intent records
- retrieval hints
- targeted recall
- correction signal detection

## Phase 3 — Reflection
- experience logs
- reflection records
- candidate lessons
- candidate rules

## Phase 4 — Evolution
- behavior rules
- promotion logic
- deprecation/supersede logic
- stronger explainability

## Phase 5 — Optimization
- hybrid retrieval tuning
- scoring improvements
- archive tuning
- profile refinement

---

# 24. Recommended Product Statement

If the project needs a single official statement, use this:

> EverMemory is an OpenClaw enhancement plugin that gives the agent persistent continuity, user understanding, and guided self-evolution through governed memory, structured intent signals, reflective learning, and behavior rule promotion.

---

# 25. Final Position

EverMemory v2 should not aim to be the biggest memory system.
It should aim to be the memory system that most clearly changes the user experience.

If built correctly, the user should feel:
- it remembers,
- it understands,
- it learns,
- it becomes more reliable over time.

That is the standard.

---

**End of Formal Technical Design v2**

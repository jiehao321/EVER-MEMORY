# EverMemory - Phase 1 Development Task List

**Version:** 1.0.0  
**Date:** 2026-03-11  
**Audience:** Codex / implementation agent  
**Goal:** Provide a concrete, execution-oriented task list for building Phase 1 of EverMemory.

---

# 1. Phase 1 Scope

Phase 1 focuses on the reliable foundation of EverMemory.

## In scope
- plugin skeleton
- config loader
- SQLite initialization + migrations
- core type definitions
- memory storage and retrieval
- write governance baseline
- boot briefing generation
- session_start hook integration
- store/recall/status tools
- debug event logging baseline

## Explicitly out of scope
- LLM intent analysis
- reflection engine
- behavior rule promotion
- projected profile derivation beyond a minimal placeholder
- semantic embedding retrieval (optional later)
- heartbeat consolidation jobs beyond stubs

## Phase 1 success criteria
Phase 1 is successful if:
1. EverMemory can persist structured memory items locally.
2. EverMemory can recall memory by type/lifecycle/scope.
3. EverMemory can generate a useful boot briefing.
4. EverMemory can load continuity during `session_start`.
5. Core debug events make writes and recalls inspectable.

---

# 2. Engineering Rules for Codex

1. Prefer simple, inspectable code over clever abstractions.
2. Keep every major mutation observable via debug logs.
3. Avoid speculative implementation of future phases.
4. Use strict TypeScript types.
5. Keep module boundaries clean.
6. Do not implement behavior evolution in Phase 1.
7. Do not introduce external services unless explicitly required.
8. Keep storage local-first and SQLite-first.
9. Protect first-reply latency. Anything not required for the immediate reply must not block the critical path.
10. Prefer fast-path hooks and queue/defer all nonessential enrichment.

---

# 3. Target File Structure for Phase 1

```text
evermemory/
├── package.json
├── plugin.json
├── README.md
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── types.ts
│   ├── constants.ts
│   ├── hooks/
│   │   └── sessionStart.ts
│   ├── tools/
│   │   ├── store.ts
│   │   ├── recall.ts
│   │   ├── status.ts
│   │   └── briefing.ts
│   ├── core/
│   │   ├── memory/
│   │   │   ├── service.ts
│   │   │   ├── policy.ts
│   │   │   ├── classifier.ts
│   │   │   ├── promotion.ts
│   │   │   └── conflict.ts
│   │   └── briefing/
│   │       └── service.ts
│   ├── retrieval/
│   │   ├── service.ts
│   │   ├── keyword.ts
│   │   └── ranking.ts
│   ├── storage/
│   │   ├── db.ts
│   │   ├── migrations.ts
│   │   ├── memoryRepo.ts
│   │   ├── briefingRepo.ts
│   │   └── debugRepo.ts
│   ├── runtime/
│   │   ├── context.ts
│   │   └── ids.ts
│   └── util/
│       ├── logger.ts
│       ├── validate.ts
│       ├── json.ts
│       └── clock.ts
└── test/
    ├── memory.test.ts
    ├── retrieval.test.ts
    ├── briefing.test.ts
    └── sessionStart.test.ts
```

---

# 4. Work Breakdown Structure

## Performance red line
Codex must treat reply responsiveness as a hard product requirement.

### Critical-path rule
Do not place reflection, deep analysis, profile recomputation, archive work, or any future learning-heavy logic on the first-reply critical path unless explicitly required.

### Fast-path target
Phase 1 implementation should keep EverMemory overhead minimal on session start and future message-time paths.

### Engineering implication
When in doubt:
- do less synchronously,
- return control faster,
- defer nonessential work.


The recommended sequence below is intentional. Codex should follow it unless a strong reason is documented.

---

# Task 1 — Create plugin skeleton

## Objective
Create the base plugin package and register minimal plugin entrypoints.

## Deliverables
- `package.json`
- `plugin.json`
- `src/index.ts`
- basic build/test scripts

## Requirements
- plugin metadata should identify project as `evermemory`
- minimal plugin boot path should succeed without hooks/tools enabled yet
- code should compile cleanly

## Acceptance criteria
- package installs locally
- plugin entrypoint loads without runtime exception
- TypeScript build passes

---

# Task 2 — Define core types and constants

## Objective
Create the shared domain model used by all later modules.

## Deliverables
- `src/types.ts`
- `src/constants.ts`

## Required types
- `MemoryType`
- `MemoryLifecycle`
- `MemoryItem`
- `BootBriefing`
- `WriteDecision`
- `RecallRequest`
- `RecallResult`
- `DebugEvent`
- config interfaces

## Acceptance criteria
- all exported domain types compile cleanly
- no `any` in core domain models unless justified
- enums / unions match implementation plan

---

# Task 3 — Implement config loader and defaults

## Objective
Create safe configuration parsing with sensible defaults.

## Deliverables
- `src/config.ts`

## Required behavior
- parse plugin config
- fill defaults
- validate file path, token budget, recall limits, logging flags
- expose typed config object to runtime

## Suggested defaults
- storage path under `~/.openclaw/memory/evermemory/store/evermemory.db`
- boot token budget: 1200
- max recall: 8
- debug enabled: true

## Acceptance criteria
- invalid config values produce clear errors
- default config works with zero customization

---

# Task 4 — Implement SQLite bootstrap and migrations

## Objective
Create the local database layer.

## Deliverables
- `src/storage/db.ts`
- `src/storage/migrations.ts`

## Required behavior
- create database directory if missing
- open SQLite connection
- run migrations idempotently
- expose connection helper to repositories

## Required tables for Phase 1
- `memory_items`
- `boot_briefings`
- `debug_events`

## Acceptance criteria
- first run creates DB successfully
- second run is idempotent
- schema matches Phase 1 needs

---

# Task 5 — Implement repositories

## Objective
Create persistence repositories with minimal clean APIs.

## Deliverables
- `src/storage/memoryRepo.ts`
- `src/storage/briefingRepo.ts`
- `src/storage/debugRepo.ts`

## Required repository methods

### memoryRepo
- `insert(memory: MemoryItem)`
- `update(memory: MemoryItem)`
- `findById(id: string)`
- `search(filters)`
- `listRecent(scope, limit)`
- `incrementAccess(id)`

### briefingRepo
- `save(briefing: BootBriefing)`
- `getLatestByUser(userId)`
- `getLatestBySession(sessionId)`

### debugRepo
- `log(kind, entityId, payload)`
- `listRecent(kind?, limit?)`

## Acceptance criteria
- repositories pass basic CRUD tests
- repositories never return malformed objects
- JSON fields serialize/deserialize safely

---

# Task 6 — Implement memory write policy baseline

## Objective
Create deterministic Phase 1 memory write governance.

## Deliverables
- `src/core/memory/policy.ts`
- `src/core/memory/classifier.ts`

## Phase 1 scope
Do not use LLM here. Use deterministic heuristics.

## Required capabilities
- classify explicit memory candidates into type guesses
- assign baseline confidence / importance / explicitness
- reject obvious low-value writes
- default inferred items to episodic, not semantic

## Minimum heuristics to support
- explicit identity statements
- explicit preference statements
- explicit constraints (“don’t do X”, “always do Y”)
- explicit commitments / tasks
- explicit decisions

## Acceptance criteria
- obvious low-value chatter is rejected
- explicit preference/constraint examples are accepted
- stable types are assigned predictably

---

# Task 7 — Implement memory service

## Objective
Create the main service layer for storing structured memory.

## Deliverables
- `src/core/memory/service.ts`
- stub files: `promotion.ts`, `conflict.ts`

## Required responsibilities
- normalize candidate inputs into `MemoryItem`
- call policy layer for write decisions
- call repository layer to persist accepted items
- record debug events for accepted/rejected writes
- support explicit store requests from tool layer

## Required methods
- `storeExplicit(input, scope)`
- `processCandidates(candidates, scope)`
- `getById(id)`
- `listRecent(scope, limit)`

## Acceptance criteria
- explicit store path works end-to-end
- rejected writes create debug events
- accepted writes contain valid scores and timestamps

---

# Task 8 — Implement keyword retrieval baseline

## Objective
Provide usable Phase 1 recall without semantic search.

## Deliverables
- `src/retrieval/keyword.ts`
- `src/retrieval/ranking.ts`
- `src/retrieval/service.ts`

## Required behavior
- filter by scope
- filter by type/lifecycle
- keyword match against content
- rank by keyword match + recency + importance + confidence
- cap results by configurable limit

## Acceptance criteria
- retrieval returns stable ordering for deterministic test cases
- scope filters prevent obvious cross-context leakage
- higher importance/recent results sort appropriately

---

# Task 9 — Implement boot briefing service

## Objective
Create continuity generation for new sessions.

## Deliverables
- `src/core/briefing/service.ts`
- `src/tools/briefing.ts`

## Required behavior
- gather identity memories
- gather constraints
- gather recent high-value semantic/episodic memory
- compose concise boot briefing object
- persist generated briefing

## Output sections
- identity
- constraints
- recent continuity
- active projects (if any)

## Acceptance criteria
- briefing is generated even with sparse memory
- briefing is concise and structured
- repeated generation does not crash if no data exists

---

# Task 10 — Implement runtime context helpers

## Objective
Provide in-memory session-scoped continuity state.

## Deliverables
- `src/runtime/context.ts`
- `src/runtime/ids.ts`

## Required behavior
- hold current boot briefing per session
- hold current recalled items per session if needed
- provide safe getters/setters
- clear expired session state when appropriate

## Acceptance criteria
- session state is isolated per session id
- helper functions remain simple and testable

---

# Task 11 — Implement `session_start` hook

## Objective
Make EverMemory actually affect startup continuity.

## Deliverables
- `src/hooks/sessionStart.ts`

## Required behavior
- derive runtime scope from hook context
- generate boot briefing using briefing service
- inject boot context into runtime state
- log debug event
- keep the hook lightweight and avoid introducing expensive nonessential work into startup flow

## Acceptance criteria
- boot briefing is generated on session start
- runtime state receives the briefing
- no crash when user has no existing memory

---

# Task 12 — Implement Phase 1 tools

## Objective
Expose the minimum useful control surface.

## Deliverables
- `src/tools/store.ts`
- `src/tools/recall.ts`
- `src/tools/status.ts`
- `src/tools/briefing.ts`

## Tool requirements

### `evermemory_store`
- explicit manual store path
- return final persisted object summary

### `evermemory_recall`
- accept query + optional filters
- return ranked result list

### `evermemory_status`
- count memories by lifecycle/type
- show DB path
- show latest briefing timestamp
- show debug event count summary

### `evermemory_briefing`
- generate and return current boot briefing

## Acceptance criteria
- all tools validate inputs
- tool outputs are JSON-safe and human-readable
- tools do not require later phases to exist

---

# Task 13 — Implement debug event baseline

## Objective
Make the system explainable from day one.

## Deliverables
- debug logging integrated in store / recall / briefing / hook paths

## Required debug kinds
- `memory_write_decision`
- `memory_write_rejected`
- `retrieval_executed`
- `boot_generated`

## Acceptance criteria
- key paths emit debug events
- payloads are concise but useful
- no sensitive over-logging by default

---

# Task 14 — Add tests for Phase 1

## Objective
Protect the foundation before Phase 2.

## Deliverables
- `test/memory.test.ts`
- `test/retrieval.test.ts`
- `test/briefing.test.ts`
- `test/sessionStart.test.ts`

## Required test scenarios

### memory tests
- explicit preference stored
- explicit constraint stored
- obvious filler rejected

### retrieval tests
- recall honors scope
- recall honors lifecycle/type filters
- ranking prefers recent + important memory

### briefing tests
- empty user still returns valid briefing structure
- identity + constraints appear in correct sections

### session start tests
- hook creates briefing and runtime context
- repeated calls do not corrupt state

## Acceptance criteria
- tests pass locally
- deterministic tests only for Phase 1

---

# Task 15 — Write README and operator notes

## Objective
Make the plugin understandable to humans before Phase 2 begins.

## Deliverables
- `README.md`

## Must include
- what EverMemory does in Phase 1
- what Phase 1 does not do yet
- storage location
- tools exposed
- config example
- known limitations

## Acceptance criteria
- another engineer can install and understand the plugin from README

---

# 5. Stretch Tasks (Only if Phase 1 core is complete)

These are optional. Do not start them until all core tasks above are complete.

## Stretch A — basic message_received stub
- create file only
- wire no-op or minimal placeholder
- do not implement full intent pipeline yet

## Stretch B — archive stub
- create archive service placeholder
- no active archival logic yet

## Stretch C — placeholder projected profile row
- create empty/default profile object generator
- do not derive from interaction history yet

---

# 6. Deliverable Review Checklist

Codex should verify all items before considering Phase 1 done.

- [ ] plugin loads
- [ ] config defaults work
- [ ] SQLite DB initializes
- [ ] migrations are idempotent
- [ ] memory can be stored manually
- [ ] memory can be recalled with filters
- [ ] boot briefing can be generated
- [ ] `session_start` uses boot briefing
- [ ] debug events are emitted
- [ ] tests pass
- [ ] README exists

---

# 7. Handoff Notes for Phase 2

Once Phase 1 is complete, the next phase should add:
- intent analysis service
- `message_received` processing
- targeted memory retrieval based on intent
- experience logs
- first reflection pipeline

Codex should not pre-build these deeply in Phase 1. Phase 1 should stay clean.

---

# 8. Final Instruction to Implementation Agent

Build the smallest reliable version of EverMemory first.

A correct, testable, inspectable Phase 1 foundation is more valuable than prematurely adding “smartness.” Smartness comes in later phases. The goal of Phase 1 is trustable persistence and continuity.

---

**End of Phase 1 Development Task List**

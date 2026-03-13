# EverMemory v1 Boundary

_Last reviewed: 2026-03-13_

## Purpose

This document freezes the practical v1 boundary for the current EverMemory codebase.

It is intentionally conservative:

- it describes what the repository actually implements now
- it distinguishes library/API capability from OpenClaw plugin-exposed capability
- it avoids treating roadmap items or partially wired surfaces as production-ready

## Boundary summary

EverMemory v1 is currently best understood as:

> a deterministic SQLite-backed memory package for OpenClaw with a working core store/recall/status plugin surface, plus additional internal/library capabilities for briefing, intent, reflection, rules, profile projection, consolidation, explainability, import/export, and archive review/restore.

That means the repository already contains more code than the plugin currently exposes to OpenClaw as first-class tools.

## In scope for v1

### Stable

These areas are implemented in code and should be treated as the stable v1 core.

1. **Deterministic persistence baseline**
   - SQLite storage via `better-sqlite3`
   - database bootstrap and idempotent migrations
   - canonical repositories for memory, briefing, debug, intent, experience, reflection, behavior, profile, and semantic sidecar data

2. **Core memory write path**
   - deterministic write policy
   - explicit accept/reject result model
   - low-value content rejection without throwing

3. **Core retrieval path**
   - keyword retrieval
   - weighted ranking with recency / importance / confidence / explicitness / scope weighting
   - retrieval modes: `structured`, `keyword`, `hybrid`
   - safe fallback from `hybrid` to keyword-only behavior when semantic sidecar is disabled

4. **OpenClaw plugin integration currently exposed to host runtime**
   - session hooks for:
     - `session_start`
     - `before_agent_start`
     - `agent_end`
     - `session_end`
   - plugin-exposed tools currently registered in `src/openclaw/plugin.ts`:
     - `evermemory_store`
     - `evermemory_recall`
     - `evermemory_status`

5. **Operator visibility baseline**
   - status/debug snapshots
   - explainability-oriented debug event recording
   - operator docs/runbook/troubleshooting already present in `docs/`

## Optional

These capabilities exist and are real, but are optional by configuration, host wiring, or operator usage pattern.

1. **Semantic sidecar retrieval**
   - semantic sidecar index exists in code and schema
   - disabled by default in config
   - used as a sidecar/hybrid ranking aid, not a true embedding/vector backend

2. **LLM intent enrichment**
   - intent heuristics work without LLM
   - optional LLM enrichment path exists
   - host must inject the analyzer/adapter
   - not bundled as a built-in provider integration

3. **Library/API-level advanced operations**
   - available from `initializeEverMemory()` return surface:
     - `evermemoryBriefing`
     - `evermemoryIntent`
     - `evermemoryReflect`
     - `evermemoryRules`
     - `evermemoryProfile`
     - `evermemoryConsolidate`
     - `evermemoryExplain`
     - `evermemoryExport`
     - `evermemoryImport`
     - `evermemoryReview`
     - `evermemoryRestore`
   - these are code-level capabilities, but **not all are registered as plugin tools for OpenClaw host use yet**

## Experimental

These areas are implemented enough to be documented and tested, but should not be oversold as broadly battle-tested production features yet.

1. **Reflection and rule promotion loop**
   - experience logging, reflection generation, and automatic rule promotion are implemented
   - useful baseline exists
   - maturity depends on real-world tuning and operator review

2. **Projected profile recomputation**
   - stable/derived separation exists
   - explicit-over-inferred guard exists
   - likely still needs field validation and long-run behavior validation under real workloads

3. **Import/export and archive restore workflows**
   - review/apply gates are present
   - good operator baseline exists
   - still best treated as controlled operator workflows rather than fully hardened mass-migration tooling

4. **Prompt injection via recall context in `before_agent_start`**
   - implemented and valuable
   - operational quality depends on recall quality, rule quality, and host usage patterns

## Out of scope

The following should be considered outside the v1 claim for the current repository state.

1. **Bundled external LLM provider integration**
   - not included
   - host must inject an adapter if desired

2. **True vector database / embeddings stack**
   - no embedding model management
   - no external vector store
   - current semantic sidecar is lexical/statistical sidecar logic, not a full vector retrieval platform

3. **Background workers / schedulers / autonomous jobs**
   - not part of current implementation

4. **Rich operator UI / admin console**
   - no dedicated UI shipped here

5. **Claiming full plugin-tool parity for all library capabilities**
   - inaccurate today
   - only store / recall / status are registered as plugin tools in the OpenClaw integration layer

6. **Claiming production-hard multi-instance distribution maturity**
   - packaging exists and can be installed elsewhere
   - but distribution, compatibility, upgrade, and support guarantees are still limited

## Important distinction: library surface vs plugin-exposed surface

This repository has two different capability layers:

### A. Library/API surface

Via `initializeEverMemory()`, callers can access a broad set of internal services and wrapper methods.

This is larger than the current plugin tool surface.

### B. OpenClaw plugin-exposed surface

In `src/openclaw/plugin.ts`, the plugin currently registers only:

- `evermemory_store`
- `evermemory_recall`
- `evermemory_status`

So any document that presents all internal wrapper methods as already available to OpenClaw operators by default would be overstating the current host integration.

## What v1 should honestly promise

EverMemory v1 can honestly promise:

- deterministic local persistence
- inspectable write/retrieval behavior
- a working store/recall/status plugin baseline for OpenClaw
- a larger internal capability base that is already implemented and can be expanded into broader host exposure later

EverMemory v1 should **not** yet promise:

- fully mature enterprise-grade memory operations
- complete plugin exposure for every internal capability
- bundled LLM/vector infrastructure
- zero-tuning behavior across all hosts and workloads

## Evidence checkpoints used for this boundary freeze

This boundary was checked against the current repository state, including:

- `src/index.ts`
- `src/openclaw/plugin.ts`
- `src/tools/*`
- `src/storage/migrations.ts`
- `openclaw.plugin.json`
- `plugin.json`
- `package.json`
- current tests in `test/`

## Change rule for this document

If new host-registered tools or materially new runtime integrations are added, this file should be updated before broadening any README production/support claims.


## Continuity caveat (2026-03-13)

Even with Phase 1-7 implementation complete, current default production behavior should **not** yet be described as fully meeting the following operator expectation without additional remediation:

- automatic durable capture of real project knowledge from ordinary conversation
- non-empty, project-useful continuity briefing in realistic host sessions
- mature memory decay behavior for long-horizon, low-noise continuity

See:
- `docs/evermemory-continuity-decay-remediation-plan.md`

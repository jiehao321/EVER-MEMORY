# EverMemory Architecture

This document describes the current code structure, not the original product pitch.

**Version:** 2.1.0

## Runtime Shape

EverMemory currently has two primary entry paths:

- SDK/runtime assembly through [src/index.ts](/root/evermemory/src/index.ts)
- OpenClaw plugin registration through [src/openclaw/plugin.ts](/root/evermemory/src/openclaw/plugin.ts)

The package is no longer just a thin plugin adapter. It combines storage, retrieval, policy, profile, reflection, optional embeddings, and an optional Butler subsystem in one package.

## Main Layers

### 1. Storage

Core SQLite access lives in [src/storage](/root/evermemory/src/storage).

Important components:

- `db.ts`
- `migrations.ts`
- repositories for memory, profile, behavior, relations, semantic data, debug events, Butler state, and related records

Current schema head is defined in [src/storage/migrations.ts](/root/evermemory/src/storage/migrations.ts).

### 2. Core Services

Core service logic lives in [src/core](/root/evermemory/src/core), including:

- memory
- behavior
- briefing
- profile
- reflection
- intent
- setup
- Butler

This layer contains much of the project complexity. Several flows combine domain logic, persistence coordination, and best-effort side effects.

### 3. Retrieval and Embeddings

Retrieval lives in [src/retrieval](/root/evermemory/src/retrieval) with structured, keyword, and hybrid paths.

Embedding support lives in [src/embedding](/root/evermemory/src/embedding):

- local
- openai
- no-op fallback

Semantic retrieval is optional and designed to degrade gracefully when providers are unavailable.

### 4. Hooks and OpenClaw Adapter

OpenClaw-specific behavior is split across:

- [src/hooks](/root/evermemory/src/hooks)
- [src/openclaw](/root/evermemory/src/openclaw)

The plugin adapter:

- initializes the runtime
- registers hooks
- registers tool surfaces
- optionally wires Butler services

## Structural Characteristics

These are notable realities of the current codebase:

- Composition roots are large:
  - [src/index.ts](/root/evermemory/src/index.ts)
  - [src/openclaw/plugin.ts](/root/evermemory/src/openclaw/plugin.ts)
- Session-end processing is heavily orchestrated and best-effort.
- Some repository reads refresh lifecycle state and may write back updated rows.
- Butler is optional but deeply integrated when enabled.
- The package mixes user-facing plugin concerns and maintainer-facing operational concerns.

## Data and Control Flow

### Store path

Typical store flow:

1. sanitize and evaluate write policy
2. normalize memory payload
3. insert into storage
4. attempt semantic indexing
5. trigger lifecycle maintenance
6. optionally recompute profile
7. optionally trigger relation detection

### Message path

Typical `messageReceived` flow:

1. analyze intent
2. run recall-for-intent
3. optionally preload semantic hits
4. merge warnings, recalled items, and semantic items
5. load applicable behavior rules
6. write runtime interaction context
7. optionally compute proactive items

### Session-end path

Typical `sessionEnd` flow:

1. sanitize end-of-session text inputs
2. write experience log
3. optionally reflect and promote rules
4. run auto-promotion and stale-rule maintenance
5. run auto-capture
6. store learning insights
7. recompute profile and detect drift
8. run housekeeping/cleanup best-effort hooks

## Practical Reading Order

If you need to understand the system quickly, start here:

1. [src/index.ts](/root/evermemory/src/index.ts)
2. [src/openclaw/plugin.ts](/root/evermemory/src/openclaw/plugin.ts)
3. [src/core/memory/service.ts](/root/evermemory/src/core/memory/service.ts)
4. [src/retrieval/service.ts](/root/evermemory/src/retrieval/service.ts)
5. [src/hooks/messageReceived.ts](/root/evermemory/src/hooks/messageReceived.ts)
6. [src/hooks/sessionEnd.ts](/root/evermemory/src/hooks/sessionEnd.ts)

## Current Architecture Risks

- Wide composition roots make change impact hard to reason about.
- Several flows rely on best-effort exception swallowing for resilience.
- Documentation historically overstated simplicity relative to the current package scope.
- Release packaging and native dependency verification are still an active operational concern.

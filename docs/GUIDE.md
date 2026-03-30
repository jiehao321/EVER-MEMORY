# EverMemory User Guide

This guide describes the current maintained usage surface of the repository as it exists today.

## What EverMemory Is

EverMemory provides:

- a SQLite-backed memory store
- deterministic write and recall flows
- session briefing generation
- profile projection and rule governance
- import/export and archive review/restore
- an optional Butler subsystem for strategic overlays and insight review

It can be used as:

- an OpenClaw memory plugin
- a TypeScript SDK inside another Node.js application

## Requirements

- Node.js `>=22`
- npm
- OpenClaw `>=2026.3.22 <2027` when using the plugin path

Local semantic search depends on native/runtime pieces beyond plain TypeScript. If those dependencies are unavailable, the system is designed to degrade rather than fail completely.

## Install as an OpenClaw Plugin

```bash
openclaw plugins install evermemory@2.2.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

Relevant plugin metadata lives in:

- [package.json](/root/evermemory/package.json)
- [openclaw.plugin.json](/root/evermemory/openclaw.plugin.json)

## Install as an SDK

```bash
npm install evermemory
```

```ts
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({
  databasePath: './memory.db',
});
```

## Core Flows

### Store

Use `evermemoryStore` / `evermemory_store` to persist a memory item.

```ts
em.evermemoryStore({
  content: 'User prefers concise review comments.',
  source: { kind: 'tool', actor: 'system' },
  scope: { userId: 'user-1' },
  tags: ['review', 'style'],
});
```

Current behavior notes:

- content is sanitized and validated before write
- empty scope is rejected for non-system writes
- type and lifecycle may be inferred
- semantic indexing and relation detection are best-effort, not strict write blockers

### Recall

Use `evermemoryRecall` / `evermemory_recall` for structured, keyword, or hybrid recall.

```ts
const result = await em.evermemoryRecall({
  query: 'review style preference',
  mode: 'hybrid',
  scope: { userId: 'user-1' },
  limit: 5,
});
```

Current behavior notes:

- retrieval increments usage counters
- hybrid retrieval can degrade to non-semantic paths
- the result surface includes degradation metadata

### Briefing

Use `evermemoryBriefing` / `evermemory_briefing` to generate session briefing sections.

Sections currently include:

- identity
- constraints
- recent continuity
- active projects

### Profile and Rules

Use:

- `evermemory_profile`
- `profile_onboard`
- `evermemory_rules`
- `evermemory_reflect`
- `evermemory_consolidate`

These flows are present and wired, but they are built on top of deterministic heuristics and repo-managed SQLite state rather than a separate remote service.

### Butler

Butler is optional and increases scope. Current registered Butler tools are:

- `butler_status`
- `butler_brief`
- `butler_tune`
- `butler_review`

## Configuration

Configuration is primarily loaded through plugin config and environment variables.

### Plugin Config

See [openclaw.plugin.json](/root/evermemory/openclaw.plugin.json) for the current schema. Major areas:

- `enabled`
- `databasePath`
- `bootTokenBudget`
- `maxRecall`
- `debugEnabled`
- `semantic.*`
- `intent.*`
- `retrieval.*`
- `butler.*`

### Environment Variables

Current environment-driven embedding controls described in the repo:

- `EVERMEMORY_EMBEDDING_PROVIDER`
- `EVERMEMORY_LOCAL_MODEL`
- `EVERMEMORY_OPENAI_MODEL`
- `OPENAI_API_KEY`

## Known Repo-State Caveats

- The repository currently contains historical internal docs and process artifacts; use [INDEX.md](/root/evermemory/docs/INDEX.md) as the doc entrypoint.
- `npm test` is not green in the current repo snapshot because release packaging coverage is failing.
- The codebase currently mixes plugin runtime concerns, SDK concerns, and Butler concerns in a single package.

## Maintenance Commands

```bash
npm run check
npm test
npm pack --dry-run
```

Additional scripts exist in [package.json](/root/evermemory/package.json), but they should be treated as maintenance utilities, not all as part of the primary user path.

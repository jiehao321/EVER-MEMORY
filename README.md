# EverMemory

[![npm version](https://img.shields.io/npm/v/evermemory.svg)](https://www.npmjs.com/package/evermemory)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![tests](https://img.shields.io/badge/tests-110%20passing-brightgreen.svg)](#testing)

**Deterministic memory plugin for OpenClaw.**

[中文文档 (README.zh-CN.md)](./README.zh-CN.md)

---

## Why EverMemory?

AI assistants forget everything between sessions. Context evaporates, decisions get revisited, and hard-won knowledge disappears the moment a conversation ends. EverMemory gives OpenClaw a persistent, inspectable, and governable memory layer backed by SQLite WAL. Every fact stored is traceable, every recall is deterministic, and every rule that shapes memory behavior can be audited and rolled back.

## Features

### Memory

- **Store and recall** structured knowledge with typed entries (facts, decisions, preferences, procedures)
- **Hybrid retrieval** spanning keyword, structured, and semantic search in a single query
- **Built-in local semantic search** via `@xenova/transformers` -- no external API required
- **Import and export** full memory archives for backup, migration, or sharing

### Understanding

- **Session briefings** distill the most relevant memories into a token-budgeted summary
- **User profiles** track preferences, expertise, and working style across sessions
- **Rule governance** lets operators define, version, and roll back memory-shaping policies

### Evolution

- **Reflection engine** consolidates and refines stored knowledge over time
- **Experience evolution** promotes repeated patterns into durable, high-confidence entries
- **Observable lifecycle** with debug tracing, status introspection, and full audit trail

## Quick Start

### Install

```bash
npm install evermemory
```

### OpenClaw Plugin (One Command)

```bash
npx evermemory
```

This builds the project, registers the plugin in OpenClaw, and restarts the gateway. If OpenClaw is not installed, EverMemory runs as a standalone SDK.

### TypeScript SDK

```typescript
import { initializeEverMemory } from "evermemory";

const em = initializeEverMemory({ databasePath: "./memory.db" });

// Store a decision
const stored = em.evermemoryStore({
  content: "Replace Webpack with Vite for all new projects.",
  type: "decision",
  tags: ["tooling", "frontend"],
});

// Recall relevant memories
const results = await em.evermemoryRecall({
  query: "build tooling decisions",
  mode: "hybrid",
  limit: 5,
});

// Generate session briefing
const briefing = em.evermemoryBriefing({ tokenTarget: 900 });
```

## Architecture

```
┌─────────────────────────────────────────┐
│            OpenClaw Host                │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │       EverMemory Plugin           │  │
│  │                                   │  │
│  │  ┌─────────┐  ┌───────────────┐   │  │
│  │  │  Hooks  │  │    Tools      │   │  │
│  │  │ session │  │ store, recall │   │  │
│  │  │ message │  │ rules, brief  │   │  │
│  │  └────┬────┘  └───────┬───────┘   │  │
│  │       │               │           │  │
│  │  ┌────▼───────────────▼────────┐  │  │
│  │  │          Core               │  │  │
│  │  │  memory · rules · profile   │  │  │
│  │  │  briefing · reflection      │  │  │
│  │  │  retrieval · embedding      │  │  │
│  │  └────────────┬────────────────┘  │  │
│  │               │                   │  │
│  │  ┌────────────▼────────────────┐  │  │
│  │  │     SQLite WAL Storage      │  │  │
│  │  │     (better-sqlite3)        │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Tool Reference

EverMemory exposes 18 capabilities through the OpenClaw tool interface:

| Capability | OpenClaw Name | Notes |
|---|---|---|
| Store memory | `evermemory_store` | Alias: `memory_store`; returns `inferredType`, `inferredLifecycle` |
| Recall memory | `evermemory_recall` | Alias: `memory_recall`; returns `strategyUsed`, `semanticFallback` |
| **Edit memory** | `evermemory_edit` | update / delete / correct with ownership check and re-embedding |
| **Browse memories** | `evermemory_browse` | Filtered list with `atRiskOfArchival` flagging |
| Status | `evermemory_status` | Counts, KPIs, `semanticStatus`, `atRiskMemories`, `autoCapture` |
| Session briefing | `evermemory_briefing` | Token-budgeted startup context with `continuityScore` |
| Intent analysis | `evermemory_intent` | Deterministic heuristics + optional LLM; Chinese question support |
| Reflection | `evermemory_reflect` | Experience to lessons and candidate rules with `sourceExperienceIds` |
| Rules | `evermemory_rules` | List, freeze, deprecate, rollback; `appliedCount` per rule |
| Profile | `evermemory_profile` | Read or recompute; optional `PreferenceGraph` analysis |
| Onboarding | `profile_onboard` | First-run questionnaire |
| Consolidate | `evermemory_consolidate` | Merge duplicates, archive stale items; surfaces conflict pairs |
| Explain | `evermemory_explain` | Audit write, retrieval, rule decisions |
| Export | `evermemory_export` | Alias: `memory_export` |
| Import | `evermemory_import` | Alias: `memory_import` |
| Review archive | `evermemory_review` | Inspect archived items |
| Restore archive | `evermemory_restore` | Two-phase review/apply restore |
| Smartness | SDK-only | Intelligence score dashboard with `advice` per dimension |

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | Embedding provider: `local`, `openai`, or `none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `EVERMEMORY_OPENAI_MODEL` | provider default | OpenAI embedding model override |
| `OPENAI_API_KEY` | -- | Required when using the `openai` provider |

### Plugin Config

| Field | Default | Description |
|---|---|---|
| `databasePath` | auto-resolved | SQLite database location |
| `bootTokenBudget` | `1200` | Startup briefing token budget |
| `maxRecall` | `8` | Max recall items per query |
| `debugEnabled` | `true` | Enable debug event logging |
| `semantic.enabled` | `true` | Semantic search (built-in) |
| `semantic.maxCandidates` | `200` | Semantic candidate cap |
| `semantic.minScore` | `0.15` | Semantic recall threshold |
| `intent.useLLM` | `false` | Optional LLM intent enrichment |
| `intent.fallbackHeuristics` | `true` | Deterministic fallback |

## Performance Benchmarks

Measured on Apple M2 with Node.js 22, 10,000-entry database:

| Operation | Latency |
|---|---|
| `sessionStart` hook | 2.4 ms |
| `messageReceived` hook | 3.7 ms |
| `sessionEnd` hook | 11.3 ms |
| `store` | 2.2 ms |
| `recall` | 1.1 ms |

All hook latencies fall well within OpenClaw's budget, ensuring EverMemory adds negligible overhead to the assistant pipeline.

## Testing

EverMemory ships with 110 tests covering unit, integration, and end-to-end scenarios:

```bash
npm test
```

## Documentation

- [API Reference](docs/API.md)
- [User Guide](docs/GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](docs/CONTRIBUTING.md)

## Contributing

Contributions are welcome. Please read the [Contributing Guide](docs/CONTRIBUTING.md) before opening a pull request. All changes must pass `npm run validate` and maintain test coverage above 80%.

## License

[MIT](LICENSE)

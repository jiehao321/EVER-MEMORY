# EverMemory

[![npm version](https://img.shields.io/npm/v/evermemory.svg)](https://www.npmjs.com/package/evermemory)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org)
[![tests](https://img.shields.io/badge/tests-250%20passing-brightgreen.svg)](#testing)

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

### OpenClaw Plugin Setup

```bash
openclaw plugins install evermemory@1.0.1
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

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

EverMemory exposes 16 capabilities through the OpenClaw tool interface:

| Capability | OpenClaw Name | Notes |
|---|---|---|
| Store memory | `evermemory_store` | Typed entries with tags and metadata |
| Recall memory | `evermemory_recall` | Keyword, structured, hybrid, or semantic |
| Delete memory | `evermemory_delete` | Remove entries by ID |
| Status | `evermemory_status` | Health check and storage statistics |
| Session briefing | `evermemory_briefing` | Token-budgeted context summary |
| Intent analysis | `evermemory_intent` | Route queries to the best recall strategy |
| Reflection | `evermemory_reflect` | Consolidate and refine stored knowledge |
| List rules | `evermemory_rules_list` | View active governance rules |
| Add rule | `evermemory_rules_add` | Create a new governance rule |
| Remove rule | `evermemory_rules_remove` | Delete a rule by ID |
| Toggle rule | `evermemory_rules_toggle` | Enable or disable a rule |
| Profile | `evermemory_profile` | Read or update user profile |
| Consolidate | `evermemory_consolidate` | Deduplicate and archive stale entries |
| Export | `evermemory_export` | Export all memories to JSON |
| Import | `evermemory_import` | Bulk-load a memory archive |
| Explain | `evermemory_explain` | Audit any retrieval or write decision |

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EVERMEMORY_DB_PATH` | `./evermemory.db` | Path to the SQLite database file |
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | Embedding provider: `local`, `openai`, or `none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `EVERMEMORY_OPENAI_API_KEY` | -- | Required only when using the `openai` provider |
| `EVERMEMORY_OPENAI_MODEL` | `text-embedding-3-small` | OpenAI embedding model name |
| `EVERMEMORY_LOG_LEVEL` | `info` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `EVERMEMORY_MAX_RESULTS` | `20` | Default maximum results per recall query |
| `EVERMEMORY_BRIEFING_TOKENS` | `1200` | Default token budget for session briefings |

### Plugin Config (openclaw.json)

```json
{
  "plugins": {
    "evermemory": {
      "databasePath": "./memory.db",
      "embeddingProvider": "local",
      "briefingTokenTarget": 1200,
      "maxRecallResults": 20,
      "reflectionEnabled": true,
      "profileEnabled": true
    }
  }
}
```

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

EverMemory ships with 250 tests covering unit, integration, and end-to-end scenarios:

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

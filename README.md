# 🧠 EverMemory

> The deterministic memory plugin for OpenClaw — an AI butler that actively thinks, learns, and evolves.

[![npm version](https://img.shields.io/npm/v/evermemory)](https://www.npmjs.com/package/evermemory)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-unit%20suite-passing-brightgreen)]()

[中文文档](README.zh-CN.md)

## Why EverMemory?

Most AI assistants forget everything after each session. They can sound capable in the moment, but they lose decisions, user preferences, recurring constraints, and the lessons that should make future collaboration better. That forces users to repeat context and prevents real continuity.

EverMemory gives OpenClaw a persistent, inspectable memory system. It stores durable information in SQLite, retrieves it deterministically, projects user profiles and rules, and keeps governance surfaces for explanation, review, archive, export, import, and restore. The result is not just "long-term memory", but a memory layer you can audit and operate.

## Features

### 🗃️ Layer 1: Memory

- 16 core capabilities spanning store, recall, briefing, profile, rules, export/import, review, restore, reflection, and consolidation
- Deterministic persistence with SQLite and WAL-friendly local operation
- Keyword, structured, and hybrid recall modes
- Semantic sidecar support with graceful fallback when embeddings are unavailable
- Archive, review, and restore flows with review/apply gates
- JSON snapshot and Markdown/JSON OpenClaw export-import paths

### 🧠 Layer 2: Understanding

- Automatic user profile construction with stable fields and weak derived hints
- Behavior rule promotion and governance from interaction history
- Session briefing generation for continuity at startup
- Intent analysis for better recall routing and proactive context injection
- Cross-session continuity grounded in inspectable stored memories

### 🚀 Layer 3: Proactivity

- Active learning on `sessionEnd` through reflection and memory candidate extraction
- Proactive reminders via recall injection on relevant future sessions/messages
- Self-housekeeping through consolidation, deduplication, and stale-memory archiving
- Explainability tools for write, retrieval, rule, session, archive, and intent decisions

## Quick Start

### Installation

```bash
npm install evermemory

# Local semantic retrieval is built in and available after install
```

Install into OpenClaw:

```bash
openclaw plugins install evermemory@1.0.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

For local development:

```bash
npm install
npm run build
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### First Run

Initialize the first user profile with onboarding. In the current OpenClaw plugin, onboarding is registered as `profile_onboard`.

```json
{
  "userId": "u_001",
  "responses": [
    { "questionId": "display_name", "answer": "Alice" },
    { "questionId": "language", "answer": "English" }
  ]
}
```

### Basic Usage

Store a durable decision:

```json
{
  "content": "Technical decision: replace Webpack with Vite.",
  "kind": "decision"
}
```

Recall previous context:

```json
{
  "query": "Vite migration decision",
  "limit": 5
}
```

Inspect system state:

```json
{
  "userId": "u_001"
}
```

## Architecture

```text
┌─────────────────────────────────┐
│         OpenClaw Host           │
│  ┌───────────────────────────┐  │
│  │      EverMemory Plugin    │  │
│  │  ┌─────┐ ┌─────┐ ┌────┐   │  │
│  │  │Hooks│ │Tools│ │Core│   │  │
│  │  └──┬──┘ └──┬──┘ └─┬──┘   │  │
│  │     │       │       │      │  │
│  │  ┌──┴───────┴───────┴──┐   │  │
│  │  │   SQLite (WAL)      │   │  │
│  │  └─────────────────────┘   │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

At runtime, the plugin wires OpenClaw hooks (`sessionStart`, `messageReceived`, `sessionEnd`) to memory retrieval, continuity briefing, reflection, rule promotion, and archival workflows. The storage layer is local, deterministic, and inspectable rather than opaque.

## Performance

The latest local `npm test` run reported these hook benchmark medians, and the repository baseline also documents store/recall operation timings:

| Operation | Median | Limit |
|---|---:|---:|
| `sessionStart` | 2.4ms | 100ms |
| `messageReceived` | 3.7ms | 200ms |
| `sessionEnd` | 11.3ms | 500ms |
| `store` (per op) | 2.2ms | — |
| `recall` (per op) | 1.1ms | — |

## Quality

The repository positions EverMemory as a stable core with experimental advanced surfaces:

| Metric | Value |
|---|---|
| Tests | `250 total / 248 pass / 0 fail / 2 skipped` |
| Stable tool baseline | `store / recall / status` |
| Optional capability | semantic sidecar |
| Experimental capability | briefing, intent, reflect, rules, profile, import/export, review, restore |
| Security baseline | documented `0 critical` in release gate materials |
| Language/runtime | TypeScript on Node.js 22+ |

## Tool Commands

The SDK has 16 core capabilities. In the current OpenClaw plugin, onboarding is exposed as `profile_onboard`, and smartness is not registered as a standalone tool.

| Capability | OpenClaw name | Notes |
|---|---|---|
| Store memory | `evermemory_store` | Alias: `memory_store` |
| Recall memory | `evermemory_recall` | Alias: `memory_recall` |
| Status | `evermemory_status` | Counts, state, continuity KPIs |
| Session briefing | `evermemory_briefing` | Startup summary |
| Intent analysis | `evermemory_intent` | Intent heuristics |
| Reflection | `evermemory_reflect` | Lessons and candidate rules |
| Rules | `evermemory_rules` | Governance/read-mutate surface |
| Profile | `evermemory_profile` | Read or recompute |
| Onboarding | `profile_onboard` | First-run questionnaire |
| Consolidate | `evermemory_consolidate` | Dedupe/archive maintenance |
| Explain | `evermemory_explain` | Audit decisions |
| Export | `evermemory_export` | Alias: `memory_export` |
| Import | `evermemory_import` | Alias: `memory_import` |
| Review archive | `evermemory_review` | Inspect archived items |
| Restore archive | `evermemory_restore` | Review/apply restore |
| Smartness | SDK-only | Not currently host-registered |

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | Embedding mode: `local`, `openai`, or `none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `EVERMEMORY_OPENAI_MODEL` | provider default | OpenAI embedding model override |
| `OPENAI_API_KEY` | — | Required for OpenAI embeddings |

### Plugin Config

| Field | Default behavior | Description |
|---|---|---|
| `databasePath` | auto-resolved path | SQLite database location |
| `bootTokenBudget` | `1200` | Startup briefing budget |
| `maxRecall` | `8` | Max recall items per query |
| `debugEnabled` | `true` | Enable debug event logging |
| `semantic.enabled` | `false` unless configured | Semantic sidecar toggle |
| `semantic.maxCandidates` | validated integer | Semantic candidate cap |
| `semantic.minScore` | validated number | Semantic recall threshold |
| `intent.useLLM` | host-configured | Optional LLM intent enrichment |
| `intent.fallbackHeuristics` | `true` | Keep deterministic fallback enabled |

## Documentation

- [API Reference](docs/API.md)
- [User Guide](docs/GUIDE.md)
- [Changelog](docs/CHANGELOG.md)

## Contributing

Run the local validation path before proposing changes:

```bash
npm run build
npm test
```

If you change plugin behavior, also review the docs under `docs/` so the capability matrix, guide, and changelog stay aligned with implementation reality.

## License

MIT

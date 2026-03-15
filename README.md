# EverMemory

Deterministic memory plugin for OpenClaw with inspectable storage, recall, profiling, and rule governance.

## Install

```bash
npm install evermemory
```

## Quick Start

1. Build or install the package and point OpenClaw to it.
2. Enable the plugin and bind it to the memory slot.
3. Start a session and use `evermemory_store`, `evermemory_recall`, or `evermemory_status`.

```bash
npm install
npm run build
openclaw plugins install /path/to/evermemory --link
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

## Features

- Deterministic memory write and recall with SQLite persistence
- Structured, keyword, and hybrid retrieval strategies
- Session hooks for boot briefing, recall injection, and session-end learning
- Optional semantic sidecar with local or hosted embeddings
- Intent analysis, reflection, behavior rules, and profile projection
- Explain, export, import, review, restore, and dashboard scripts for operators

## Config

- `databasePath`: SQLite database path
- `bootTokenBudget`: session boot briefing budget
- `maxRecall`: max recall items per query
- `debugEnabled`: enable debug event logging
- `semantic.enabled`: enable semantic sidecar
- `semantic.maxCandidates`: semantic candidate cap
- `semantic.minScore`: semantic recall threshold
- `intent.useLLM`: enable LLM intent enrichment
- `intent.fallbackHeuristics`: keep heuristic fallback enabled

## Docs

Detailed guides, release notes, and operations docs live under `docs/`.

# EverMemory

EverMemory is a TypeScript memory system for OpenClaw. It combines a local SQLite-backed memory store, retrieval and briefing flows, profile projection, rule governance, import/export tools, and an optional Butler layer for strategic overlays.

This repository is active and functional, but the current repo state matters:

- `npm run check` passes
- `npm test` currently fails in release-packaging coverage
- `npm pack --dry-run` succeeds

If you are evaluating the project, read the docs in [docs/INDEX.md](docs/INDEX.md) before treating historical claims in older internal material as current truth.

## What It Contains

- Persistent memory storage on SQLite (`better-sqlite3`)
- Deterministic write policy and retrieval pipeline
- Session briefing, profile projection, reflection, and rules flows
- OpenClaw plugin adapter and tool registration
- Optional local semantic search and optional OpenAI embeddings
- Optional Butler subsystem for strategic overlays, task queues, and insight review

## Current Scope

The codebase currently exposes:

- EverMemory SDK functions for memory, briefing, profile, reflection, import/export, relations, and status flows
- Butler SDK helpers for status, briefing, tuning, and review
- OpenClaw tool registration across memory, briefing/status, profile/rules, import/export, and Butler surfaces

The repo is not a minimal plugin package anymore. It is a plugin-plus-runtime codebase with operations scripts, internal references, release checks, and historical planning material.

## Installation

### OpenClaw plugin

```bash
openclaw plugins install evermemory@2.1.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### SDK dependency

```bash
npm install evermemory
```

## Minimal SDK Example

```ts
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({
  databasePath: './memory.db',
});

const storeResult = em.evermemoryStore({
  content: 'User prefers concise code review comments.',
  source: { kind: 'tool', actor: 'system' },
  scope: { userId: 'user-1' },
});

const recallResult = await em.evermemoryRecall({
  query: 'code review preference',
  mode: 'hybrid',
  scope: { userId: 'user-1' },
  limit: 5,
});
```

## Runtime Requirements

- Node.js `>=22`
- OpenClaw peer dependency `>=2026.3.22 <2027`
- SQLite native dependency via `better-sqlite3`
- Optional native/image stack for local embeddings via `sharp` and `@xenova/transformers`

## Known Caveats

- The repository currently contains historical internal and process documents; only the docs linked from [docs/INDEX.md](docs/INDEX.md) should be treated as maintained entrypoints.
- The release-packaging tests currently fail in this repo snapshot; do not describe packaging/native bundling as fully verified unless you re-run and confirm.
- Local semantic search is optional and may degrade gracefully when embedding dependencies are unavailable.
- The Butler layer exists in code and plugin registration, but it materially increases system scope and operational complexity.

## Documentation

- [Documentation Index](docs/INDEX.md)
- [User Guide](docs/GUIDE.md)
- [API Reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Changelog](docs/CHANGELOG.md)
- [Security Policy](SECURITY.md)
- [中文 README](README.zh-CN.md)

## Development

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

For a fuller maintenance view, see [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

# EverMemory

[中文](README.zh-CN.md) | English

**Long-term memory for OpenClaw that stays useful at the moment it matters.**

`OpenClaw plugin` `Local SQLite memory` `Governed write/recall` `Optional semantic recall`

It helps an agent remember preferences, constraints, recurring facts, and session context, then bring the right pieces back when they matter. Instead of treating memory as a raw chat dump, EverMemory stores it locally, governs what gets written, and turns recall into briefings, profiles, and usable context.

## Why It Feels Different

- It remembers more than chat history: user preferences, identity facts, constraints, recurring patterns, and working context.
- It stores memory locally in SQLite, so your agent is not depending on fragile in-session recall alone.
- It uses governed write and recall behavior instead of blindly saving everything.
- It can build briefings, profiles, and rules overlays instead of dumping raw memory lists back into the prompt.
- It can add optional semantic recall and an optional Butler layer when you want a broader strategic overlay.

## A Concrete Example

Imagine a user tells your OpenClaw agent:

- “Keep code review comments concise.”
- “I work in Asia/Shanghai.”
- “Stop asking me the same onboarding questions every session.”

With EverMemory in place, those details do not need to be repeated every time. Later sessions can recover them, re-rank them against the current task, and feed them back into the agent as recall results, session briefings, or profile context.

That is the point of the plugin: not just to remember, but to remember in a way the agent can actually use.

## Quick Start

### Install As An OpenClaw Plugin

```bash
openclaw plugins install evermemory@2.1.0
openclaw plugins enable evermemory
openclaw config set plugins.slots.memory evermemory
openclaw gateway restart
```

### Install As An SDK

```bash
npm install evermemory
```

## What You Get

- Persistent memory storage on SQLite via `better-sqlite3`
- Governed memory write and recall behavior for OpenClaw workflows
- Session briefing and recall flows for bringing the right context back
- Profile projection and rule-governance layers for longer-running agent relationships
- Import/export tools for moving memory across environments
- Optional semantic recall with local or OpenAI-backed embeddings
- Optional Butler overlays for strategic summaries, review flows, and broader operational context

## How It Works

1. **Capture**
   The agent sees messages, tool outputs, and session signals that may be worth remembering.
2. **Store**
   EverMemory decides what should be persisted, then writes it into a local SQLite-backed memory store.
3. **Retrieve**
   Later queries use governed keyword, structured, and optional semantic recall to find relevant memory.
4. **Brief And Govern**
   Retrieved memory can feed briefings, profile projections, and rule flows so the agent acts with continuity instead of starting cold every time.

## Minimal SDK Example

```ts
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({
  databasePath: './memory.db',
});

em.evermemoryStore({
  content: 'User prefers concise code review comments.',
  source: { kind: 'tool', actor: 'system' },
  scope: { userId: 'user-1' },
});

const recall = await em.evermemoryRecall({
  query: 'code review preference',
  mode: 'hybrid',
  scope: { userId: 'user-1' },
  limit: 5,
});
```

## Requirements

- Node.js `>=22`
- OpenClaw peer dependency `>=2026.3.22 <2027`
- SQLite native dependency via `better-sqlite3`
- Optional native/image stack for local embeddings via `sharp` and `@xenova/transformers`

## Caveats

- The maintained public docs are the ones linked from [docs/INDEX.md](docs/INDEX.md). Historical internal material should not be treated as the current product contract.
- `npm run check` passes in the current repo snapshot.
- `npm test` currently fails in release-packaging coverage, so native bundling should not be described as fully verified unless re-tested.
- `npm pack --dry-run` succeeds, but packaging confidence is still gated by the failing release coverage tests above.
- Semantic recall is optional and may degrade gracefully when embedding dependencies are unavailable.
- The Butler layer is optional, but it materially increases system scope and operational complexity.

## Documentation

- [Documentation Index](docs/INDEX.md)
- [User Guide](docs/GUIDE.md)
- [API Reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Contributing](docs/CONTRIBUTING.md)
- [Changelog](docs/CHANGELOG.md)
- [Security Policy](SECURITY.md)
- [中文 README](README.zh-CN.md)

## Development Snapshot

```bash
npm install
npm run check
npm test
npm pack --dry-run
```

For a maintainer-oriented view of the repository, start with [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

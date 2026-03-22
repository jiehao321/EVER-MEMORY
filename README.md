<p align="center">
  <h1 align="center">EverMemory</h1>
  <p align="center">
    <strong>Give your AI assistant a brain that never forgets.</strong>
  </p>
  <p align="center">
    Persistent, intelligent memory for <a href="https://github.com/openclaw">OpenClaw</a> agents — <br/>
    store knowledge, build relationships, recall proactively, learn continuously.
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/evermemory"><img src="https://img.shields.io/npm/v/evermemory.svg?style=flat-square&color=cb3837" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/evermemory"><img src="https://img.shields.io/npm/dm/evermemory.svg?style=flat-square&color=blue" alt="npm downloads"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg?style=flat-square" alt="license"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg?style=flat-square" alt="node"></a>
    <img src="https://img.shields.io/badge/tests-430%20passing-brightgreen.svg?style=flat-square" alt="tests">
    <img src="https://img.shields.io/badge/TypeScript-strict-blue.svg?style=flat-square" alt="typescript">
  </p>
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> &bull;
  <a href="#-features">Features</a> &bull;
  <a href="#-how-it-works">How It Works</a> &bull;
  <a href="#-tool-reference">Tool Reference</a> &bull;
  <a href="docs/API.md">API Docs</a> &bull;
  <a href="docs/GUIDE.md">User Guide</a> &bull;
  <a href="./README.zh-CN.md">中文文档</a>
</p>

---

## The Problem

AI assistants are **goldfish**. Every session starts from zero — decisions get revisited, preferences are forgotten, and hard-won context evaporates. You repeat yourself endlessly.

## The Solution

EverMemory gives your AI a **persistent, intelligent memory layer** that:

- **Remembers** everything important across sessions
- **Connects** knowledge through an automatic knowledge graph
- **Proactively surfaces** relevant context before you even ask
- **Learns** your preferences and adapts over time
- **Stays auditable** — every fact is traceable, every rule is reversible

> Think of it as giving your AI assistant a personal butler who remembers every conversation, anticipates your needs, and keeps getting better at the job.

---

## Quick Start

### One-line install (OpenClaw plugin)

```bash
npx evermemory
```

That's it. EverMemory registers itself as an OpenClaw plugin and starts working immediately.

### Or install as a dependency

```bash
npm install evermemory
```

### Use the TypeScript SDK

```typescript
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({ databasePath: './memory.db' });

// Store a decision
em.evermemoryStore({
  content: 'Replace Webpack with Vite for all new projects.',
  type: 'decision',
  tags: ['tooling', 'frontend'],
});

// Recall relevant memories — hybrid keyword + semantic search
const results = await em.evermemoryRecall({
  query: 'build tooling decisions',
  mode: 'hybrid',
  limit: 5,
});

// Generate a session briefing
const briefing = em.evermemoryBriefing({ tokenTarget: 900 });
```

---

## Features

### Persistent Memory

| Capability | What it does |
|:---|:---|
| **Typed storage** | Store facts, decisions, preferences, procedures with lifecycle tracking |
| **Hybrid retrieval** | Keyword + structured + semantic search in a single query |
| **Local semantic search** | Built-in embeddings via `@xenova/transformers` — no external API needed |
| **Edit & browse** | Update, correct, delete, or browse your memory inventory |
| **Import / export** | Full memory archives in JSON or Markdown for backup and migration |

### Knowledge Graph

| Capability | What it does |
|:---|:---|
| **Auto relation detection** | Automatically identifies causes, contradictions, evolution, and support links |
| **7 relation types** | `causes` `contradicts` `supports` `evolves_from` `supersedes` `depends_on` `related_to` |
| **Graph-enhanced recall** | Boosts search results using relationship connections |
| **Transitive inference** | A causes B, B causes C → A indirectly causes C |
| **Contradiction alerts** | Real-time warnings when new memories conflict with existing knowledge |

### Proactive Intelligence

| Capability | What it does |
|:---|:---|
| **Proactive recall** | Surfaces relevant memories you didn't ask for — expiring commitments, related context |
| **Predictive context** | Predicts what you'll need based on session history patterns |
| **Adaptive retrieval** | Automatically tunes search weights based on what you actually use |
| **Commitment reminders** | Reminds you about decisions and promises that might need follow-up |
| **Decay warnings** | Alerts when important memories haven't been accessed and risk archival |

### Continuous Evolution

| Capability | What it does |
|:---|:---|
| **Session briefings** | Token-budgeted summaries of your most relevant memories at session start |
| **User profiling** | Tracks preferences, expertise, and working style across sessions |
| **Rule governance** | Define, version, audit, and roll back memory-shaping policies |
| **Memory compression** | Clusters similar memories into concise summaries over time |
| **Self-tuning decay** | Adapts retention based on actual usage — useful memories live longer |
| **Preference drift detection** | Tracks how your preferences change and flags reversals |

---

## How It Works

```
                        ┌──────────────────────────────────────────┐
                        │           OpenClaw / Your App            │
                        └──────────────┬───────────────────────────┘
                                       │
                        ┌──────────────▼───────────────────────────┐
                        │          EverMemory Plugin               │
                        │                                          │
                        │  ┌──────────┐      ┌──────────────────┐  │
                        │  │  Hooks   │      │   19 SDK Tools   │  │
                        │  │ session  │      │ store · recall   │  │
                        │  │ message  │      │ edit · browse    │  │
                        │  │ start/end│      │ rules · brief    │  │
                        │  └────┬─────┘      │ relations · ...  │  │
                        │       │            └────────┬─────────┘  │
                        │  ┌────▼─────────────────────▼─────────┐  │
                        │  │            Core Engine              │  │
                        │  │                                     │  │
                        │  │  Memory    Knowledge   Proactive    │  │
                        │  │  Service   Graph       Recall       │  │
                        │  │                                     │  │
                        │  │  Retrieval  Profile    Behavior     │  │
                        │  │  Engine     Engine     Rules        │  │
                        │  │                                     │  │
                        │  │  Reflection Compression Briefing    │  │
                        │  │  Engine     Engine      Builder     │  │
                        │  └──────────────┬─────────────────────┘  │
                        │                 │                         │
                        │  ┌──────────────▼─────────────────────┐  │
                        │  │   SQLite WAL (better-sqlite3)      │  │
                        │  │   18 schema migrations · 6 tables  │  │
                        │  └────────────────────────────────────┘  │
                        └──────────────────────────────────────────┘
```

**Key design principles:**

- **Deterministic** — No LLM in the critical path. All retrieval, scoring, and relation detection use rule-based algorithms.
- **Zero external dependencies** — SQLite WAL + optional local embeddings. No cloud APIs required.
- **Auditable** — Every store, recall, rule change, and relation is traced in debug events.
- **Graceful degradation** — Semantic search unavailable? Falls back to keyword. Embedding cold? Still works.

---

## Tool Reference

EverMemory exposes **19 SDK tools** (18 via OpenClaw + 1 SDK-only):

| Tool | OpenClaw Name | Description |
|:---|:---|:---|
| **Store** | `evermemory_store` | Store typed memories with tags and lifecycle tracking |
| **Recall** | `evermemory_recall` | Hybrid keyword + structured + semantic search |
| **Edit** | `evermemory_edit` | Update, delete, correct, merge, pin/unpin memories |
| **Browse** | `evermemory_browse` | Filtered inventory with at-risk-of-archival flags |
| **Relations** | `evermemory_relations` | List, add, remove graph edges; explore subgraphs |
| **Status** | `evermemory_status` | Health, counts, KPIs, semantic status, alerts |
| **Briefing** | `evermemory_briefing` | Token-budgeted session startup context |
| **Intent** | `evermemory_intent` | Deterministic intent analysis (supports Chinese) |
| **Reflect** | `evermemory_reflect` | Extract lessons and candidate rules from experience |
| **Rules** | `evermemory_rules` | List, freeze, deprecate, rollback behavior rules |
| **Profile** | `evermemory_profile` | Read or recompute user preference profile |
| **Onboard** | `profile_onboard` | First-run questionnaire for new users |
| **Consolidate** | `evermemory_consolidate` | Merge duplicates, archive stale items |
| **Explain** | `evermemory_explain` | Audit trail for write, retrieval, and rule decisions |
| **Export** | `evermemory_export` | Export memory archive (JSON / Markdown) |
| **Import** | `evermemory_import` | Import with validation, preview mode, duplicate skip |
| **Review** | `evermemory_review` | Inspect archived memory candidates |
| **Restore** | `evermemory_restore` | Two-phase review/apply archive restoration |
| **Smartness** | _SDK-only_ | Intelligence score dashboard with per-dimension advice |

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|:---|:---|:---|
| `EVERMEMORY_EMBEDDING_PROVIDER` | `local` | `local`, `openai`, or `none` |
| `EVERMEMORY_LOCAL_MODEL` | `Xenova/all-MiniLM-L6-v2` | Local embedding model |
| `EVERMEMORY_OPENAI_MODEL` | provider default | OpenAI model override |
| `OPENAI_API_KEY` | — | Required for `openai` provider |

### Plugin Config (`openclaw.plugin.json`)

| Field | Default | Description |
|:---|:---|:---|
| `databasePath` | auto | SQLite database location |
| `bootTokenBudget` | `1200` | Briefing token budget |
| `maxRecall` | `8` | Max items per recall query |
| `debugEnabled` | `true` | Debug event logging |
| `semantic.enabled` | `true` | Enable semantic search |
| `semantic.maxCandidates` | `200` | Semantic candidate cap |
| `semantic.minScore` | `0.15` | Semantic similarity threshold |

---

## Performance

Measured on Apple M2, Node.js 22, 10,000-entry database:

| Operation | Latency | Budget |
|:---|:---|:---|
| `store` | 2.2 ms | — |
| `recall` | 1.1 ms | < 300 ms |
| `messageReceived` hook | 3.7 ms | < 500 ms |
| `sessionStart` hook | 2.4 ms | — |
| `sessionEnd` hook | 11.3 ms | < 8 s |

All operations stay well within OpenClaw's latency budgets. EverMemory adds negligible overhead.

---

## Testing

```bash
npm test             # 430 tests across 36 suites
npm run validate     # Full validation (doctor + typecheck + tests)
npm run e2e:smoke    # OpenClaw real-machine smoke test
```

**Quality metrics:**
- Recall accuracy: **1.0**
- Unit test pass rate: **100%**
- Cross-session continuity: **verified**
- Auto-capture accept rate: **0.75**

---

## Documentation

| Document | Description |
|:---|:---|
| [API Reference](docs/API.md) | Complete tool API with parameters and examples |
| [User Guide](docs/GUIDE.md) | Getting started, workflows, best practices |
| [Architecture](docs/ARCHITECTURE.md) | System design, data flow, schema details |
| [Changelog](docs/CHANGELOG.md) | Version history and migration notes |
| [Contributing](docs/CONTRIBUTING.md) | Development setup and contribution guidelines |

---

## Roadmap

- [ ] Multi-language i18n (Chinese / English auto-detection)
- [ ] First-run guided onboarding
- [ ] Streaming recall for large result sets
- [ ] ClawHub marketplace listing
- [ ] Visual knowledge graph explorer
- [ ] Plugin ecosystem (custom relation types, retrieval strategies)

---

## Contributing

Contributions are welcome! Please read the [Contributing Guide](docs/CONTRIBUTING.md) before opening a PR.

```bash
git clone https://github.com/jiehao321/EVER-MEMORY.git
cd EVER-MEMORY
npm install
npm run validate   # Must pass before submitting
```

All changes must pass `npm run validate` and maintain test coverage above 80%.

---

## License

[MIT](LICENSE) — use it freely in personal and commercial projects.

---

<p align="center">
  <sub>Built with SQLite, TypeScript, and a belief that AI assistants deserve a real memory.</sub>
</p>

# EverMemory Capability Matrix

_Last reviewed: 2026-03-14_

This matrix maps current code to support level.

Support levels used here:

- **Stable**: implemented, clearly wired, and appropriate to present as current baseline
- **Optional**: real capability, but off by default or dependent on host/operator enablement
- **Experimental**: present and useful, but not yet mature enough to market as hardened default
- **Out-of-scope**: not provided by the current repository

## Matrix

| Capability area | Current state in repo | Host/plugin exposure | Support level | Notes |
|---|---|---:|---|---|
| SQLite persistence | Implemented | Indirect | Stable | `better-sqlite3`, bootstrap, repository-backed storage |
| Idempotent migrations | Implemented | Indirect | Stable | Present in `src/storage/migrations.ts` |
| Deterministic write policy | Implemented | Yes | Stable | Backing `evermemory_store` and service-level writes |
| Memory store tool | Implemented | Yes | Stable | Registered in `src/openclaw/plugin.ts` |
| Keyword recall | Implemented | Yes | Stable | Backing `evermemory_recall` |
| Structured recall mode | Implemented | Yes | Stable | Available via `evermemory_recall` mode parameter |
| Hybrid recall mode | Implemented | Yes | Optional | Falls back when semantic sidecar disabled |
| Semantic sidecar index | Implemented | Library/API | Optional | Disabled by default; not a full vector DB |
| Status/debug surface | Implemented | Yes | Stable | `evermemory_status` registered |
| Boot briefing generation | Implemented | Yes | Experimental | Exposed via `evermemory_briefing` |
| Intent heuristics | Implemented | Yes | Experimental | Exposed via `evermemory_intent` and hooks |
| Optional LLM intent enrichment | Implemented | Library/API | Optional | Requires injected analyzer; no bundled provider |
| `before_agent_start` recall injection | Implemented | Automatic hook | Experimental | Depends on recall/rule quality |
| Experience logging | Implemented | Hook/internal | Experimental | Triggered in session flow |
| Reflection generation | Implemented | Yes | Experimental | Exposed via `evermemory_reflect` |
| Behavior rule promotion | Implemented | Yes | Experimental | Exposed via `evermemory_rules` (read/mutation) + hooks |
| Projected profile recompute | Implemented | Yes | Experimental | Exposed via `evermemory_profile` |
| Consolidation (dedupe/archive stale) | Implemented | Yes | Experimental | Exposed via `evermemory_consolidate` |
| Explainability tool logic | Implemented | Yes | Experimental | Exposed via `evermemory_explain` |
| Export snapshot | Implemented | Yes | Experimental | Exposed via `evermemory_export` |
| Import snapshot | Implemented | Yes | Experimental | Exposed via `evermemory_import` (review/apply gate) |
| Archive review | Implemented | Yes | Experimental | Exposed via `evermemory_review` |
| Archive restore | Implemented | Yes | Experimental | Exposed via `evermemory_restore` |
| Direct install as OpenClaw plugin package | Packaging present | N/A | Optional | `dist`, `openclaw.plugin.json`, `plugin.json` are present; cross-host installation should be treated as operator-managed |
| Bundled LLM provider integration | Not implemented | No | Out-of-scope | Host must inject adapter |
| Embeddings / external vector store | Not implemented | No | Out-of-scope | Current semantic sidecar is not a full vector system |
| Background jobs / schedulers | Not implemented | No | Out-of-scope | No worker/scheduler runtime in repo |
| Rich admin/operator UI | Not implemented | No | Out-of-scope | Docs and status exist, but no dedicated UI |
| Full host-registered tool parity for all wrappers | Implemented | Yes | Experimental | Plugin tool registration now covers all wrapper tools |

## Currently registered OpenClaw plugin tools

Based on `src/openclaw/plugin.ts`, the plugin currently registers:

- `evermemory_store`
- `evermemory_recall`
- `evermemory_status`
- `evermemory_briefing`
- `evermemory_intent`
- `evermemory_reflect`
- `evermemory_rules`
- `evermemory_profile`
- `evermemory_consolidate`
- `evermemory_explain`
- `evermemory_export`
- `evermemory_import`
- `evermemory_review`
- `evermemory_restore`

Core aliases:
- `memory_store` -> `evermemory_store`
- `memory_recall` -> `evermemory_recall`

## Implemented wrapper/library methods not yet host-registered as plugin tools

As of 2026-03-14, there are no known wrapper methods missing host registration in the default plugin path.

## Packaging reality check

The repository contains:

- `dist/`
- `plugin.json`
- `openclaw.plugin.json`
- package metadata in `package.json`

That is enough to justify documenting **direct install for other OpenClaw instances** as a supported operator path in a limited sense.

However, the honest claim is:

- package/install path exists
- operator-managed installation is plausible
- broad compatibility/support guarantees are still limited at version `0.0.1`

## Recommendation for README language

Use language like:

- "production baseline" instead of "production complete"
- "stable core" for store / recall / status
- "optional" for semantic sidecar and injected LLM enrichment
- "experimental" for reflection/rules/profile/import-export/archive workflows
- "out-of-scope" for bundled LLMs, embeddings/vector DB, schedulers, and rich UI


## Continuity product gap note (2026-03-13)

The matrix should distinguish between:
- implemented subsystems
- host-registered tools
- operator-observed continuity quality

Current known product gap:
- continuity quality in real project conversations is below target because automatic durable project-memory capture and richer project briefing are not yet fully productized.

Reference: `docs/evermemory-continuity-decay-remediation-plan.md`

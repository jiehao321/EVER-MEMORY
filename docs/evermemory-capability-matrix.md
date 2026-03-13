# EverMemory Capability Matrix

_Last reviewed: 2026-03-13_

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
| Structured recall mode | Implemented | Library/API | Stable | Available via retrieval service / wrapper method |
| Hybrid recall mode | Implemented | Library/API | Optional | Falls back when semantic sidecar disabled |
| Semantic sidecar index | Implemented | Library/API | Optional | Disabled by default; not a full vector DB |
| Status/debug surface | Implemented | Yes | Stable | `evermemory_status` registered |
| Boot briefing generation | Implemented | Library/API | Experimental | Real capability, but not host-registered as plugin tool today |
| Intent heuristics | Implemented | Library/API | Experimental | Used in hooks; not plugin-registered as standalone host tool |
| Optional LLM intent enrichment | Implemented | Library/API | Optional | Requires injected analyzer; no bundled provider |
| `before_agent_start` recall injection | Implemented | Automatic hook | Experimental | Depends on recall/rule quality |
| Experience logging | Implemented | Hook/internal | Experimental | Triggered in session flow |
| Reflection generation | Implemented | Library/API | Experimental | Baseline exists; needs more production mileage |
| Behavior rule promotion | Implemented | Hook/internal | Experimental | Real gating logic exists; tuning likely needed |
| Projected profile recompute | Implemented | Library/API | Experimental | Stable/derived split exists |
| Consolidation (dedupe/archive stale) | Implemented | Library/API | Experimental | Good baseline, not current plugin tool |
| Explainability tool logic | Implemented | Library/API | Experimental | Wrapper exists, but not registered in plugin layer |
| Export snapshot | Implemented | Library/API | Experimental | Reviewable, useful for operators |
| Import snapshot | Implemented | Library/API | Experimental | Guarded workflow; not yet broad production claim |
| Archive review | Implemented | Library/API | Experimental | Useful operator workflow |
| Archive restore | Implemented | Library/API | Experimental | Review/apply gating exists |
| Direct install as OpenClaw plugin package | Packaging present | N/A | Optional | `dist`, `openclaw.plugin.json`, `plugin.json` are present; cross-host installation should be treated as operator-managed |
| Bundled LLM provider integration | Not implemented | No | Out-of-scope | Host must inject adapter |
| Embeddings / external vector store | Not implemented | No | Out-of-scope | Current semantic sidecar is not a full vector system |
| Background jobs / schedulers | Not implemented | No | Out-of-scope | No worker/scheduler runtime in repo |
| Rich admin/operator UI | Not implemented | No | Out-of-scope | Docs and status exist, but no dedicated UI |
| Full host-registered tool parity for all wrappers | Not implemented | No | Out-of-scope | Current plugin only registers store / recall / status |

## Currently registered OpenClaw plugin tools

Based on `src/openclaw/plugin.ts`, the plugin currently registers:

- `evermemory_store`
- `evermemory_recall`
- `evermemory_status`

These are the only tool names that should be treated as current OpenClaw plugin-exposed tools by default.

## Implemented wrapper/library methods not yet host-registered as plugin tools

Based on `src/index.ts`, the package also exposes wrapper methods for:

- `evermemoryBriefing`
- `evermemoryIntent`
- `evermemoryReflect`
- `evermemoryRules`
- `evermemoryProfile`
- `evermemoryConsolidate`
- `evermemoryExplain`
- `evermemoryExport`
- `evermemoryImport`
- `evermemoryReview`
- `evermemoryRestore`

These are real capabilities in the codebase, but they should not be presented as automatically available OpenClaw plugin tools unless the plugin registration layer is expanded.

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
- broad compatibility/support guarantees are still limited at version `0.1.0`

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

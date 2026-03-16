# EverMemory Guide (CLAUDE)

## Project Overview
- EverMemory: deterministic memory plugin for OpenClaw, current version v1.0.2.
- Goal: reliable, explainable, rollback-capable workflows for knowledge storage, recall, rule governance, and user profiling.
- Stack: Node.js 22.x, TypeScript strict ESM, SQLite WAL, better-sqlite3, TypeBox.
- Principles: determinism first, operator first, progressive hardening.

## Architecture
- `src/core/`: memory, behavior, briefing, intent, reflection, profile, analytics, I/O, policy, setup.
- `src/retrieval/`: structured, keyword, hybrid, semantic retrieval strategies.
- `src/embedding/`: none/local/openai provider abstraction with graceful degradation.
- `src/storage/`: SQLite repositories, idempotent migrations, debug/profile/experience/semantic tables.
- `src/hooks/` & `src/openclaw/`: lifecycle hooks and OpenClaw plugin adapter.
- `src/tools/`: 16 tool implementations (store, recall, rules, briefing, status, import/export, profile, etc.).
- `test/` + `scripts/`: test suites and CI/operations scripts.

## Build & Validation
```bash
npm run build          # Build with fingerprint cache
npm run check          # TypeScript type check
npm test               # Unit tests
npm run validate       # Full: doctor + check + test
npm run teams:dev      # Dev gate (~17s)
npm run teams:release  # Release gate
```

## Development Rules
1. Default to TDD: red → green → refactor.
2. Code review after any logic change; build must pass (`npm run build`).
3. Every new capability must be explainable, rollback-capable, with explicit error handling.
4. Never break determinism, idempotent migrations, or operator-first principle.

## Coding Standards
- High cohesion, low coupling; small files; split complex logic with minimal comments.
- Structured config over magic numbers; use TypeBox schemas at boundaries.
- Immutable data patterns; new behavior must support observability and rollback.

## Testing
- Node.js `--test` runner; unit, integration, and OpenClaw integration coverage.
- Critical path coverage target: ≥80%. Storage, retrieval, and migration layers need regression tests.
- Run `npm run validate` before commits; `teams:release` before publishing.

## Current Status
- Version: v1.0.2 (2026-03-16)
- Tests: 110/110 pass; stability check 全绿（recall accuracy=1.0, unitTestPassRate=1.0）.
- KPI: recall accuracy=1.0, unit pass=1.0, continuity=true, autoCaptureAcceptRate=0.75.
- 18 tools (evermemory_edit + evermemory_browse 已注册), 9 schema migrations, built-in semantic search.
- Track A/B/C/D 质量冲刺全部完成，B4 autoCapture 维度已补全。

## Recent Changes (2026-03-16 Quality Sprint)

### Track A — Technical Debt
- **A0**: Scope isolation fix — empty scope `{}` no longer matches all-users memories; system actor stores exempt.
- **A1**: Semantic status (`ready`/`degraded`/`disabled`) surfaced in `evermemory_status`.
- **A2**: Housekeeping `run()` is synchronous SQLite; async wrapper retained for interface compat.
- **A3**: AutoPromotion type-checked via proper `BehaviorService` type import.
- **A4**: SessionEnd steps wrapped with `withTimeout()` (5–15s limits) to prevent indefinite blocking.
- **A4b**: SessionStart briefing generation wrapped in try-catch with degraded fallback.
- **A4c**: Embedding manager `dispose()` called on plugin `stop()`.
- **A5**: Decay formula unified — `decay.ts` now imports half-life/stability constants from `tuning/memory.ts`.
- **A7**: DB unbounded growth — `MemoryHousekeepingService` prunes old `debug_events` and `intent_records`.
- **A8**: Empty/whitespace content rejected at write boundary in `MemoryService`.
- **A9**: Rule promotion loop wrapped in SQLite transaction for atomicity.
- **A10**: `DebugRepository` prepared statements cached as constructor-initialized fields.

### Track B — Feature Completeness
- **B1**: Conflict detection results surfaced in `evermemory_consolidate` output.
- **B2**: Profile scan coverage warning (`scanCoverage`) added to `ProjectedProfile`.
- **B3**: Rule rollback support (`action: "rollback"`) added to `evermemory_rules`.
- **B4**: Auto-capture 质量反馈 — `evermemory_status` 新增 `autoCapture { lastRun, capturedCount, rejectedCount, topKinds }` 维度.
- **B5**: Candidate rule provenance (`sourceExperienceIds`) added to `BehaviorRule.trace`.
- **B6**: PreferenceGraph (top preferences + conflicts) surfaced in `evermemory_profile`.
- **B7**: Pre-migration backup — `.db.bak.{timestamp}` created before any schema upgrade.

### Track C — Product Experience
- **C1**: Briefing builder no longer outputs "待补充" placeholders; empty sections are omitted.
- **C1**: Briefing quality score (`qualityScore`, `qualityLabel`, `nudge`) computed and attached.
- **C2**: Chinese intent heuristics — question-ending particles (`吗/呢/啊`) and confirmation patterns.
- **C3**: Embedding cold start — 120s init timeout + `onInitProgress` callback for stage feedback.
- **C4a**: Store tool surfaces `inferredType` and `inferredLifecycle` in result.
- **C4b**: Rules tool shows `appliedCount` on each rule.
- **C4**: RecallResult includes `strategyUsed`, `semanticFallback`, `nudge`.
- **C5**: Smartness metrics dimensions include `advice` string; shown in report when score < 0.6.
- **C6**: `openclaw.plugin.json` config schema enriched with `description` on every property.

### Track D — Core Product Gaps
- **D1**: `evermemory_edit` tool — update/delete/correct memory actions with re-embedding.
- **D2**: `evermemory_browse` tool — filtered/sorted memory browser with at-risk flagging.
- **D3**: Session Continuity Score (`continuityScore`) computed and attached to `BootBriefing`.
- **D4**: At-risk memories warning (`atRiskMemories`) in `evermemory_status`.

## Test Command
RTK has been uninstalled. `npm test` now uses glob patterns and works directly:
```bash
npm test
# Or run directly:
node --test 'dist-test/test/**/*.test.js' 'dist-test/test/*.test.js'
```

## Post-Review Security Fixes (2026-03-16)
- **SEC-1**: `evermemory_edit` now accepts `callerScope` — registered with `toolContext`, calls `resolveToolScope`, validates memory ownership before mutating. Cross-user access denied with clear error.
- **SEC-2**: `pruneOldDebugEvents` / `pruneOldIntentRecords` errors now logged via `debugRepo` (kind: `housekeeping_error`) instead of silently swallowed.
- **SEC-3**: `promoteFromReflection` captures a single `batchTimestamp = nowIso()` before the transaction; all frozen/promoted rule timestamps are consistent within a batch.
- **PKG**: `package.json` `test:unit` updated from `find` to glob pattern — no longer depends on RTK not being present.

## Stability Verification
```bash
npm run stability:check
npm run stability:check:full
npm run kpi:track
npm run kpi:update
npm run quality:gate:full
npm run growth:report
```

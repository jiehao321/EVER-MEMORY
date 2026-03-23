# EverMemory Guide (CLAUDE)

## Project Overview
- EverMemory: deterministic memory plugin for OpenClaw, current version v2.0.0-rc1.
- Goal: reliable, explainable, rollback-capable workflows for knowledge storage, recall, rule governance, and user profiling.
- Stack: Node.js 22.x, TypeScript strict ESM, SQLite WAL, better-sqlite3, TypeBox.
- Principles: determinism first, operator first, progressive hardening.

## Architecture
- `src/core/`: memory (+ relation detection, micro-reflection, proactive recall, contradiction monitor, compression, predictive context, drift detection, proactive alerts, self-tuning decay, progressive consolidation), behavior, briefing, intent, reflection, profile, analytics, I/O, policy, setup.
- `src/retrieval/`: structured, keyword, hybrid, semantic retrieval strategies.
- `src/embedding/`: none/local/openai provider abstraction with graceful degradation.
- `src/storage/`: SQLite repositories, idempotent migrations, debug/profile/experience/semantic/relation/feedback tables.
- `src/hooks/` & `src/openclaw/`: lifecycle hooks and OpenClaw plugin adapter.
- `src/tools/`: 19 tool implementations (store, recall, edit, browse, relations, rules, briefing, status, import/export, profile, etc.).
- `test/` + `scripts/`: test suites and CI/operations scripts.

## Build & Validation
```bash
npm run build          # Build with fingerprint cache
npm run check          # TypeScript type check
npm test               # Unit tests
npm run validate       # Full: doctor + check + test
npm run teams:dev      # Dev gate (~17s)
npm run teams:release  # Release gate
npm run release:preflight  # Cross-platform install & version consistency check
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
- Version: v2.0.0-rc1 (2026-03-22)
- Tests: 430/430 pass; stability check 全绿（recall accuracy=1.0, unitTestPassRate=1.0）.
- KPI: recall accuracy=1.0, unit pass=1.0, continuity=true, autoCaptureAcceptRate=0.75.
- 19 tools (16 original + evermemory_edit + evermemory_browse + evermemory_relations), 18 schema migrations, built-in semantic search.
- Knowledge graph with 7 relation types, proactive recall, contradiction monitoring, adaptive retrieval weights.
- Memory compression, predictive context, preference drift detection, self-tuning decay.
- Track A/B/C/D 质量冲刺全部完成，Phase 1-3 进化全部完成，10 个 bug 已修复（3 CRITICAL + 4 HIGH + 3 MEDIUM）。

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

## Evolution Sprint (2026-03-21 Phase 1-3)

### Phase 1 — Knowledge Graph Infrastructure
- **Schema v14**: `memory_relations` table (7 relation types) + `graph_stats` cache table
- **Schema v15**: `retrieval_feedback` table for used/ignored/unknown signals
- `RelationRepository` with recursive CTE traversal (BFS, causal chain, shortest path, contradiction cluster, evolution timeline)
- `RelationDetectionService` — auto-detect relations on store with 2s timeout
- `MicroReflectionService` — in-session tracking of recalled memory usage
- `FeedbackRepository` — retrieval signal persistence and strategy aggregation
- Graph tuning constants in `src/tuning/graph.ts`

### Phase 2 — Proactive Intelligence
- `ProactiveRecallService` — graph expansion + expiring commitments + profile matching → top 3 proactive items
- `ContradictionMonitor` — real-time contradiction detection on store → alert queue → drain on messageReceived
- `AdaptiveWeightsService` — 30-day feedback aggregation adjusts hybrid retrieval weights
- Graph-enhanced hybrid retrieval — boost graph-connected items from top-5 results
- `evermemory_relations` tool — list, add, remove, graph actions

### Phase 3 — Continuous Evolution
- **Schema v16**: compression columns on `memory_items`
- **Schema v17**: `preference_drift_log` table
- **Schema v18**: `tuning_overrides` table
- `MemoryCompressionService` — greedy clustering → summary memory + archive originals + transfer relations
- `PredictiveContextService` — intent pattern analysis → memory type prediction → session cache
- `DriftDetectionService` — profile preference change/reversal detection
- `ProactiveAlertsService` — decay warnings + commitment reminders
- `SelfTuningDecayService` — per-(type, sourceGrade) decay multiplier adjustment every 10 sessions
- `ProgressiveConsolidationService` — every 5 messages triggers light compression if >100 active memories

## Butler Agent (Phase 1)

The Butler is a persistent episodic agent that transforms EverMemory from a passive memory layer into an active cognitive layer.

### Architecture
- **OODA Loop**: Each hook invocation runs: LOAD STATE → OBSERVE → ORIENT → DECIDE → ACT → PERSIST
- **Three-layer Output**: Memory Context (facts) + Strategic Overlay (mode/priorities/risks) + Watchlist (monitoring)
- **LLM Integration**: Host LlmGateway (OpenClawApi.llm) → ButlerLlmClient → CognitiveEngine
- **Reduced Mode**: When LLM unavailable, heuristic fallback (no overlay, no posture recommendations)

### Key Components
```
src/core/butler/
├── agent.ts              # Butler Agent (OODA loop + cycle trace)
├── state.ts              # Thin state manager (singleton + working memory)
├── cognition.ts          # CognitiveEngine (LLM wrapper + budget)
├── llmClient.ts          # ButlerLlmClient (gateway > bridge > unavailable)
├── taskQueue.ts          # Deferred task queue with drain budgets
├── types.ts              # All Butler types
├── strategy/
│   ├── overlay.ts        # StrategicOverlay generation (LLM + heuristic fallback)
│   └── compiler.ts       # Overlay → <evermemory-butler> XML render
├── narrative/
│   └── service.ts        # Cross-session narrative thread management
├── commitments/
│   └── watcher.ts        # Commitment extraction from memories
└── attention/
    └── service.ts        # Insight ranking + surfacing + cooldown
```

### New DB Tables (v19–v23)
- `butler_state` — singleton agent state
- `butler_tasks` — deferred task queue
- `narrative_threads` — cross-session narrative tracking
- `butler_insights` — generated insights (commitment/theme/anomaly/open_loop/recommendation)
- `llm_invocations` — LLM call audit trail

### 3 New Tools
| Tool | Purpose |
|------|---------|
| `butler_status` | Agent state, narratives, queue, LLM usage |
| `butler_brief` | LLM executive briefing with strategy overlay |
| `butler_tune` | Runtime config adjustment (mode, budgets, sensitivity) |

### Hook Integration
- `session_start`: Butler cycle (observe + drain tasks)
- `before_agent_start`: Butler cycle + overlay generation → `<evermemory-butler>` XML injected via prependContext
- `agent_end`: Butler cycle (result absorption)
- `session_end`: Butler cycle (enqueue deferred tasks only, 0ms extra)
- All Butler hook code wrapped in try/catch — failures never block existing functionality.

### Configuration
```json
{
  "butler": {
    "enabled": true,
    "mode": "steward",
    "cognition": {
      "dailyTokenBudget": 50000,
      "sessionTokenBudget": 10000,
      "taskTimeoutMs": 15000,
      "fallbackToHeuristics": true
    },
    "timeBudgets": {
      "sessionStartMs": 3000,
      "beforeAgentMs": 2000,
      "agentEndMs": 2000
    },
    "attention": {
      "maxInsightsPerBriefing": 3,
      "tokenBudgetPercent": 0.2,
      "minConfidence": 0.4
    }
  }
}
```

## Stability Verification
```bash
npm run stability:check
npm run stability:check:full
npm run kpi:track
npm run kpi:update
npm run quality:gate:full
npm run growth:report
```

## Release Checklist (MANDATORY before every publish)
1. `npm run build` — rebuild dist/
2. `npm run release:preflight` — **跨平台安装 & 版本一致性自动检查**
   - 版本号一致性（package.json, constants.ts, dist/, openclaw.plugin.json, plugin.json, lockfile, docs）
   - npm tarball 完整性（plugin 配置文件、入口文件全部在包中）
   - 跨平台兼容性（无 shell 特有语法、shebang 正确、Node 版本检查宽松）
   - 入口 & exports 验证（main, types, openclaw.extensions 全部指向存在的文件）
   - 陈旧版本号扫描（源码和脚本中不允许残留旧版本号）
3. `npm run validate` — doctor + typecheck + 全部测试
4. `npm run release -- --version X.Y.Z --dry-run` — 先空跑确认
5. `npm run release -- --version X.Y.Z` — 正式发布（npm + ClawHub + git tag）

### 版本号变更时必须同步的文件
| 文件 | 字段 |
|------|------|
| `package.json` | `version` |
| `src/constants.ts` | `PLUGIN_VERSION` |
| `openclaw.plugin.json` | `version` |
| `plugin.json` | `version` |
| `docs/GUIDE.md` | 版本引用 |
| `docs/ARCHITECTURE.md` | 版本引用 |
| `package-lock.json` | 运行 `npm install --package-lock-only` |
| `dist/` | 运行 `npm run build` |

# Changelog

All notable changes to EverMemory are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

## [2.0.0] - 2026-03-24

### Added — Butler Agent (Phase 1–3)
- **Persistent episodic Butler agent** — OODA-loop cognitive layer with strategic overlay, attention service, and insight surfacing
- **Three-layer output** — Memory Context (facts) + Strategic Overlay (mode/priorities) + Watchlist (monitoring)
- **Butler tools** — `butler_status`, `butler_brief`, `butler_tune`, `butler_review` for runtime inspection and control
- **Attention service** — insight ranking, force-surface logic, cooldown, and feedback (dismiss/snooze/rate)
- **Goal tracking** — active goals with priority levels surfaced in session watchlist
- **Narrative threads** — cross-session narrative tracking with momentum and phase management
- **Commitment watcher** — automatic extraction of commitments from stored memories
- **Task queue** — deferred task queue with lease-based execution and idempotency keys
- **Cognitive engine** — LLM wrapper with token budget tracking and heuristic fallback
- **Worker thread pool** — optional background task execution via worker threads (Phase 3)

### Changed — OpenClaw SDK 2026.3.22 Migration
- **Full SDK migration** — `definePluginEntry()`, focused subpath imports (`openclaw/plugin-sdk/core`, `openclaw/plugin-sdk/plugin-runtime`)
- **session_start returns void** — watchlist computation moved to `before_agent_start` hook (per SDK spec)
- **PluginLogger / RuntimeLogger split** — single-arg `PluginLogger` for public API, structured `RuntimeLogger` with meta for Butler internals
- **Service lifecycle** — `start/stop` now receive `OpenClawPluginServiceContext`
- **registerMemoryPromptSection** — SDK memory prompt section API with `citationsMode` and tool guide
- **Self-generated turnId** — `turn-${sessionId}-${crypto.randomUUID()}` replaces host `runId`
- **Butler forced reduced mode** — SDK host does not expose LLM gateway; steward mode unavailable
- **Default mode steward→reduced** — across config, state, migrations, and plugin.json
- **ButlerLogger type** — all 10 Butler components use structured meta-style logging
- **Scope binding** — `upsertScopeStateFromCtx` prioritizes SDK typed fields with `resolveHostBinding` fallback
- Removed backward compatibility with pre-2026.3.22 SDK

### Fixed
- Date-sensitive test in `butlerRepos` — `getDailyUsage()` now uses explicit date parameter

## [2.0.0-rc1] - 2026-03-22

### Fixed — Bug Sweep (10 issues)
- **CRITICAL**: Wire Phase 3 services into hooks (progressive consolidation, predictive context, self-tuning decay, drift detection were dead code)
- **CRITICAL**: Fix `estimateActiveCount()` always returning 101 when any memory existed
- **CRITICAL**: Fix `ContradictionMonitor` memory leak — pending alerts never cleared on session end
- **HIGH**: Fix Chinese antonym substring false positives in relation detection
- **HIGH**: Fix `selfTuningDecay` session counter reset on restart — now triggers on first session
- **HIGH**: Fix graph traversal cache key collision (used `types.length` instead of actual values)
- **HIGH**: Wire `userProfile` into `messageReceived` for proactive recall profile matching
- **MEDIUM**: Persist drift detection entries to `preference_drift_log` table (was in-memory only)
- **MEDIUM**: Persist tuning overrides to `tuning_overrides` table (was in-memory only)
- **MEDIUM**: Add `includeArchived` option to browse tool (archived memories were inaccessible)

## [2.0.0-rc1-initial] - 2026-03-21

### Added — Phase 1: Knowledge Graph
- **Knowledge Graph** — `memory_relations` table with 7 relation types (causes, contradicts, supports, evolves_from, supersedes, depends_on, related_to)
- **Recursive CTE graph traversal** — BFS, causal chain, shortest path, contradiction cluster, evolution timeline queries
- **Graph statistics cache** — `graph_stats` table with in/out degree, cluster ID, strongest relation tracking
- **Automatic relation detection** — deterministic classification on store (antonym→contradicts, high similarity→evolves_from, keyword overlap→supports)
- **Transitive inference engine** — hardcoded rules (A causes B + B causes C → A causes C) with confidence decay, no LLM dependency
- **Relation weight decay** — relations decay over time, reinforced on traversal hit, pruned below threshold
- **Retrieval feedback tracking** — `retrieval_feedback` table records used/ignored/unknown signals per recalled memory
- **Micro-reflection service** — in-session tracking of recalled memory usage via store_reference, edit_reference, session_end_implicit signals
- **`evermemory_relations` tool** — list, add, remove, graph actions for manual relation management

### Added — Phase 2: Proactive Intelligence
- **Proactive recall engine** — graph expansion (depth 2) + expiring commitments + profile interest matching → top 3 unsolicited items
- **Contradiction monitor** — real-time detection of `contradicts` relations on store → queues alerts → drains on messageReceived
- **Adaptive retrieval weights** — 30-day feedback aggregation adjusts hybrid keyword/semantic weights per user (min 20 samples)
- **Graph-enhanced retrieval** — after hybrid ranking, boost graph-connected items from top-5 results
- **Contradiction alerts** — `ContradictionAlert` type with conflict score and resolution suggestion (keep_newer, keep_both, ask_user)
- **Proactive items in messageReceived** — `proactiveItems` and `alerts` fields in `MessageReceivedResult`

### Added — Phase 3: Continuous Evolution
- **Memory compression** — greedy keyword-overlap clustering → summary memory (lifecycle: semantic, sourceGrade: derived) + archive originals + transfer relations
- **Predictive context engine** — analyzes recent intent patterns → predicts needed memory types → caches at session start
- **Preference drift detection** — compares old/new profile preferences, detects additions/changes/removals/reversals with antonym pairs
- **Proactive alerts service** — decay warnings (important memories not accessed 14+ days) and commitment reminders (>7 days old)
- **Self-tuning decay** — adjusts decay multipliers per (type, sourceGrade) based on retrieval feedback effectiveness, recomputes every 10 sessions
- **Progressive consolidation** — every 5 messages triggers light compression (1 cluster) if >100 active memories

### Changed
- Schema upgraded from v13 to v18 (v14: knowledge graph, v15: retrieval feedback, v16: compression columns, v17: drift log, v18: tuning overrides)
- `messageReceived` hook now runs proactive recall and drains contradiction alerts after regular recall
- `store` operation triggers fire-and-forget relation detection with 2s timeout
- Hybrid retrieval strategy accepts optional `relationRepo` for graph-enhanced ranking
- `RetrievalService` passes `relationRepo` through to hybrid strategy
- 4 new debug event kinds: `relation_detected`, `relation_detection_error`, `relation_inference_triggered`, `retrieval_feedback_recorded`

## [1.0.4] - 2026-03-18

### Fixed
- Cross-platform OpenClaw installation issues and version consistency
- Windows path handling in plugin registration scripts
- Version number synchronization across all 8 reference locations

## [1.0.3] - 2026-03-16

### Fixed
- Full cross-platform compatibility — Windows + macOS + Linux
- `.claude/codex-collab` session files added to `.gitignore`

## [1.0.2] - 2026-03-16

### Added
- **`evermemory_edit`** — update / delete / correct memory actions with ownership validation and re-embedding (D1 + SEC-1)
- **`evermemory_browse`** — filtered/sorted memory browser with `atRiskOfArchival` flagging (D2)
- **`autoCapture` dimension in `evermemory_status`** — `lastRun`, `capturedCount`, `rejectedCount`, `topKinds` (B4)
- **Session Continuity Score** — `continuityScore` (0–1), `continuityLabel`, `nudge` attached to `BootBriefing` (D3)
- **At-risk memory warnings** — `atRiskMemories` in `evermemory_status`; age > 25d && accessCount < 2 (D4)
- **Rule rollback** — `action: "rollback"` in `evermemory_rules` restores active rule to candidate state (B3)
- **Conflict resolution** — `evermemory_consolidate` now surfaces detected conflict pairs in output (B1)
- **PreferenceGraph** — `evermemory_profile` with `includeAnalysis: true` returns `topPreferences` and conflicts (B6)
- **Profile scan coverage** — `scanCoverage` + `partialWarning` when scan exceeds 300 memories (B2)
- **Rule provenance** — `BehaviorRule.trace.sourceExperienceIds` links candidate rules to source experiences (B5)
- **Briefing quality score** — `qualityScore`, `qualityLabel`, `nudge`; "待补充" placeholders removed (C1)
- **Chinese intent heuristics** — question particles 吗/呢/啊 and confirmation patterns 对吗/是这样吗 (C2)
- **Embedding cold-start feedback** — 120s timeout + `onInitProgress` stage callbacks (C3)
- **Store tool** — `inferredType`, `inferredLifecycle`, `policyDecision` in result (C4a)
- **Recall tool** — `strategyUsed`, `semanticFallback`, `nudge` in result (C4)
- **Rules tool** — `appliedCount` and `lastAppliedAt` per rule (C4b)
- **Smartness metrics** — `advice` string per dimension; shown in report when score < 0.6 (C5)
- **Config descriptions** — `openclaw.plugin.json` all properties enriched with `description` (C6)
- **Pre-migration backup** — `.db.bak.{timestamp}` created before any schema upgrade (B7)

### Fixed
- **A0 Scope isolation** — empty scope `{}` no longer silently matches all-users data; system actor stores exempt
- **A4b Session startup** — briefing generation failure now degrades gracefully instead of crashing the session
- **A4 Session end timeouts** — all 9 serial steps wrapped with `withTimeout()` (5–15s each)
- **A4c Embedding resource leak** — `embeddingManager.dispose()` called on plugin stop
- **A7 Database growth** — housekeeping prunes `debug_events` (30d TTL) and `intent_records` (14d TTL)
- **A8 Empty content** — whitespace-only content rejected at write boundary with explicit error
- **A9 Rule promotion atomicity** — entire promotion loop wrapped in SQLite transaction
- **A10 Prepared statements** — `DebugRepository` statements pre-compiled in constructor
- **A5 Decay formula** — decay constants unified from `tuning/memory.ts`; no more magic numbers
- **A6 Weight validation** — hybrid retrieval weights normalized and validated at config load
- **SEC-2 Error swallowing** — housekeeping prune errors logged via `debugRepo` instead of silently dropped
- **SEC-3 Timestamp consistency** — `promoteFromReflection` uses single `batchTimestamp` for the entire batch

## [1.0.1] - 2026-03-15

### Fixed
- Promoted `@xenova/transformers` from `optionalDependencies` to `dependencies` for true zero-config semantic search

## [1.0.0] - 2026-03-15

### Added

**Memory Layer**
- 16 tool capabilities: store, recall, status, briefing, intent, reflect, rules, profile, onboard, consolidate, explain, export, import, review, restore, smartness
- SQLite WAL storage with idempotent schema migrations (9 versions)
- Three retrieval modes: structured, keyword, hybrid
- Built-in local semantic search via @xenova/transformers with graceful degradation
- Memory lifecycle management: working, episodic, semantic, archive
- Scoped memories: user, chat, project, global

**Understanding Layer**
- Session briefing generation with token budget control
- Intent analysis with deterministic heuristics and optional LLM enrichment
- User profile projection with stable fields and derived weak hints
- Behavior rule extraction from reflections with governance (freeze, deprecate, rollback)
- Cross-session continuity through briefing injection

**Evolution Layer**
- Active learning on session end: experience capture, reflection, rule promotion
- Proactive recall injection for relevant warnings and lessons
- Self-housekeeping: near-duplicate merge, stale archival, high-frequency reinforcement
- Auto-promotion of behavior rules at confidence >= 0.85 with evidence >= 2
- Smartness metrics with 5-dimension scoring and trend analysis

**Operations**
- JSON and Markdown import/export with review/apply workflow
- Archive review and two-phase restore
- Explain tool for auditing write, retrieval, rule, session, archive, and intent decisions
- Doctor command for system health diagnostics
- Onboarding questionnaire for first-run profile setup

**Quality**
- 250 tests across unit, integration, and end-to-end suites
- Performance benchmarks: sessionStart 2.4ms, recall 1.1ms median
- Stability verification and KPI tracking infrastructure

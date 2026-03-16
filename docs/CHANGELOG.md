# Changelog

All notable changes to EverMemory are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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

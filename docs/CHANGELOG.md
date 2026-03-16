# Changelog

All notable changes to EverMemory are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/).

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

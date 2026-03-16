# EverMemory Guide (CLAUDE)

## Project Overview
- EverMemory: deterministic memory plugin for OpenClaw, current version v1.0.1.
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
- Version: v1.0.1 (2026-03-15)
- Tests: 250 total, 248 pass, 0 fail, 2 skipped.
- KPI: recall accuracy=1.0, unit pass=1.0, continuity=true, teams:dev ~17s.
- 16 tools, 9 schema migrations, built-in semantic search.

## Stability Verification
```bash
npm run stability:check
npm run stability:check:full
npm run kpi:track
npm run kpi:update
npm run quality:gate:full
npm run growth:report
```

# Contributing to EverMemory

## Prerequisites
- Node.js 22+
- npm

## Development Setup
```bash
git clone https://github.com/anthropics/evermemory.git
cd evermemory
npm install
npm run build
```

## Build & Test
| Command | Purpose |
|---|---|
| npm run build | Build with fingerprint cache |
| npm run build:test | Build test suite |
| npm run check | TypeScript type check (no emit) |
| npm test | Run unit tests |
| npm run validate | Full validation: doctor + check + test |
| npm run doctor | Diagnose database, migrations, embeddings health |

## Project Structure
```
src/
  core/           # Core services (memory, behavior, briefing, intent, reflection, profile, analytics)
  retrieval/      # Retrieval strategies (structured, keyword, hybrid, semantic)
  embedding/      # Embedding providers (local, openai, none)
  storage/        # SQLite repositories and migrations
  hooks/          # Lifecycle hooks (sessionStart, messageReceived, sessionEnd)
  openclaw/       # OpenClaw plugin adapter
  tools/          # Tool implementations (16 tools)
  types/          # TypeScript type definitions
  runtime/        # Runtime context management
  util/           # Utilities
  config.ts       # Configuration loader
  constants.ts    # Constants
  errors.ts       # Error types
  index.ts        # Public API entry point
test/             # Test files
scripts/          # Build, CI, and operations scripts
docs/             # Documentation
```

## Quality Gates

Development:
```bash
npm run teams:dev          # ~17s dev gate (build + test + check)
```

Release:
```bash
npm run teams:release      # Full release gate
npm run quality:gate:full  # Comprehensive validation with soak
npm run stability:check    # Stability verification
```

## Test Coverage
- Target: 80%+ on critical paths
- Storage, retrieval, and migration layers must have regression tests
- Run npm run validate before submitting changes

## Commit Conventions
Format: `<type>: <description>`
Types: feat, fix, refactor, docs, test, chore, perf, ci

## Pull Request Process
1. Create a feature branch
2. Make changes with tests
3. Run npm run validate
4. Submit PR with description of changes and test plan

# Contributing to EverMemory

## Repository

Current package metadata points to:

- repository: `jiehao321/EVER-MEMORY`
- package name: `evermemory`

Do not rely on older docs that point at other repository paths.

## Prerequisites

- Node.js 22+
- npm
- OpenClaw only if you are working on plugin integration paths

## Setup

```bash
git clone https://github.com/jiehao321/EVER-MEMORY.git
cd EVER-MEMORY
npm install
```

## Core Development Commands

```bash
npm run check
npm test
npm pack --dry-run
```

Other repo scripts exist for release, security, continuity, soak, and operational workflows. Treat them as maintenance scripts, not all as required local contributor steps.

## Current Verification Reality

At the time this doc was updated:

- `npm run check` passes
- `npm test` is not fully green

Contributors should avoid updating docs or release notes to imply full test/package health unless they have re-run the relevant commands and confirmed the result.

## Project Layout

```text
src/
  core/         domain services, including Butler
  retrieval/    retrieval pipeline and strategies
  embedding/    embedding providers and manager
  storage/      SQLite repositories and migrations
  hooks/        lifecycle hook handlers
  openclaw/     OpenClaw adapter and tool registration
  tools/        SDK-level tool functions
  types/        type definitions
docs/
  public docs
  internal/     maintainer references and archive
test/
  unit, integration, and script coverage
scripts/
  build/release/ops utilities
```

## Documentation Rules

- Keep [docs/INDEX.md](/root/evermemory/docs/INDEX.md) as the public doc entrypoint.
- Keep README and GUIDE aligned with live repo status.
- Treat `docs/internal/` as maintainer material, not as the default public surface.
- Do not add new process/planning files to the repo root.

## Pull Requests

Before opening a PR:

1. run the smallest relevant verification commands
2. update docs only when the code or observable repo state actually changed
3. call out any tests you could not make pass
4. be explicit about packaging or native dependency impact when relevant

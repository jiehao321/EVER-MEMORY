# Task Plan: Documentation, Ignore Rules, and Repo Structure Cleanup

## Goal
Bring EverMemory's documentation, ignore rules, and visible repo structure in line with the current codebase reality. Update public docs, tighten GitHub-facing entry points, and archive or hide process artifacts that should not live in the root workflow surface.

## Current Phase
All phases complete — archived 2026-03-25

## Phases
### Phase 1: Repo Facts and Scope Lock
- [x] Inspect current docs, package metadata, ignore rules, and root-level files
- [x] Confirm current exported SDK tools and OpenClaw-registered tools
- [x] Reconcile plan with actual repo state and user preference for moderate consolidation
- **Status:** complete

### Phase 2: Repo Hygiene and Entry Structure
- [x] Update `.gitignore` / `.npmignore` to reflect current desired repo and package boundaries
- [x] Add a single `docs/INDEX.md` entrypoint and reduce root/readme sprawl
- [x] Remove or relocate root-level process artifacts from default visibility
- **Status:** complete

### Phase 3: Core Docs Rewrite
- [x] Rewrite `README.md`
- [x] Rewrite `README.zh-CN.md`
- [x] Rewrite `docs/GUIDE.md`
- [x] Rewrite `docs/API.md`
- [x] Rewrite `docs/ARCHITECTURE.md`
- [x] Rewrite `docs/CONTRIBUTING.md`
- [x] Add/update `docs/INDEX.md` and refresh internal index language
- **Status:** complete

### Phase 4: Internal Docs Triage
- [x] Keep still-useful internal operational references
- [x] Move outdated design/phase/process documents into an archive location
- [x] Update internal index to reflect archived vs active maintenance docs
- **Status:** complete

### Phase 5: Verification and Delivery
- [x] Run link/path and package surface verification
- [x] Re-check git status and ignored files
- [x] Summarize remaining documentation gaps and code-level risks not fixed in this task
- **Status:** complete

## Key Questions
1. Which docs should remain public and maintained versus archived as historical material?
2. Which repo artifacts should stay visible in the root versus be archived or ignored?
3. How should docs describe the current project without repeating stale claims about tests, packaging, or capabilities?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use moderate consolidation | Keeps useful dual-language/public docs while reducing GitHub-facing clutter |
| Prefer rewriting core docs over patching scattered claims | Current inconsistencies are broad enough that incremental edits would miss conflicts |
| Treat current code and command results as source of truth | Existing docs and progress logs already contradict live repo state |
| Preserve `docs/internal/` but separate active references from archive material | Internal docs still have maintenance value, but many are clearly historical |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Previous planning files described an unrelated completed task | 1 | Replaced plan with current documentation cleanup scope |

## Notes
- Do not let updated docs claim packaging/test success that the current repo does not demonstrate.
- Prefer fewer, clearer entrypoints over maintaining multiple partially-overlapping guides.
- Root-level process notes should no longer be treated as first-class project docs.

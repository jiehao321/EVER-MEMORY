# Task Plan: Correct documented tool counts

## Goal
Update the documented SDK and OpenClaw tool counts in the requested markdown files so they match `src/tools/index.ts` and the user's specified totals.

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Identify target files and strings
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Patch the requested markdown files
- [x] Keep planning files updated
- [x] Avoid unrelated edits
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Verify all requested replacements are present
- [x] Confirm no stale count strings remain in target files
- [x] Document results in progress.md
- **Status:** complete

### Phase 5: Delivery
- [x] Review changed files
- [x] Summarize outcome to user
- [x] Note verification status
- **Status:** complete

## Key Questions
1. Which exact strings need replacement in each target file?
2. Does `src/tools/index.ts` support the requested corrected counts?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use direct targeted text replacements only | User requested specific documentation count corrections without behavior changes |
| Treat `src/tools/index.ts` as the source of truth for SDK export count | The user explicitly cited it and requested counts based on it |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- Keep edits limited to `docs/API.md`, `README.md`, `docs/ARCHITECTURE.md`, and `CLAUDE.md`.

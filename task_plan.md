# Task Plan: Fix Four EverMemory Bugs

## Goal
Apply minimal, targeted fixes for four reported bugs in EverMemory and verify the changed behavior with focused tests/checks.

## Current Phase
Phase 5

## Phases
### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Confirm root cause in current implementation
- [x] Define minimal fix shape for each issue
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Add or update focused tests for the reported bugs
- [x] Apply minimal production changes
- [x] Keep changes scoped to requested files unless evidence requires otherwise
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Run targeted tests/checks for touched behavior
- [x] Document results in progress.md
- [x] Fix any issues found
- **Status:** complete

### Phase 5: Delivery
- [x] Review diff for minimality
- [ ] Summarize modified behavior and verification
- [ ] Deliver to user
- **Status:** in_progress

## Key Questions
1. What existing tests cover hook/config/debug/relation/stability-check behavior, and where are the gaps?
2. Can each requested fix be implemented without broad API churn beyond the touched call sites?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use planning files for this task | The request spans 6 source files plus verification and exceeds simple single-file scope |
| Prefer minimal API extensions over architectural reshaping | User explicitly asked for targeted fixes only |
| Implement the `enabled` kill switch in `initializeEverMemory()` entry methods | This keeps the dormant behavior local to runtime hooks and avoids deeper service churn |
| Add runtime `dispose()` and route OpenClaw stop through it | This gives a single path to await warmup before DB shutdown |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|

## Notes
- Re-read plan before major edits.
- Keep the warmup lifecycle fix minimal and local to initialization/shutdown logic.

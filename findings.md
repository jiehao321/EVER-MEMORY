# Findings & Decisions

## Requirements
- Fix config consumption gaps for `bootTokenBudget`, `debugEnabled`, and top-level `enabled`.
- Prevent embedding warmup logging/writes after disposal/DB close.
- Make `scripts/stability-check.mjs` find nested compiled test files.
- Make relation removal report false when no relation is actually deactivated.
- Keep changes minimal and targeted.

## Research Findings
- `src/hooks/sessionStart.ts` currently ignores any configured boot token budget and only passes `sessionId` plus normalized `communicationStyle` into `briefingService.build(...)`.
- `src/index.ts` constructs `DebugRepository` without consulting `config.debugEnabled`, and current hook invocations do not receive `config.enabled`.
- `src/index.ts` warmup logic is fire-and-forget; shutdown currently exposes raw `database.connection.close()` to callers, so async warmup/debug logging can race with DB closure.
- `scripts/stability-check.mjs` only reads top-level `dist-test/test/*.test.js` files via non-recursive `readdirSync`.
- `src/storage/relationRepo.ts` deactivation result is discarded, and `src/tools/relations.ts` always returns `removed: true` for remove requests that include a relation id.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Start with root-cause confirmation in current code before editing | Required by systematic debugging and reduces accidental API churn |
| Add focused regression tests in existing test suites instead of broad new harnesses | Keeps changes small and aligns with TDD for each reported bug |

## Issues Encountered
| Issue | Resolution |
|-------|------------|

## Resources
- `/root/evermemory/src/index.ts`
- `/root/evermemory/src/hooks/sessionStart.ts`
- `/root/evermemory/src/storage/debugRepo.ts`
- `/root/evermemory/scripts/stability-check.mjs`
- `/root/evermemory/src/storage/relationRepo.ts`
- `/root/evermemory/src/tools/relations.ts`

## Visual/Browser Findings
- None.

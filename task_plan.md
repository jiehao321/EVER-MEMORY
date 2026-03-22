# Task Plan

## Goal
Register the `evermemory_relations` OpenClaw tool in `src/openclaw/tools/memory.ts`, keep adapter tests aligned, and verify compilation with `npm run build`.

## Phases
| Phase | Status | Notes |
|---|---|---|
| Context review | complete | Reviewed `src/openclaw/tools/memory.ts`, existing relation support, and OpenClaw plugin registration tests. |
| Test-first change | complete | Added an assertion in `test/openclaw-plugin.test.ts`, rebuilt tests, and confirmed the test failed because `evermemory_relations` was not registered. |
| Adapter implementation | complete | Added `RELATION_TYPES`, `RELATION_ACTIONS`, and the `evermemory_relations` registration to `registerMemoryTools`. |
| Verification | complete | Rebuilt test output, reran `dist-test/test/openclaw-plugin.test.js` successfully, and ran `npm run build` successfully. |

## Decisions
- Keep the change local to the OpenClaw adapter and its registration test; relation business logic already exists elsewhere in the repo.
- Reuse the existing plugin integration test instead of introducing a new test file, since the behavior under change is tool registration.
- Preserve the requested tool schema and summary strings exactly unless the compiler requires a narrow compatibility tweak.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| None | 1 | Focused test and production build both passed after the adapter patch. |

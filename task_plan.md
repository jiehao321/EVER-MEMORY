# Task Plan

## Goal
Fix 4 real-machine testing issues in the OpenClaw-facing EverMemory tools with minimal, targeted changes only.

## Phases
| Phase | Status | Notes |
|---|---|---|
| Inspect implementation, schemas, and existing tests | completed | Confirmed the missing `approved=false` guard in `src/openclaw/tools/io.ts`, truncated recall IDs and graph summary text in `src/openclaw/tools/memory.ts`, and missing allowed-value descriptions in `src/openclaw/shared/convert.ts`. |
| Add failing regression coverage | completed | Extended `test/openclaw-plugin.test.ts` to cover import preview mode, full recall IDs, shared enum descriptions, and relations graph summary text. |
| Implement minimal fixes | completed | Updated only `src/openclaw/tools/io.ts`, `src/openclaw/tools/memory.ts`, and `src/openclaw/shared/convert.ts`. |
| Verify targeted tests | completed | `npm run build:test && node --test dist-test/test/openclaw-plugin.test.js` passed. |

## Decisions
- Keep the import preview for `content + format + approved=false` lightweight: validate the request shape and avoid writes, without introducing a full dry-run parser path.
- Show full memory UUIDs in OpenClaw recall output so users can pass them directly into `evermemory_edit`.
- Put enum allowed-value descriptions on the shared TypeBox schemas so validation/help text improves everywhere those schemas are reused.
- Clarify graph summary text without changing the underlying relation traversal result shape.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| New recall mode description assertion expected `semantic` | 1 | Checked runtime tool schema and corrected the regression test to the actual supported retrieval modes: `structured`, `keyword`, `hybrid`. |

# Findings

## OpenClaw Memory Adapter
- `src/openclaw/tools/memory.ts` already imports `asOptionalEnum` and `asOptionalInteger` from `../shared.js`; no new shared import is needed.
- Existing tool constants live near the top of the file as `const ... as const`, so `RELATION_TYPES` and `RELATION_ACTIONS` fit the current style.
- `registerMemoryTools(...)` currently ends after the `evermemory_browse` registration; the new relation tool belongs immediately before the function closing brace.

## Existing Relation Support
- Runtime support already exists at `src/index.ts` via `evermemory.evermemoryRelations(...)`.
- Tool logic exists in `src/tools/relations.ts`.
- Unit coverage for relation behavior already exists in `test/tools/relations.test.ts`; the missing piece is OpenClaw adapter registration.

## Best Test Target
- `test/openclaw-plugin.test.ts` already exercises tool registration through `resolveTools(...)` and asserts the presence/execution of other registered tools.
- Adding a single assertion for `tools.get('evermemory_relations')` is the minimal test-first proof for this change.

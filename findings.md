# Findings

- In `src/openclaw/tools/io.ts`, the `format + content` import branch calls `evermemory.import(...)` directly and currently ignores `params.approved`.
- `src/openclaw/tools/memory.ts` formats recall items with `#${item.id.slice(0, 8)}`, which is not enough for `evermemory_edit`.
- `src/tools/recall.ts` does not format IDs itself, so no parallel truncation fix is needed there.
- `src/openclaw/shared/convert.ts` defines `importModeSchema`, `retrievalModeSchema`, and `restoreModeSchema` without descriptions listing allowed values.
- `src/openclaw/tools/memory.ts` relations graph summary currently reports only `Graph: ${result.total} node(s) found.`, which hides that the source node is excluded from the returned graph nodes.
- `test/openclaw-plugin.test.ts` already resolves real registered tools and is the best focused place to verify the OpenClaw tool responses and parameter schema metadata.

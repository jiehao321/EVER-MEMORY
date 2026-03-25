# EverMemory API Reference

This file summarizes the maintained API surface visible in the current repository.

Current SDK export count: 23

## SDK Exports

Current SDK exports from [src/tools/index.ts](/root/evermemory/src/tools/index.ts):

### Core EverMemory SDK functions

- `evermemoryStore`
- `evermemoryRecall`
- `evermemoryEdit`
- `evermemoryBrowse`
- `evermemoryBriefing`
- `evermemoryStatus`
- `evermemorySmartness`
- `evermemoryIntent`
- `evermemoryReflect`
- `evermemoryRules`
- `evermemoryProfile`
- `evermemoryOnboard`
- `evermemoryConsolidate`
- `evermemoryExplain`
- `evermemoryExport`
- `evermemoryImport`
- `evermemoryReview`
- `evermemoryRestore`
- `evermemoryRelations`

### Butler SDK functions

- `butlerStatus`
- `butlerBrief`
- `butlerTune`
- `butlerReview`

## OpenClaw Tool Surface

Tool registration is assembled in [src/openclaw/plugin.ts](/root/evermemory/src/openclaw/plugin.ts) from grouped registration modules.

### Memory / retrieval / archive

- `evermemory_store`
- `evermemory_recall`
- `evermemory_edit`
- `evermemory_browse`
- `evermemory_review`
- `evermemory_restore`
- `evermemory_relations`

Legacy compatibility aliases also exist for a small subset, such as `memory_store`, `memory_recall`, `memory_export`, and `memory_import`.

### Briefing / explain / status

- `evermemory_status`
- `evermemory_briefing`
- `evermemory_explain`

### Profile / intent / rules

- `evermemory_profile`
- `profile_onboard`
- `evermemory_intent`
- `evermemory_reflect`
- `evermemory_rules`
- `evermemory_consolidate`

### Import / export

- `evermemory_export`
- `evermemory_import`

### Butler

- `butler_status`
- `butler_brief`
- `butler_tune`
- `butler_review`

## Common Call Patterns

### Initialize the runtime

```ts
import { initializeEverMemory } from 'evermemory';

const em = initializeEverMemory({
  databasePath: './memory.db',
});
```

### Store

```ts
const result = em.evermemoryStore({
  content: 'User prefers concise comments.',
  source: { kind: 'tool', actor: 'system' },
  scope: { userId: 'user-1' },
});
```

### Recall

```ts
const result = await em.evermemoryRecall({
  query: 'comment preference',
  mode: 'hybrid',
  scope: { userId: 'user-1' },
  limit: 5,
});
```

### Briefing

```ts
const briefing = em.evermemoryBriefing({
  scope: { userId: 'user-1' },
  tokenTarget: 1200,
});
```

## Surface Notes

- SDK and plugin surfaces are related but not identical.
- `evermemorySmartness` exists on the SDK side and is not documented here as an OpenClaw-registered tool.
- Butler APIs are optional operational features, not the minimal memory plugin surface.
- For exact argument shapes, use the TypeScript definitions in [src/types](/root/evermemory/src/types) and the tool registration schemas in [src/openclaw/tools](/root/evermemory/src/openclaw/tools).

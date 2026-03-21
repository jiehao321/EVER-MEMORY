import type { RetrievalService } from '../retrieval/service.js';
import type { EverMemoryRecallToolInput } from '../types.js';

export async function evermemoryRecall(
  retrievalService: RetrievalService,
  input: EverMemoryRecallToolInput,
) {
  const startedAt = Date.now();
  const result = await retrievalService.recall({
    query: input.query,
    scope: input.scope,
    types: input.types,
    lifecycles: input.lifecycles,
    mode: input.mode,
    limit: input.limit,
    createdAfter: input.createdAfter,
    createdBefore: input.createdBefore,
  });

  return {
    ...result,
    meta: {
      ...result.meta,
      durationMs: Date.now() - startedAt,
    },
  };
}

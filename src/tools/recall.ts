import type { RetrievalService } from '../retrieval/service.js';
import type { EverMemoryRecallToolInput } from '../types.js';

export function evermemoryRecall(
  retrievalService: RetrievalService,
  input: EverMemoryRecallToolInput,
) {
  return retrievalService.recall({
    query: input.query,
    scope: input.scope,
    types: input.types,
    lifecycles: input.lifecycles,
    mode: input.mode,
    limit: input.limit,
  });
}

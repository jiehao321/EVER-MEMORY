export async function evermemoryRecall(retrievalService, input) {
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

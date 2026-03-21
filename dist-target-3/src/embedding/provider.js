/**
 * Embedding provider abstractions used by the EmbeddingManager.
 * Providers implement lazy initialization but consumers should always go through the manager.
 */
/** Provider that always returns null-vectors; used as fallback */
export class NoOpEmbeddingProvider {
    kind = 'none';
    dimensions = 0;
    isReady() {
        return false;
    }
    async embed(_texts) {
        return [];
    }
    async dispose() {
        // noop
    }
}

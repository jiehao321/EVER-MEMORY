/**
 * Embedding provider abstractions used by the EmbeddingManager.
 * Providers implement lazy initialization but consumers should always go through the manager.
 */

export interface EmbeddingVector {
  values: Float32Array;
  dimensions: number;
}

export type EmbeddingProviderKind = 'local' | 'openai' | 'none';

export interface EmbeddingProvider {
  readonly kind: EmbeddingProviderKind;
  readonly dimensions: number;
  isReady(): boolean;
  embed(texts: string[]): Promise<EmbeddingVector[]>;
  dispose(): Promise<void>;
}

/** Provider that always returns null-vectors; used as fallback */
export class NoOpEmbeddingProvider implements EmbeddingProvider {
  readonly kind: EmbeddingProviderKind = 'none';
  readonly dimensions = 0;

  isReady(): boolean {
    return false;
  }

  async embed(_texts: string[]): Promise<EmbeddingVector[]> {
    return [];
  }

  async dispose(): Promise<void> {
    // noop
  }
}

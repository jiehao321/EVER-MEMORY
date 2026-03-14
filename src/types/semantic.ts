export interface SemanticIndexRecord {
  memoryId: string;
  updatedAt: string;
  contentHash: string;
  tokens: string[];
  weights: Record<string, number>;
}

export interface SemanticSearchHit {
  memoryId: string;
  score: number;
  matchedTokens: string[];
}

export interface SemanticEmbeddingRecord {
  values: Float32Array;
  model: string;
  dimensions: number;
}

export interface SemanticEmbeddingSearchHit {
  memoryId: string;
  score: number;
}

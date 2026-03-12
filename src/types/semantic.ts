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

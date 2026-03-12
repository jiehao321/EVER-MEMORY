export interface RetrievalKeywordWeights {
  keyword: number;
  recency: number;
  importance: number;
  confidence: number;
  explicitness: number;
  scopeMatch: number;
  typePriority: number;
  lifecyclePriority: number;
}

export interface RetrievalHybridWeights {
  keyword: number;
  semantic: number;
  base: number;
}

export interface EverMemoryConfig {
  enabled: boolean;
  databasePath: string;
  bootTokenBudget: number;
  maxRecall: number;
  debugEnabled: boolean;
  semantic: {
    enabled: boolean;
    maxCandidates: number;
    minScore: number;
  };
  intent: {
    useLLM: boolean;
    fallbackHeuristics: boolean;
  };
  retrieval: {
    keywordWeights: RetrievalKeywordWeights;
    hybridWeights: RetrievalHybridWeights;
  };
}

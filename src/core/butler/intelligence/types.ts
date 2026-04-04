export interface KnowledgeGap {
  type: 'stale' | 'incomplete' | 'isolated' | 'missing_preference' | 'unresolved_contradiction';
  description: string;
  suggestedQuestion?: string;
  suggestedSearch?: string;
  importance: number;
  memoryIds?: string[];
}

export interface PlannedQuestion {
  id: string;
  gapType: KnowledgeGap['type'];
  questionText: string;
  context?: string;
  importance: number;
  createdAt: string;
}

export interface QuestionOutcome {
  questionId: string;
  status: 'asked' | 'answered' | 'expired' | 'dismissed';
  answerText?: string;
  answeredAt?: string;
}

export interface QuestionConfig {
  maxPerSession: number;
  maxPerDay: number;
  cooldownMinutes: number;
}

export interface SearchResult {
  content: string;
  source: string;
  relevance: number;
}

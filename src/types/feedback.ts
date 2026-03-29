export type FeedbackSignal = 'used' | 'ignored' | 'unknown';

export type FeedbackSignalSource = 'store_reference' | 'edit_reference' | 'session_end_implicit' | 'explicit';

export interface RetrievalFactor {
  name: string;
  value: number;
}

export interface RetrievalFeedback {
  id: string;
  sessionId: string;
  memoryId: string;
  query: string;
  strategy: string;
  recallRank: number;
  score: number;
  signal: FeedbackSignal;
  signalSource: FeedbackSignalSource;
  createdAt: string;
  topFactors: RetrievalFactor[];
}

export interface FeedbackAggregation {
  strategy: string;
  totalUsed: number;
  totalIgnored: number;
  totalUnknown: number;
  effectiveness: number;
}

export interface RetrievalFactorAggregation {
  factor: string;
  usedAverage: number;
  ignoredAverage: number;
  usedCount: number;
  ignoredCount: number;
}

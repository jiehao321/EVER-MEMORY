export type FeedbackSignal = 'used' | 'ignored' | 'unknown';

export type FeedbackSignalSource = 'store_reference' | 'edit_reference' | 'session_end_implicit' | 'explicit';

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
}

export interface FeedbackAggregation {
  strategy: string;
  totalUsed: number;
  totalIgnored: number;
  totalUnknown: number;
  effectiveness: number;
}

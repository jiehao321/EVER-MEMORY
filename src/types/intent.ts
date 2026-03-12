import type {
  IntentActionNeed,
  IntentEmotionalTone,
  IntentMemoryNeed,
  IntentType,
  IntentUrgency,
  MemoryType,
  RetrievalScopeHint,
  RetrievalTimeBias,
} from './primitives.js';
import type { MemoryScope } from './memory.js';

export interface IntentEntity {
  type: string;
  value: string;
  confidence: number;
}

export interface RetrievalHints {
  preferredTypes: MemoryType[];
  preferredScopes: RetrievalScopeHint[];
  preferredTimeBias: RetrievalTimeBias;
}

export interface IntentSignals {
  urgency: IntentUrgency;
  emotionalTone: IntentEmotionalTone;
  actionNeed: IntentActionNeed;
  memoryNeed: IntentMemoryNeed;
  preferenceRelevance: number;
  correctionSignal: number;
}

export interface IntentRecord {
  id: string;
  sessionId?: string;
  messageId?: string;
  createdAt: string;
  rawText: string;
  intent: {
    type: IntentType;
    subtype?: string;
    confidence: number;
  };
  signals: IntentSignals;
  entities: IntentEntity[];
  retrievalHints: RetrievalHints;
}

export interface IntentAnalyzeInput {
  text: string;
  sessionId?: string;
  messageId?: string;
  scope?: MemoryScope;
}

export interface IntentLLMRequest {
  text: string;
  sessionId?: string;
  messageId?: string;
  scope?: MemoryScope;
  heuristic: {
    intentType: IntentType;
    confidence: number;
    memoryNeed: IntentMemoryNeed;
  };
  prompt: string;
}

export type IntentLLMAnalyzer = (request: IntentLLMRequest) => string | null | undefined;

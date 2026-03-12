import type { IntentRecord } from './intent.js';
import type { ReflectionTriggerKind } from './primitives.js';

export interface ExperienceIndicators {
  userCorrection: boolean;
  userApproval: boolean;
  hesitation: boolean;
  externalActionRisk: boolean;
  repeatMistakeSignal: boolean;
}

export interface ExperienceLog {
  id: string;
  sessionId?: string;
  messageId?: string;
  createdAt: string;
  inputSummary: string;
  actionSummary: string;
  outcomeSummary?: string;
  indicators: ExperienceIndicators;
  evidenceRefs: string[];
}

export interface ReflectionRecord {
  id: string;
  createdAt: string;
  trigger: {
    kind: ReflectionTriggerKind;
    experienceIds: string[];
  };
  analysis: {
    category: string;
    summary: string;
    whatWorked?: string;
    whatFailed?: string;
    nextTimeRecommendation?: string;
  };
  evidence: {
    refs: string[];
    confidence: number;
    recurrenceCount: number;
  };
  candidateRules: string[];
  state: {
    promoted: boolean;
    rejected: boolean;
    reviewedAt?: string;
  };
}

export interface ExperienceLogInput {
  sessionId?: string;
  messageId?: string;
  inputText?: string;
  actionSummary?: string;
  outcomeSummary?: string;
  intent?: IntentRecord;
  indicators?: Partial<ExperienceIndicators>;
  evidenceRefs?: string[];
}

export interface ReflectionRunInput {
  triggerKind: ReflectionTriggerKind;
  sessionId?: string;
  experienceIds?: string[];
  mode?: 'light' | 'full';
}

export interface ReflectionRunResult {
  reflection: ReflectionRecord | null;
  processedExperiences: number;
}

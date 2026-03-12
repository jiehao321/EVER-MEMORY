import type { MemoryScope } from './memory.js';
import type { BehaviorRuleCategory, IntentType } from './primitives.js';

export interface BehaviorRuleAppliesTo {
  userId?: string;
  channel?: string;
  intentTypes?: IntentType[];
  contexts?: string[];
}

export interface BehaviorRule {
  id: string;
  statement: string;
  createdAt: string;
  updatedAt: string;
  appliesTo: BehaviorRuleAppliesTo;
  category: BehaviorRuleCategory;
  priority: number;
  evidence: {
    reflectionIds: string[];
    memoryIds: string[];
    confidence: number;
    recurrenceCount: number;
  };
  state: {
    active: boolean;
    deprecated: boolean;
    supersededBy?: string;
  };
}

export interface BehaviorRuleLookupInput {
  scope?: MemoryScope;
  intentType?: IntentType;
  channel?: string;
  contexts?: string[];
  limit?: number;
}

export interface BehaviorRulePromotionDecision {
  accepted: boolean;
  reason: string;
  statement: string;
  category?: BehaviorRuleCategory;
  priority?: number;
}

export interface PromoteFromReflectionInput {
  reflectionId: string;
  appliesTo?: BehaviorRuleAppliesTo;
}

export interface PromoteFromReflectionResult {
  reflectionId: string;
  promotedRules: BehaviorRule[];
  rejected: Array<{
    statement: string;
    reason: string;
  }>;
  error?: string;
}

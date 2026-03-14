import type { MemoryScope } from './memory.js';
import type { BehaviorRuleCategory, IntentType } from './primitives.js';

export type BehaviorRuleLevel = 'candidate' | 'baseline' | 'critical';
export type BehaviorRuleMaturity = 'emerging' | 'validated' | 'institutionalized' | 'frozen';
export type BehaviorRuleFreezeReason =
  | 'manual'
  | 'correction'
  | 'conflict'
  | 'contradiction_threshold'
  | 'expired'
  | 'deprecated'
  | 'rollback';
export type BehaviorRuleStaleness = 'fresh' | 'aging' | 'stale' | 'expired';

export interface BehaviorRuleAppliesTo {
  userId?: string;
  channel?: string;
  intentTypes?: IntentType[];
  contexts?: string[];
}

export interface BehaviorRuleLifecycle {
  level: BehaviorRuleLevel;
  maturity: BehaviorRuleMaturity;
  applyCount: number;
  contradictionCount: number;
  lastAppliedAt?: string;
  lastContradictedAt?: string;
  lastReviewedAt?: string;
  stale: boolean;
  staleness: BehaviorRuleStaleness;
  decayScore: number;
  frozenAt?: string;
  freezeReason?: BehaviorRuleFreezeReason;
  expiresAt?: string;
}

export interface BehaviorRuleState {
  active: boolean;
  deprecated: boolean;
  frozen?: boolean;
  supersededBy?: string;
  statusReason?: string;
  statusSourceReflectionId?: string;
  statusChangedAt?: string;
}

export interface BehaviorRuleTrace {
  promotedFromReflectionId?: string;
  promotedReason?: string;
  promotedAt?: string;
  reviewSourceRefs?: string[];
  promotionEvidenceSummary?: string;
  deactivatedByRuleId?: string;
  deactivatedByReflectionId?: string;
  deactivatedReason?: string;
  deactivatedAt?: string;
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
  lifecycle: BehaviorRuleLifecycle;
  state: BehaviorRuleState;
  trace?: BehaviorRuleTrace;
}

export interface BehaviorRuleLookupInput {
  scope?: MemoryScope;
  intentType?: IntentType;
  channel?: string;
  contexts?: string[];
  limit?: number;
  includeInactive?: boolean;
  includeDeprecated?: boolean;
  includeFrozen?: boolean;
}

export interface BehaviorRulePromotionDecision {
  accepted: boolean;
  reason: string;
  statement: string;
  category?: BehaviorRuleCategory;
  priority?: number;
  level?: BehaviorRuleLevel;
  maturity?: BehaviorRuleMaturity;
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

export type BehaviorRuleMutationAction = 'freeze' | 'deprecate' | 'rollback';

export interface BehaviorRuleMutationInput {
  action: BehaviorRuleMutationAction;
  ruleId: string;
  reason?: string;
  reflectionId?: string;
  replacementRuleId?: string;
}

export interface BehaviorRuleMutationResult {
  action: BehaviorRuleMutationAction;
  rule: BehaviorRule | null;
  changed: boolean;
  reason: string;
}

export interface BehaviorRuleReviewRecord {
  rule: BehaviorRule;
  reflection?: {
    id: string;
    summary: string;
    nextTimeRecommendation?: string;
    confidence: number;
    recurrenceCount: number;
    evidenceRefs: string[];
    reviewedAt?: string;
  };
  replacementRule?: {
    id: string;
    statement: string;
    category: BehaviorRuleCategory;
    priority: number;
    active: boolean;
    deprecated: boolean;
    frozen?: boolean;
  };
  sourceTrace: {
    promotedFromReflectionId?: string;
    promotedReason?: string;
    promotedAt?: string;
    statusReason?: string;
    statusChangedAt?: string;
    statusSourceReflectionId?: string;
    deactivatedByRuleId?: string;
    deactivatedByReflectionId?: string;
    deactivatedReason?: string;
    deactivatedAt?: string;
    reviewSourceRefs: string[];
  };
}

import type {
  ConsolidationMode,
  DebugEventKind,
  IntentType,
  MemoryLifecycle,
  MemoryType,
  ReflectionTriggerKind,
  RetrievalMode,
} from './primitives.js';
import type {
  BehaviorRule,
  BehaviorRuleMutationAction,
  BehaviorRuleReviewRecord,
} from './behavior.js';
import type { MemoryItem, MemoryScope, MemorySource, MemoryStoreResult } from './memory.js';
import type { ProjectedProfile } from './profile.js';
import type { ReflectionRecord } from './reflection.js';
import type { RuntimeSessionContext } from './runtime.js';

export interface EverMemoryStoreToolInput {
  content: string;
  type?: MemoryType;
  lifecycle?: MemoryLifecycle;
  scope?: MemoryScope;
  source?: MemorySource;
  tags?: string[];
  relatedEntities?: string[];
}

export interface EverMemoryRecallToolInput {
  query: string;
  scope?: MemoryScope;
  types?: MemoryType[];
  lifecycles?: MemoryLifecycle[];
  mode?: RetrievalMode;
  limit?: number;
}

export interface EverMemoryBriefingToolInput {
  sessionId?: string;
  scope?: MemoryScope;
  tokenTarget?: number;
}

export interface EverMemoryIntentToolInput {
  message: string;
  sessionId?: string;
  messageId?: string;
  scope?: MemoryScope;
}

export interface EverMemoryReflectToolInput {
  sessionId?: string;
  mode?: 'light' | 'full';
}

export interface EverMemoryReflectToolResult {
  reflections: ReflectionRecord[];
  candidateRules: string[];
  summary: {
    processedExperiences: number;
    createdReflections: number;
  };
}

export interface EverMemoryProfileToolInput {
  userId?: string;
  recompute?: boolean;
}

export interface EverMemoryProfileToolResult {
  profile: ProjectedProfile | null;
  source: 'recomputed' | 'stored' | 'latest' | 'none';
  summary?: {
    stableCanonicalFields: number;
    derivedHintFields: number;
    derivedGuardrail: 'weak_hint_only';
  };
}

export interface EverMemoryConsolidateToolInput {
  mode?: ConsolidationMode;
  scope?: MemoryScope;
}

export interface EverMemoryConsolidateToolResult {
  mode: ConsolidationMode;
  processed: number;
  merged: number;
  archivedStale: number;
}

export interface EverMemoryExportToolInput {
  scope?: MemoryScope;
  includeArchived?: boolean;
  limit?: number;
}

export interface EverMemorySnapshotV1 {
  format: 'evermemory.snapshot.v1';
  generatedAt: string;
  total: number;
  items: MemoryItem[];
}

export interface EverMemoryExportToolResult {
  snapshot: EverMemorySnapshotV1;
  summary: {
    exported: number;
    includeArchived: boolean;
    scope?: MemoryScope;
  };
}

export type EverMemoryImportMode = 'review' | 'apply';

export interface EverMemoryImportToolInput {
  snapshot: EverMemorySnapshotV1;
  mode?: EverMemoryImportMode;
  approved?: boolean;
  allowOverwrite?: boolean;
  scopeOverride?: MemoryScope;
}

export interface EverMemoryImportToolResult {
  mode: EverMemoryImportMode;
  approved: boolean;
  applied: boolean;
  total: number;
  toCreate: number;
  toUpdate: number;
  imported: number;
  updated: number;
  rejected: Array<{
    id?: string;
    reason: string;
  }>;
}

export interface EverMemoryReviewToolInput {
  scope?: MemoryScope;
  query?: string;
  limit?: number;
  includeSuperseded?: boolean;
  ruleId?: string;
}

export interface EverMemoryReviewToolResult {
  total: number;
  candidates: Array<{
    id: string;
    content: string;
    type: MemoryType;
    lifecycle: MemoryLifecycle;
    scope: MemoryScope;
    updatedAt: string;
    supersededBy?: string;
    restoreEligible: boolean;
    reason?: string;
  }>;
  ruleReview?: BehaviorRuleReviewRecord;
}

export type EverMemoryRestoreMode = 'review' | 'apply';

export interface EverMemoryRestoreToolInput {
  ids: string[];
  mode?: EverMemoryRestoreMode;
  approved?: boolean;
  targetLifecycle?: Exclude<MemoryLifecycle, 'archive'>;
  allowSuperseded?: boolean;
}

export interface EverMemoryRestoreToolResult {
  mode: EverMemoryRestoreMode;
  approved: boolean;
  applied: boolean;
  total: number;
  restorable: number;
  restored: number;
  targetLifecycle: Exclude<MemoryLifecycle, 'archive'>;
  rejected: Array<{
    id?: string;
    reason: string;
  }>;
}

export type EverMemoryExplainTopic = 'write' | 'retrieval' | 'rule';

export interface EverMemoryExplainToolInput {
  topic?: EverMemoryExplainTopic;
  entityId?: string;
  limit?: number;
}

export interface EverMemoryExplainToolResult {
  topic: EverMemoryExplainTopic;
  total: number;
  items: Array<{
    createdAt: string;
    kind: DebugEventKind;
    entityId?: string;
    question: string;
    answer: string;
    evidence: Record<string, unknown>;
  }>;
}

export interface EverMemoryRulesToolInput {
  scope?: MemoryScope;
  intentType?: IntentType;
  channel?: string;
  contexts?: string[];
  limit?: number;
  includeInactive?: boolean;
  includeDeprecated?: boolean;
  includeFrozen?: boolean;
  action?: BehaviorRuleMutationAction;
  ruleId?: string;
  reason?: string;
  reflectionId?: string;
  replacementRuleId?: string;
}

export interface EverMemoryRulesToolResult {
  rules: BehaviorRule[];
  total: number;
  filters: {
    userId?: string;
    intentType?: IntentType;
    channel?: string;
    contexts?: string[];
    limit: number;
    includeInactive?: boolean;
    includeDeprecated?: boolean;
    includeFrozen?: boolean;
  };
  governance: {
    levels: BehaviorRule['lifecycle']['level'][];
    maturities: BehaviorRule['lifecycle']['maturity'][];
    frozenCount: number;
    staleCount: number;
    maxDecayScore: number;
  };
  mutation?: {
    action: BehaviorRuleMutationAction;
    changed: boolean;
    reason: string;
    rule: BehaviorRule | null;
  };
}

export interface EverMemoryStatusToolResult {
  schemaVersion: number;
  databasePath: string;
  memoryCount: number;
  activeMemoryCount?: number;
  archivedMemoryCount?: number;
  semanticIndexCount?: number;
  profileCount?: number;
  experienceCount?: number;
  reflectionCount?: number;
  activeRuleCount?: number;
  countsByType: Partial<Record<MemoryType, number>>;
  countsByLifecycle: Partial<Record<MemoryLifecycle, number>>;
  latestBriefing?: {
    id: string;
    generatedAt: string;
    userId?: string;
    sessionId?: string;
  };
  latestReflection?: {
    id: string;
    createdAt: string;
    triggerKind: ReflectionTriggerKind;
    confidence: number;
  };
  latestRule?: {
    id: string;
    updatedAt: string;
    category: BehaviorRule['category'];
    priority: number;
    confidence: number;
  };
  latestProfile?: {
    userId: string;
    updatedAt: string;
    stableCanonicalFields?: {
      displayName?: ProjectedProfile['stable']['displayName'];
      preferredAddress?: ProjectedProfile['stable']['preferredAddress'];
      timezone?: ProjectedProfile['stable']['timezone'];
      explicitPreferences: ProjectedProfile['stable']['explicitPreferences'];
      explicitConstraints: ProjectedProfile['stable']['explicitConstraints'];
    };
    derivedWeakHints?: {
      communicationStyle?: ProjectedProfile['derived']['communicationStyle'];
      likelyInterests: ProjectedProfile['derived']['likelyInterests'];
      workPatterns: ProjectedProfile['derived']['workPatterns'];
    };
  };
  latestWriteDecision?: {
    createdAt: string;
    entityId?: string;
    accepted?: boolean;
    reason?: string;
    merged?: number;
    archivedStale?: number;
    profileRecomputed?: boolean;
  };
  latestRetrieval?: {
    createdAt: string;
    query?: string;
    requestedMode?: string;
    mode?: string;
    returned?: number;
    candidates?: number;
  };
  latestProfileRecompute?: {
    createdAt: string;
    userId?: string;
    memoryCount?: number;
    stable?: ProjectedProfile['stable'];
    derived?: ProjectedProfile['derived'];
  };
  recentDebugByKind?: Partial<Record<DebugEventKind, number>>;
  latestDebugEvents?: Array<{
    createdAt: string;
    kind: DebugEventKind;
    entityId?: string;
  }>;
  continuityKpis?: {
    sampleWindow: {
      sessionEndEvents: number;
      retrievalEvents: number;
    };
    autoMemory: {
      generated: number;
      accepted: number;
      rejected: number;
      acceptRate?: number;
      generatedByKind?: Record<string, number>;
      acceptedByKind?: Record<string, number>;
    };
    projectSummary: {
      generated: number;
      accepted: number;
      acceptRate?: number;
    };
    retrievalPolicy: {
      suppressedTestCandidates: number;
      retainedTestCandidates: number;
      projectRoutedExecutions: number;
      projectRoutedHits: number;
      projectRouteHitRate?: number;
    };
  };
  runtimeSession?: RuntimeSessionContext;
  recentDebugEvents: number;
}

export interface EverMemoryStoreToolResult extends MemoryStoreResult {}

import type { RetrievalFactor } from './feedback.js';
import type { MemoryLifecycle, MemoryType, RetrievalMode } from './primitives.js';

export type SourceGrade = 'primary' | 'derived' | 'inferred';

export interface MemoryScope {
  userId?: string;
  chatId?: string;
  project?: string;
  global?: boolean;
}

export interface MemorySource {
  // Source kind records the ingestion channel only.
  // Generation mechanisms such as auto-capture are represented by tags, not source.kind values.
  kind:
    | 'message'
    | 'tool'
    | 'manual'
    | 'summary'
    | 'inference'
    | 'test'
    | 'runtime_user'
    | 'runtime_project'
    | 'reflection_derived'
    | 'imported';
  actor?: 'user' | 'assistant' | 'system';
  sessionId?: string;
  messageId?: string;
  channel?: string;
}

export type MemoryDataClass = 'runtime' | 'test' | 'unknown';

export interface MemoryScores {
  confidence: number;
  importance: number;
  explicitness: number;
}

export interface MemoryTimestamps {
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
}

export interface MemoryState {
  active: boolean;
  archived: boolean;
  supersededBy?: string;
}

export interface MemoryEvidence {
  excerpt?: string;
  references?: string[];
}

export interface MemoryStats {
  accessCount: number;
  retrievalCount: number;
}

export interface MemoryItem {
  id: string;
  content: string;
  type: MemoryType;
  lifecycle: MemoryLifecycle;
  source: MemorySource;
  scope: MemoryScope;
  scores: MemoryScores;
  timestamps: MemoryTimestamps;
  state: MemoryState;
  evidence: MemoryEvidence;
  tags: string[];
  relatedEntities: string[];
  stats: MemoryStats;
  sourceGrade: SourceGrade;
  metadata?: {
    source?: string;
    semanticScore?: number;
    recallReason?: string;
    topFactors?: RetrievalFactor[];
  };
}

export interface WriteDecision {
  accepted: boolean;
  reason: string;
  type?: MemoryType;
  lifecycle?: MemoryLifecycle;
  confidence?: number;
  importance?: number;
  explicitness?: number;
  strippedPatterns?: string[];
  cleanedContent?: string;
}

export interface RecallRequest {
  query: string;
  scope?: MemoryScope;
  types?: MemoryType[];
  lifecycles?: MemoryLifecycle[];
  mode?: RetrievalMode;
  limit?: number;
  createdAfter?: string;
  createdBefore?: string;
}

export interface RecallResultMeta {
  durationMs?: number;
  degraded?: boolean;
  degradedReason?: string;
}

export interface RecallResult {
  items: MemoryItem[];
  total: number;
  limit: number;
  strategyUsed?: RetrievalMode;
  semanticFallback?: boolean;
  degraded?: boolean;
  degradedReason?: string;
  nudge?: string;
  meta?: RecallResultMeta;
}

export interface MemoryStoreInput {
  id?: string;
  content: string;
  type?: MemoryType;
  lifecycle?: MemoryLifecycle;
  source: MemorySource;
  scope?: MemoryScope;
  confidence?: number;
  importance?: number;
  explicitness?: number;
  evidence?: MemoryEvidence;
  tags?: string[];
  relatedEntities?: string[];
  sourceGrade?: SourceGrade;
  active?: boolean;
  archived?: boolean;
  supersededBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemorySearchFilters {
  query?: string;
  scope?: MemoryScope;
  types?: MemoryType[];
  lifecycles?: MemoryLifecycle[];
  activeOnly?: boolean;
  archived?: boolean;
  limit?: number;
  createdAfter?: string;
  createdBefore?: string;
}

export interface MemoryStoreResult {
  accepted: boolean;
  reason: string;
  memory: MemoryItem | null;
  inferredType?: string;
  inferredLifecycle?: string;
}

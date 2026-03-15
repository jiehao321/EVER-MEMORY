import type { MemoryLifecycle, MemoryType, RetrievalMode } from './primitives.js';

export interface MemoryScope {
  userId?: string;
  chatId?: string;
  project?: string;
  global?: boolean;
}

export interface MemorySource {
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
  metadata?: {
    source?: string;
    semanticScore?: number;
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
}

export interface RecallRequest {
  query: string;
  scope?: MemoryScope;
  types?: MemoryType[];
  lifecycles?: MemoryLifecycle[];
  mode?: RetrievalMode;
  limit?: number;
}

export interface RecallResult {
  items: MemoryItem[];
  total: number;
  limit: number;
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
}

export interface MemoryStoreResult {
  accepted: boolean;
  reason: string;
  memory: MemoryItem | null;
}

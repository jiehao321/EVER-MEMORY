export type RelationType =
  | 'causes'
  | 'contradicts'
  | 'supports'
  | 'evolves_from'
  | 'supersedes'
  | 'depends_on'
  | 'related_to';

export type RelationCreatedBy =
  | 'auto_detection'
  | 'user_explicit'
  | 'reflection'
  | 'consolidation'
  | 'inference';

export interface MemoryRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  confidence: number;
  weight: number;
  createdAt: string;
  updatedAt: string;
  createdBy: RelationCreatedBy;
  metadata?: Record<string, unknown>;
  active: boolean;
}

export interface GraphStats {
  memoryId: string;
  inDegree: number;
  outDegree: number;
  strongestRelationType?: RelationType;
  strongestRelationId?: string;
  clusterId?: string;
  updatedAt: string;
}

export interface GraphNode {
  memoryId: string;
  depth: number;
  path: string;
  relationType?: RelationType;
  weight?: number;
}

export interface GraphPath {
  nodes: string[];
  relations: RelationType[];
  totalWeight: number;
  totalConfidence: number;
}

export interface ContradictionCluster {
  centerId: string;
  contradictions: Array<{
    memoryId: string;
    relationId: string;
    confidence: number;
  }>;
}

export interface EvolutionEntry {
  memoryId: string;
  content: string;
  updatedAt: string;
  relationType: 'evolves_from' | 'supersedes';
  confidence: number;
}

export interface InferenceRule {
  if: [RelationType, RelationType];
  then: RelationType;
  confidenceDecay: number;
  maxChainLength: number;
}

export interface FindConnectedOptions {
  maxDepth?: number;
  types?: RelationType[];
  minWeight?: number;
  limit?: number;
}

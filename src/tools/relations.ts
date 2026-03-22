import type { RelationRepository } from '../storage/relationRepo.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type {
  RelationType,
  RelationCreatedBy,
  MemoryRelation,
  GraphNode,
} from '../types/relation.js';
import { randomUUID } from 'node:crypto';

export type RelationsAction = 'list' | 'add' | 'remove' | 'graph';

export interface EverMemoryRelationsToolInput {
  action: RelationsAction;
  memoryId?: string;
  targetId?: string;
  relationType?: RelationType;
  confidence?: number;
  depth?: number;
  limit?: number;
  relationId?: string;
}

export interface EverMemoryRelationsToolResult {
  action: RelationsAction;
  relations?: MemoryRelation[];
  graph?: GraphNode[];
  added?: MemoryRelation;
  removed?: boolean;
  total: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function evermemoryRelations(
  relationRepo: RelationRepository,
  input: EverMemoryRelationsToolInput,
  debugRepo?: DebugRepository,
): EverMemoryRelationsToolResult {
  switch (input.action) {
    case 'list': {
      if (!input.memoryId) {
        return { action: 'list', relations: [], total: 0 };
      }
      const relations = relationRepo.findByMemory(input.memoryId);
      return { action: 'list', relations, total: relations.length };
    }

    case 'add': {
      if (!input.memoryId || !input.targetId || !input.relationType) {
        return { action: 'add', total: 0 };
      }
      const now = nowIso();
      const relation: Omit<MemoryRelation, 'active'> = {
        id: randomUUID(),
        sourceId: input.memoryId,
        targetId: input.targetId,
        relationType: input.relationType,
        confidence: input.confidence ?? 0.8,
        weight: 1.0,
        createdAt: now,
        updatedAt: now,
        createdBy: 'user_explicit' as RelationCreatedBy,
      };
      relationRepo.upsert(relation);
      relationRepo.updateGraphStats(input.memoryId);
      relationRepo.updateGraphStats(input.targetId);
      debugRepo?.log('relation_detected', input.memoryId, {
        event: 'user_added',
        sourceId: input.memoryId,
        targetId: input.targetId,
        relationType: input.relationType,
      });
      return { action: 'add', added: { ...relation, active: true }, total: 1 };
    }

    case 'remove': {
      if (!input.relationId) {
        return { action: 'remove', removed: false, total: 0 };
      }
      const changes = relationRepo.deactivate(input.relationId);
      return { action: 'remove', removed: changes > 0, total: changes };
    }

    case 'graph': {
      if (!input.memoryId) {
        return { action: 'graph', graph: [], total: 0 };
      }
      const graph = relationRepo.findConnected(input.memoryId, {
        maxDepth: input.depth ?? 2,
        limit: input.limit ?? 50,
      });
      return { action: 'graph', graph, total: graph.length };
    }

    default:
      return { action: input.action, total: 0 };
  }
}

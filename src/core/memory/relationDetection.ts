import { randomUUID } from 'node:crypto';
import type { RelationRepository } from '../../storage/relationRepo.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import { embeddingManager } from '../../embedding/manager.js';
import type { MemoryItem } from '../../types/memory.js';
import type { RelationType } from '../../types/relation.js';
import {
  RELATION_DETECTION_MAX_CANDIDATES,
  RELATION_DETECTION_MIN_SIMILARITY,
  RELATION_CONTRADICTION_SIMILARITY_MIN,
  RELATION_EVOLUTION_SIMILARITY_MIN,
  RELATION_DETECTION_TIMEOUT_MS,
  RELATION_MAX_PER_MEMORY,
  INFERENCE_RULES,
  INFERENCE_CONFIDENCE_FLOOR,
  INFERENCE_MAX_PER_STORE,
} from '../../tuning/graph.js';

export interface RelationDetectionResult {
  detected: number;
  inferred: number;
  skipped: boolean;
  reason?: string;
}

export class RelationDetectionService {
  constructor(
    private readonly relationRepo: RelationRepository,
    private readonly semanticRepo: SemanticRepository,
    private readonly memoryRepo: MemoryRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  /**
   * Detect relations for a newly stored memory.
   * Wrapped in a timeout to prevent blocking (2s max).
   * If embedding not ready, silently skip.
   */
  async detectRelations(memory: MemoryItem): Promise<RelationDetectionResult> {
    if (!embeddingManager.isReady()) {
      return { detected: 0, inferred: 0, skipped: true, reason: 'embedding_not_ready' };
    }

    if (this.relationRepo.countByMemory(memory.id) >= RELATION_MAX_PER_MEMORY) {
      return { detected: 0, inferred: 0, skipped: true, reason: 'max_relations_reached' };
    }

    try {
      return await withTimeout(
        this.detectRelationsCore(memory),
        RELATION_DETECTION_TIMEOUT_MS,
      );
    } catch (error) {
      this.debugRepo?.log('relation_detection_error', memory.id, {
        error: error instanceof Error ? error.message : String(error),
      });

      return { detected: 0, inferred: 0, skipped: true, reason: 'timeout_or_error' };
    }
  }

  private async detectRelationsCore(memory: MemoryItem): Promise<RelationDetectionResult> {
    const vector = await embeddingManager.embed(memory.content);
    if (!vector) {
      return { detected: 0, inferred: 0, skipped: true, reason: 'embedding_failed' };
    }

    const hits = await this.semanticRepo.searchByCosine(
      vector.values,
      RELATION_DETECTION_MAX_CANDIDATES,
      RELATION_DETECTION_MIN_SIMILARITY,
    );

    let detected = 0;
    const now = new Date().toISOString();

    for (const hit of hits) {
      if (hit.memoryId === memory.id) {
        continue;
      }

      if (this.relationRepo.countByMemory(memory.id) >= RELATION_MAX_PER_MEMORY) {
        break;
      }

      const candidate = this.memoryRepo.findById(hit.memoryId);
      if (!candidate || !candidate.state.active || candidate.state.archived) {
        continue;
      }

      const relationType = this.classifyRelation(memory, candidate, hit.score);
      if (!relationType) {
        continue;
      }

      const confidence = this.computeConfidence(relationType, hit.score, memory, candidate);

      this.relationRepo.upsert({
        id: randomUUID(),
        sourceId: memory.id,
        targetId: candidate.id,
        relationType,
        confidence,
        weight: 1.0,
        createdAt: now,
        updatedAt: now,
        createdBy: 'auto_detection',
      });
      detected += 1;
    }

    const inferred = this.runTransitiveInference(memory.id, now);

    this.relationRepo.updateGraphStats(memory.id);

    this.debugRepo?.log('relation_detected', memory.id, {
      candidates: hits.length,
      detected,
      inferred,
    });

    return { detected, inferred, skipped: false };
  }

  /**
   * Classify the relation type between two memories.
   * Uses deterministic rules (no LLM):
   * - contradicts: high similarity + antonym pairs present
   * - evolves_from: very high similarity + same type + newer timestamp
   * - supports: high keyword overlap + no antonyms
   * - related_to: moderate similarity fallback
   */
  private classifyRelation(
    newMemory: MemoryItem,
    candidate: MemoryItem,
    similarity: number,
  ): RelationType | null {
    const antonyms = countAntonyms(newMemory.content, candidate.content);
    const sharedKeywords = countSharedKeywords(newMemory.content, candidate.content);

    if (
      similarity >= RELATION_CONTRADICTION_SIMILARITY_MIN
      && antonyms > 0
      && sharedKeywords >= 2
    ) {
      return 'contradicts';
    }

    if (
      similarity >= RELATION_EVOLUTION_SIMILARITY_MIN
      && newMemory.type === candidate.type
      && newMemory.timestamps.createdAt > candidate.timestamps.createdAt
    ) {
      return 'evolves_from';
    }

    if (sharedKeywords >= 3 && antonyms === 0 && similarity >= 0.65) {
      return 'supports';
    }

    if (similarity >= 0.7) {
      return 'related_to';
    }

    return null;
  }

  private computeConfidence(
    _relationType: RelationType,
    similarity: number,
    newMemory: MemoryItem,
    candidate: MemoryItem,
  ): number {
    let base = similarity;

    if (sameScope(newMemory, candidate)) {
      base += 0.05;
    }

    if (newMemory.type === candidate.type) {
      base += 0.05;
    }

    return Math.min(Math.max(base, 0.1), 1.0);
  }

  /**
   * Transitive inference: if A→B and B→C match a rule, create A→C.
   * Hardcoded rules, no LLM. Max INFERENCE_MAX_PER_STORE new relations.
   */
  private runTransitiveInference(memoryId: string, now: string): number {
    const relations = this.relationRepo.findByMemory(memoryId);
    let inferred = 0;

    for (const rule of INFERENCE_RULES) {
      if (inferred >= INFERENCE_MAX_PER_STORE) {
        break;
      }

      const firstHops = relations.filter(
        (relation) => relation.relationType === rule.if[0] && relation.sourceId === memoryId,
      );

      for (const firstHop of firstHops) {
        if (inferred >= INFERENCE_MAX_PER_STORE) {
          break;
        }

        const secondHops = this.relationRepo.findByMemory(firstHop.targetId)
          .filter(
            (relation) => relation.relationType === rule.if[1] && relation.sourceId === firstHop.targetId,
          );

        for (const secondHop of secondHops) {
          if (inferred >= INFERENCE_MAX_PER_STORE) {
            break;
          }

          if (secondHop.targetId === memoryId) {
            continue;
          }

          if (this.relationRepo.countByMemory(memoryId) >= RELATION_MAX_PER_MEMORY) {
            return inferred;
          }

          const newConfidence = firstHop.confidence * secondHop.confidence * rule.confidenceDecay;
          if (newConfidence < INFERENCE_CONFIDENCE_FLOOR) {
            continue;
          }

          this.relationRepo.upsert({
            id: randomUUID(),
            sourceId: memoryId,
            targetId: secondHop.targetId,
            relationType: rule.then,
            confidence: Number(newConfidence.toFixed(3)),
            weight: 1.0,
            createdAt: now,
            updatedAt: now,
            createdBy: 'inference',
          });
          inferred += 1;

          this.debugRepo?.log('relation_inference_triggered', memoryId, {
            via: [firstHop.id, secondHop.id],
            ruleIf: rule.if,
            ruleThen: rule.then,
            targetId: secondHop.targetId,
            confidence: Number(newConfidence.toFixed(3)),
          });
        }
      }
    }

    return inferred;
  }
}

const STOPWORDS = new Set([
  '的', '了', '和', '是', '在', '就', '先', '再', '把', '要',
  '请', '需要', '可以', '不能', '用户', '记录', '偏好', '最近',
  '当前', '这个', '那个', '进行', '继续',
  'the', 'a', 'an', 'and', 'or', 'to', 'of', 'for', 'is', 'are',
  'be', 'with', 'then', 'this', 'that', 'from',
]);

const ANTONYM_PAIRS: readonly [string, string][] = [
  ['禁止', '允许'],
  ['总是', '从不'],
  ['必须', '无需'],
  ['开启', '关闭'],
  ['启用', '禁用'],
  ['保留', '删除'],
  ['公开', '私有'],
];

function countAntonyms(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  let count = 0;

  for (const [a, b] of ANTONYM_PAIRS) {
    if (
      (normalizedLeft.includes(a) && normalizedRight.includes(b))
      || (normalizedLeft.includes(b) && normalizedRight.includes(a))
    ) {
      count += 1;
    }
  }

  return count;
}

function extractKeywords(text: string): string[] {
  const matches = text.toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]+/gu) ?? [];
  const keywords: string[] = [];

  for (const match of matches) {
    if (/^[\p{Script=Han}]+$/u.test(match)) {
      if (match.length <= 4) {
        keywords.push(match);
        continue;
      }

      for (let size = 2; size <= 4; size += 1) {
        for (let index = 0; index <= match.length - size; index += 1) {
          keywords.push(match.slice(index, index + size));
        }
      }
      continue;
    }

    if (match.length >= 3) {
      keywords.push(match);
    }
  }

  return keywords.filter((keyword) => keyword.length >= 2 && !STOPWORDS.has(keyword));
}

function countSharedKeywords(left: string, right: string): number {
  const leftKeywords = new Set(extractKeywords(left));
  const rightKeywords = new Set(extractKeywords(right));
  let count = 0;

  for (const keyword of leftKeywords) {
    if (rightKeywords.has(keyword)) {
      count += 1;
    }
  }

  return count;
}

function sameScope(a: MemoryItem, b: MemoryItem): boolean {
  return (a.scope.userId ?? '') === (b.scope.userId ?? '')
    && (a.scope.chatId ?? '') === (b.scope.chatId ?? '')
    && (a.scope.project ?? '') === (b.scope.project ?? '')
    && Boolean(a.scope.global) === Boolean(b.scope.global);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

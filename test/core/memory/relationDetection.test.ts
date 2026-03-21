import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { RelationDetectionService } from '../../../src/core/memory/relationDetection.js';
import { embeddingManager } from '../../../src/embedding/manager.js';
import { MemoryRepository } from '../../../src/storage/memoryRepo.js';
import { RelationRepository } from '../../../src/storage/relationRepo.js';
import { SemanticRepository } from '../../../src/storage/semanticRepo.js';
import { RELATION_MAX_PER_MEMORY } from '../../../src/tuning/graph.js';
import type { MemoryItem } from '../../../src/types/memory.js';
import { createInMemoryDb, buildMemory } from '../../storage/helpers.js';

describe('RelationDetectionService', () => {
  let db: Database.Database;
  let relationRepo: RelationRepository;
  let memoryRepo: MemoryRepository;
  let semanticRepo: SemanticRepository;
  let service: RelationDetectionService;
  let originalIsReady: typeof embeddingManager.isReady;
  let originalEmbed: typeof embeddingManager.embed;

  const makeMemory = (
    overrides: Partial<MemoryItem> & { id: string; content: string },
  ): MemoryItem => buildMemory({
    id: overrides.id,
    content: overrides.content,
    type: overrides.type ?? 'fact',
    lifecycle: overrides.lifecycle ?? 'semantic',
    source: overrides.source ?? { kind: 'tool', actor: 'user' },
    scope: overrides.scope ?? { userId: 'u1' },
    scores: overrides.scores ?? { confidence: 0.8, importance: 0.5, explicitness: 1 },
    timestamps: overrides.timestamps,
    state: overrides.state ?? { active: true, archived: false },
    evidence: overrides.evidence ?? {},
    tags: overrides.tags ?? [],
    relatedEntities: overrides.relatedEntities ?? [],
    stats: overrides.stats ?? { accessCount: 0, retrievalCount: 0 },
    sourceGrade: overrides.sourceGrade ?? 'primary',
  });

  beforeEach(() => {
    db = createInMemoryDb();
    relationRepo = new RelationRepository(db);
    memoryRepo = new MemoryRepository(db);
    semanticRepo = new SemanticRepository(db);
    service = new RelationDetectionService(relationRepo, semanticRepo, memoryRepo);
    originalIsReady = embeddingManager.isReady;
    originalEmbed = embeddingManager.embed;
  });

  afterEach(() => {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
    db.close();
  });

  it('should skip when embedding not ready', async () => {
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => false;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => {
      throw new Error('embed should not be called');
    };

    const memory = makeMemory({ id: 'm1', content: 'test' });
    const result = await service.detectRelations(memory);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'embedding_not_ready');
  });

  it('should skip when max relations reached', async () => {
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => {
      throw new Error('embed should not be called');
    };

    for (let index = 0; index < RELATION_MAX_PER_MEMORY; index += 1) {
      relationRepo.upsert({
        id: `rel-${index}`,
        sourceId: 'm1',
        targetId: `target-${index}`,
        relationType: 'related_to',
        confidence: 0.8,
        weight: 1,
        createdAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:00.000Z',
        createdBy: 'auto_detection',
      });
    }

    const result = await service.detectRelations(makeMemory({ id: 'm1', content: 'test memory' }));
    assert.deepEqual(result, {
      detected: 0,
      inferred: 0,
      skipped: true,
      reason: 'max_relations_reached',
    });
  });

  it('should return zero detected when no similar memories exist', async () => {
    (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
    (embeddingManager.embed as typeof embeddingManager.embed) = async () => ({
      values: new Float32Array([0.25, 0.75]),
      dimensions: 2,
    });

    const memory = makeMemory({ id: 'm1', content: 'isolated fact' });
    memoryRepo.insert(memory);

    const result = await service.detectRelations(memory);
    assert.deepEqual(result, {
      detected: 0,
      inferred: 0,
      skipped: false,
    });
    assert.equal(relationRepo.countByMemory('m1'), 0);
    assert.equal(relationRepo.getGraphStats('m1')?.inDegree, 0);
    assert.equal(relationRepo.getGraphStats('m1')?.outDegree, 0);
  });
});

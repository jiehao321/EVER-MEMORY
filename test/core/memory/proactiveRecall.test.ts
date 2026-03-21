import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { ProactiveRecallService } from '../../../src/core/memory/proactiveRecall.js';
import { MemoryRepository } from '../../../src/storage/memoryRepo.js';
import { runMigrations } from '../../../src/storage/migrations.js';
import { RelationRepository } from '../../../src/storage/relationRepo.js';
import type { MemoryItem } from '../../../src/types/memory.js';

function makeMemory(id: string, content: string, overrides?: Partial<MemoryItem>): MemoryItem {
  const now = new Date().toISOString();
  return {
    id,
    content,
    type: 'fact',
    lifecycle: 'semantic',
    source: { kind: 'tool', actor: 'user' },
    scope: { userId: 'u1' },
    scores: { confidence: 0.8, importance: 0.7, explicitness: 1 },
    timestamps: { createdAt: now, updatedAt: now },
    state: { active: true, archived: false },
    evidence: {},
    tags: [],
    relatedEntities: [],
    stats: { accessCount: 0, retrievalCount: 0 },
    sourceGrade: 'primary',
    ...overrides,
  };
}

describe('ProactiveRecallService', () => {
  let db: Database.Database;
  let relationRepo: RelationRepository;
  let memoryRepo: MemoryRepository;
  let service: ProactiveRecallService;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    relationRepo = new RelationRepository(db);
    memoryRepo = new MemoryRepository(db);
    service = new ProactiveRecallService(relationRepo, memoryRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty when no recalled items', () => {
    const result = service.findProactiveItems([]);
    assert.equal(result.total, 0);
    assert.deepEqual(result.items, []);
  });

  it('should find graph-connected items', () => {
    const m1 = makeMemory('m1', 'project deadline');
    const m2 = makeMemory('m2', 'milestone requirements');
    const m3 = makeMemory('m3', 'resource allocation');
    memoryRepo.insert(m1);
    memoryRepo.insert(m2);
    memoryRepo.insert(m3);

    const now = new Date().toISOString();
    relationRepo.upsert({
      id: 'r1',
      sourceId: 'm1',
      targetId: 'm2',
      relationType: 'causes',
      confidence: 0.8,
      weight: 1.0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'auto_detection',
    });
    relationRepo.upsert({
      id: 'r2',
      sourceId: 'm2',
      targetId: 'm3',
      relationType: 'depends_on',
      confidence: 0.7,
      weight: 1.0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'auto_detection',
    });

    const result = service.findProactiveItems([m1]);

    assert.ok(result.total > 0);
    assert.ok(result.items.every((item) => item.reason === 'graph_connected'));
    assert.ok(result.items.some((item) => item.memory.id === 'm2'));
  });

  it('should cap at MAX_PROACTIVE_ITEMS (3)', () => {
    const m1 = makeMemory('m1', 'central topic');
    memoryRepo.insert(m1);

    for (let i = 2; i <= 10; i += 1) {
      const memory = makeMemory(`m${i}`, `related topic ${i}`);
      memoryRepo.insert(memory);

      const now = new Date().toISOString();
      relationRepo.upsert({
        id: `r${i}`,
        sourceId: 'm1',
        targetId: `m${i}`,
        relationType: 'supports',
        confidence: 0.8,
        weight: 1.0,
        createdAt: now,
        updatedAt: now,
        createdBy: 'auto_detection',
      });
    }

    const result = service.findProactiveItems([m1]);

    assert.ok(result.total <= 3);
    assert.equal(result.items.length, result.total);
  });
});

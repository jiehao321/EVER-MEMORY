import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { ContradictionMonitor } from '../../../src/core/memory/contradictionMonitor.js';
import { MemoryRepository } from '../../../src/storage/memoryRepo.js';
import { runMigrations } from '../../../src/storage/migrations.js';
import { RelationRepository } from '../../../src/storage/relationRepo.js';
import type { MemoryItem } from '../../../src/types/memory.js';

function makeMemory(id: string, content: string): MemoryItem {
  const now = new Date().toISOString();
  return {
    id,
    content,
    type: 'preference',
    lifecycle: 'semantic',
    source: { kind: 'tool', actor: 'user' },
    scope: { userId: 'u1' },
    scores: { confidence: 0.8, importance: 0.5, explicitness: 1 },
    timestamps: { createdAt: now, updatedAt: now },
    state: { active: true, archived: false },
    evidence: {},
    tags: [],
    relatedEntities: [],
    stats: { accessCount: 0, retrievalCount: 0 },
    sourceGrade: 'primary',
  };
}

describe('ContradictionMonitor', () => {
  let db: Database.Database;
  let relationRepo: RelationRepository;
  let memoryRepo: MemoryRepository;
  let monitor: ContradictionMonitor;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    relationRepo = new RelationRepository(db);
    memoryRepo = new MemoryRepository(db);
    monitor = new ContradictionMonitor(relationRepo, memoryRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('should return empty when no contradictions exist', () => {
    const memory = makeMemory('m1', 'test');
    memoryRepo.insert(memory);

    const alerts = monitor.checkForContradictions('s1', memory);

    assert.equal(alerts.length, 0);
  });

  it('should detect contradictions and queue alerts', () => {
    const m1 = makeMemory('m1', 'prefer dark mode');
    const m2 = makeMemory('m2', 'prefer light mode');
    memoryRepo.insert(m1);
    memoryRepo.insert(m2);

    const now = new Date().toISOString();
    relationRepo.upsert({
      id: 'r1',
      sourceId: 'm1',
      targetId: 'm2',
      relationType: 'contradicts',
      confidence: 0.85,
      weight: 1.0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'auto_detection',
    });

    const alerts = monitor.checkForContradictions('s1', m1);

    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]?.type, 'contradiction');
    assert.equal(alerts[0]?.memoryB.id, 'm2');
    assert.equal(monitor.hasPendingAlerts('s1'), true);
    assert.equal(memoryRepo.findById('m1')?.tags.includes('contradiction_pending'), true);
  });

  it('should drain alerts and clear queue', () => {
    const m1 = makeMemory('m1', 'test');
    const m2 = makeMemory('m2', 'test2');
    memoryRepo.insert(m1);
    memoryRepo.insert(m2);

    const now = new Date().toISOString();
    relationRepo.upsert({
      id: 'r1',
      sourceId: 'm1',
      targetId: 'm2',
      relationType: 'contradicts',
      confidence: 0.85,
      weight: 1.0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'auto_detection',
    });

    monitor.checkForContradictions('s1', m1);
    assert.equal(monitor.hasPendingAlerts('s1'), true);

    const drained = monitor.drainAlerts('s1');
    assert.equal(drained.length, 1);
    assert.equal(monitor.hasPendingAlerts('s1'), false);
  });

  it('should clear pending alerts for a session without draining them', () => {
    const m1 = makeMemory('m1', 'test');
    const m2 = makeMemory('m2', 'test2');
    memoryRepo.insert(m1);
    memoryRepo.insert(m2);

    const now = new Date().toISOString();
    relationRepo.upsert({
      id: 'r1',
      sourceId: 'm1',
      targetId: 'm2',
      relationType: 'contradicts',
      confidence: 0.85,
      weight: 1.0,
      createdAt: now,
      updatedAt: now,
      createdBy: 'auto_detection',
    });

    monitor.checkForContradictions('s1', m1);
    assert.equal(monitor.hasPendingAlerts('s1'), true);

    monitor.clearSession('s1');

    assert.equal(monitor.hasPendingAlerts('s1'), false);
    assert.deepEqual(monitor.drainAlerts('s1'), []);
  });
});

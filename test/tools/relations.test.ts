import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import { runMigrations } from '../../src/storage/migrations.js';
import { RelationRepository } from '../../src/storage/relationRepo.js';
import { evermemoryRelations } from '../../src/tools/relations.js';

describe('evermemoryRelations tool', () => {
  let db: Database.Database;
  let relationRepo: RelationRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    runMigrations(db);
    relationRepo = new RelationRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should list relations for a memory', () => {
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
      createdBy: 'user_explicit',
    });

    const result = evermemoryRelations(relationRepo, { action: 'list', memoryId: 'm1' });

    assert.equal(result.action, 'list');
    assert.equal(result.total, 1);
    assert.ok(result.relations);
    assert.equal(result.relations[0]?.relationType, 'causes');
  });

  it('should add a relation', () => {
    const result = evermemoryRelations(relationRepo, {
      action: 'add',
      memoryId: 'm1',
      targetId: 'm2',
      relationType: 'supports',
    });

    assert.equal(result.action, 'add');
    assert.equal(result.total, 1);
    assert.ok(result.added);
    assert.equal(result.added?.relationType, 'supports');
    assert.equal(relationRepo.findByMemory('m1').length, 1);
  });

  it('should remove a relation', () => {
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
      createdBy: 'user_explicit',
    });

    const result = evermemoryRelations(relationRepo, { action: 'remove', relationId: 'r1' });

    assert.equal(result.action, 'remove');
    assert.equal(result.removed, true);
    assert.equal(relationRepo.findById('r1')?.active, false);
  });

  it('should return graph for a memory', () => {
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
      createdBy: 'user_explicit',
    });

    const result = evermemoryRelations(relationRepo, { action: 'graph', memoryId: 'm1', depth: 1 });

    assert.equal(result.action, 'graph');
    assert.ok(result.graph);
    assert.ok((result.graph?.length ?? 0) > 0);
    assert.equal(result.graph?.[0]?.memoryId, 'm2');
  });

  it('should handle missing params gracefully', () => {
    const result = evermemoryRelations(relationRepo, { action: 'list' });

    assert.equal(result.action, 'list');
    assert.equal(result.total, 0);
    assert.deepEqual(result.relations, []);
  });
});

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { RelationRepository } from '../../src/storage/relationRepo.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import type { MemoryRelation, RelationType } from '../../src/types/relation.js';
import { createInMemoryDb, buildMemory } from './helpers.js';

function makeRelation(
  overrides: Partial<Omit<MemoryRelation, 'active'>> & {
    id: string;
    sourceId: string;
    targetId: string;
    relationType: RelationType;
  },
): Omit<MemoryRelation, 'active'> {
  return {
    id: overrides.id,
    sourceId: overrides.sourceId,
    targetId: overrides.targetId,
    relationType: overrides.relationType,
    confidence: overrides.confidence ?? 0.8,
    weight: overrides.weight ?? 1,
    createdAt: overrides.createdAt ?? '2026-03-21T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-03-21T00:00:00.000Z',
    createdBy: overrides.createdBy ?? 'user_explicit',
    metadata: overrides.metadata,
  };
}

describe('RelationRepository', () => {
  let db: Database.Database;
  let repo: RelationRepository;
  let memoryRepo: MemoryRepository;

  beforeEach(() => {
    db = createInMemoryDb();
    repo = new RelationRepository(db);
    memoryRepo = new MemoryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('upsert', () => {
    it('should insert a new relation', () => {
      repo.upsert(makeRelation({
        id: 'rel-1',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'supports',
        confidence: 0.91,
        weight: 1.25,
        metadata: { note: 'seed' },
      }));

      const relation = repo.findById('rel-1');
      assert.equal(relation?.sourceId, 'a');
      assert.equal(relation?.targetId, 'b');
      assert.equal(relation?.relationType, 'supports');
      assert.equal(relation?.confidence, 0.91);
      assert.equal(relation?.weight, 1.25);
      assert.deepEqual(relation?.metadata, { note: 'seed' });
      assert.equal(relation?.active, true);
    });

    it('should update existing relation on duplicate source+target+type', () => {
      repo.upsert(makeRelation({
        id: 'rel-1',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'supports',
        confidence: 0.6,
        weight: 0.8,
        createdBy: 'user_explicit',
      }));

      repo.upsert(makeRelation({
        id: 'rel-2',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'supports',
        confidence: 0.95,
        weight: 1.4,
        updatedAt: '2026-03-22T00:00:00.000Z',
        createdBy: 'auto_detection',
        metadata: { revised: true },
      }));

      const relations = repo.findByMemory('a');
      assert.equal(relations.length, 1);
      assert.equal(relations[0]?.id, 'rel-1');
      assert.equal(relations[0]?.confidence, 0.95);
      assert.equal(relations[0]?.weight, 1.4);
      assert.equal(relations[0]?.createdBy, 'auto_detection');
      assert.deepEqual(relations[0]?.metadata, { revised: true });
    });
  });

  describe('findByMemory', () => {
    it('should find relations where memory is source or target', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'c', targetId: 'a', relationType: 'depends_on' }));

      const relations = repo.findByMemory('a');
      assert.deepEqual(relations.map((relation) => relation.id), ['rel-1', 'rel-2']);
    });
  });

  describe('countByMemory', () => {
    it('should count active relations', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'c', targetId: 'a', relationType: 'related_to' }));
      repo.upsert(makeRelation({ id: 'rel-3', sourceId: 'd', targetId: 'a', relationType: 'contradicts' }));
      repo.deactivate('rel-3');

      assert.equal(repo.countByMemory('a'), 2);
    });
  });

  describe('deactivate', () => {
    it('should set active=0', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));

      repo.deactivate('rel-1');

      assert.equal(repo.findById('rel-1')?.active, false);
      assert.equal(repo.findByMemory('a').length, 0);
    });
  });

  describe('findConnected (BFS)', () => {
    it('should traverse connected nodes via BFS', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'b', targetId: 'c', relationType: 'supports' }));

      const connected = repo.findConnected('a');
      assert.deepEqual(connected.map((node) => node.memoryId), ['b', 'c']);
      assert.equal(connected[0]?.depth, 1);
      assert.equal(connected[0]?.path, 'a→b');
      assert.equal(connected[1]?.depth, 2);
      assert.equal(connected[1]?.path, 'a→b→c');
    });

    it('should respect maxDepth', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'b', targetId: 'c', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-3', sourceId: 'c', targetId: 'd', relationType: 'supports' }));

      const connected = repo.findConnected('a', { maxDepth: 1 });
      assert.deepEqual(connected.map((node) => node.memoryId), ['b']);
    });

    it('should handle cycles without infinite loop', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'related_to' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'b', targetId: 'a', relationType: 'related_to' }));

      const connected = repo.findConnected('a', { maxDepth: 4 });
      assert.deepEqual(connected.map((node) => node.memoryId), ['b']);
      assert.equal(connected[0]?.depth, 1);
    });

    it('should filter by relation type', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'b', targetId: 'c', relationType: 'related_to' }));
      repo.upsert(makeRelation({ id: 'rel-3', sourceId: 'a', targetId: 'd', relationType: 'supports' }));

      const connected = repo.findConnected('a', { types: ['supports'] });
      assert.deepEqual(connected.map((node) => node.memoryId), ['b', 'd']);
    });
  });

  describe('findCausalChain', () => {
    it('should find forward causal chain', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'causes' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'b', targetId: 'c', relationType: 'causes' }));

      const chains = repo.findCausalChain('a', 'forward');
      assert.ok(chains.some((chain) => chain.nodes.join('|') === 'a|b'));
      assert.ok(chains.some((chain) => chain.nodes.join('|') === 'a|b|c'));
    });
  });

  describe('findContradictionCluster', () => {
    it('should find contradictions around a memory', () => {
      repo.upsert(makeRelation({
        id: 'rel-1',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'contradicts',
        confidence: 0.7,
      }));
      repo.upsert(makeRelation({
        id: 'rel-2',
        sourceId: 'a',
        targetId: 'c',
        relationType: 'contradicts',
        confidence: 0.9,
      }));

      const cluster = repo.findContradictionCluster('a');
      assert.equal(cluster.centerId, 'a');
      assert.deepEqual(cluster.contradictions.map((item) => item.memoryId), ['c', 'b']);
      assert.deepEqual(cluster.contradictions.map((item) => item.relationId), ['rel-2', 'rel-1']);
    });
  });

  describe('findShortestPath', () => {
    it('should find path between two nodes', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));
      repo.upsert(makeRelation({ id: 'rel-2', sourceId: 'b', targetId: 'c', relationType: 'depends_on' }));

      const path = repo.findShortestPath('a', 'c');
      assert.deepEqual(path?.nodes, ['a', 'b', 'c']);
      assert.deepEqual(path?.relations, ['supports', 'depends_on']);
      assert.equal(path?.totalWeight, 2);
    });

    it('should return null when no path exists', () => {
      repo.upsert(makeRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'supports' }));

      assert.equal(repo.findShortestPath('a', 'z'), null);
    });
  });

  describe('updateGraphStats', () => {
    it('should compute correct in/out degree', () => {
      repo.upsert(makeRelation({
        id: 'rel-1',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'supports',
        weight: 1.5,
      }));
      repo.upsert(makeRelation({
        id: 'rel-2',
        sourceId: 'a',
        targetId: 'c',
        relationType: 'related_to',
        weight: 0.7,
      }));
      repo.upsert(makeRelation({
        id: 'rel-3',
        sourceId: 'd',
        targetId: 'a',
        relationType: 'contradicts',
        weight: 0.9,
      }));

      repo.updateGraphStats('a');

      const stats = repo.getGraphStats('a');
      assert.equal(stats?.memoryId, 'a');
      assert.equal(stats?.inDegree, 1);
      assert.equal(stats?.outDegree, 2);
      assert.equal(stats?.strongestRelationType, 'supports');
      assert.equal(stats?.strongestRelationId, 'rel-1');
    });
  });

  describe('decayWeights', () => {
    it('should reduce weights and prune below threshold', () => {
      repo.upsert(makeRelation({
        id: 'rel-1',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'supports',
        weight: 0.1,
      }));

      const result = repo.decayWeights();

      assert.equal(result.decayed, 1);
      assert.equal(result.pruned, 1);
      assert.equal(repo.findById('rel-1')?.active, false);
    });
  });

  describe('reinforceWeight', () => {
    it('should increase weight up to cap', () => {
      repo.upsert(makeRelation({
        id: 'rel-1',
        sourceId: 'a',
        targetId: 'b',
        relationType: 'supports',
        weight: 1.95,
      }));

      repo.reinforceWeight('rel-1');

      assert.equal(repo.findById('rel-1')?.weight, 2);
    });
  });
});

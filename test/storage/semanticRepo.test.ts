import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { SemanticRepository } from '../../src/storage/semanticRepo.js';
import { buildSemanticProfile } from '../../src/retrieval/semantic.js';
import { StorageError } from '../../src/errors.js';
import { createInMemoryDb, buildMemory } from './helpers.js';

describe('SemanticRepository', () => {
  let db: Database.Database | undefined;

  afterEach(() => db?.close());

  it('upserts semantic records and stores profile tokens and weights', () => {
    db = createInMemoryDb();
    const memoryRepo = new MemoryRepository(db);
    const repo = new SemanticRepository(db);
    const memory = buildMemory({ id: 'mem-semantic', content: 'Plan sprint kickoff plan' });
    memoryRepo.insert(memory);

    repo.upsertFromMemory(memory);

    const record = repo.findByMemoryId(memory.id);
    const expected = buildSemanticProfile(memory.content);
    assert.equal(record?.memoryId, memory.id);
    assert.deepEqual(record?.tokens, expected.tokens);
    assert.equal(record?.weights.plan, expected.weights.plan);
  });

  it('stores and restores embeddings as Float32Array', async () => {
    db = createInMemoryDb();
    const memoryRepo = new MemoryRepository(db);
    const repo = new SemanticRepository(db);
    memoryRepo.insert(buildMemory({ id: 'mem-embed' }));

    await repo.storeEmbedding('mem-embed', new Float32Array([0.1, 0.2, 0.3]), 'test-model');

    const embedding = await repo.getEmbedding('mem-embed');
    assert.equal(embedding?.model, 'test-model');
    assert.equal(embedding?.dimensions, 3);
    const values = Array.from(embedding?.values ?? []);
    assert.equal(values.length, 3);
    assert.ok(Math.abs(values[0]! - 0.1) < 1e-6);
    assert.ok(Math.abs(values[1]! - 0.2) < 1e-6);
    assert.ok(Math.abs(values[2]! - 0.3) < 1e-6);
  });

  it('returns cosine matches sorted by score and ignores mismatched dimensions', async () => {
    db = createInMemoryDb();
    const memoryRepo = new MemoryRepository(db);
    const repo = new SemanticRepository(db);
    for (const id of ['a', 'b', 'c']) {
      memoryRepo.insert(buildMemory({ id }));
    }

    await repo.storeEmbedding('a', new Float32Array([1, 0]), 'm');
    await repo.storeEmbedding('b', new Float32Array([0.8, 0.2]), 'm');
    await repo.storeEmbedding('c', new Float32Array([0, 1]), 'm');
    db.prepare('UPDATE memory_items SET embedding_dim = 3 WHERE id = ?').run('c');

    const hits = await repo.searchByCosine(new Float32Array([1, 0]), 3, 0.1);
    assert.deepEqual(hits.map((hit) => hit.memoryId), ['a', 'b']);
    assert.ok(hits[0]!.score >= hits[1]!.score);
  });

  it('handles empty vectors and missing memories defensively', async () => {
    db = createInMemoryDb();
    const repo = new SemanticRepository(db);

    await assert.rejects(() => repo.storeEmbedding('missing', new Float32Array([]), 'm'), {
      name: 'StorageError',
    });
    await assert.rejects(() => repo.storeEmbedding('missing', new Float32Array([1, 2]), 'm'), {
      name: 'StorageError',
    });
    assert.deepEqual(await repo.searchByCosine(new Float32Array([]), 5), []);
    assert.equal(await repo.getEmbedding('missing'), null);
  });

  it('adds recovery hints to semantic search failures', () => {
    db = createInMemoryDb();
    const repo = new SemanticRepository(db);
    const prepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      if (sql.includes('SELECT * FROM semantic_index')) {
        throw new Error('db unavailable');
      }
      return prepare(sql);
    }) as typeof db.prepare;

    assert.throws(
      () => repo.search('project planning'),
      (error: unknown) => {
        assert.ok(error instanceof StorageError);
        assert.match(error.message, /Failed to search semantic index/);
        assert.match(error.message, /Check embedding provider status/);
        assert.match(error.message, /database is accessible/);
        return true;
      },
    );
  });
});

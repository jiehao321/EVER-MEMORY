import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('semantic sidecar is disabled by default and does not index memories', () => {
  const databasePath = createTempDbPath('semantic-disabled');
  const app = initializeEverMemory({ databasePath });

  const write = app.evermemoryStore({
    content: '部署策略：先检查风险再执行。',
    type: 'project',
    scope: { userId: 'u-semantic-0' },
  });

  assert.equal(write.accepted, true);
  assert.equal(app.semanticRepo.count(), 0);

  const status = app.evermemoryStatus({ userId: 'u-semantic-0' });
  assert.equal(status.semanticIndexCount, 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('semantic sidecar indexes accepted writes and can search similar memory', () => {
  const databasePath = createTempDbPath('semantic-enabled');
  const app = initializeEverMemory({
    databasePath,
    semantic: {
      enabled: true,
      maxCandidates: 100,
      minScore: 0.05,
    },
  });

  const m1 = app.evermemoryStore({
    content: '部署前先确认回滚方案，并检查变更窗口。',
    type: 'constraint',
    scope: { userId: 'u-semantic-1', project: 'evermemory' },
  });
  const m2 = app.evermemoryStore({
    content: '发布流程需要保留审计日志。',
    type: 'project',
    scope: { userId: 'u-semantic-1', project: 'evermemory' },
  });
  const m3 = app.evermemoryStore({
    content: '周末去爬山。',
    type: 'fact',
    scope: { userId: 'u-semantic-1' },
  });
  const rejected = app.evermemoryStore({
    content: '好的',
    scope: { userId: 'u-semantic-1' },
  });

  assert.equal(m1.accepted, true);
  assert.equal(m2.accepted, true);
  assert.equal(m3.accepted, true);
  assert.equal(rejected.accepted, false);
  assert.equal(app.semanticRepo.count(), 3);

  const hits = app.semanticRepo.search('部署前确认', {
    limit: 5,
    minScore: 0.05,
    candidateLimit: 100,
  });
  assert.ok(hits.length >= 1);
  assert.equal(hits[0]?.memoryId, m1.memory?.id);

  const indexedEvents = app.debugRepo.listRecent('semantic_indexed', 10);
  assert.ok(indexedEvents.length >= 3);

  const status = app.evermemoryStatus({ userId: 'u-semantic-1' });
  assert.equal(status.semanticIndexCount, 3);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('semantic sidecar treats % and _ as literal query tokens', () => {
  const databasePath = createTempDbPath('semantic-like-escape');
  const app = initializeEverMemory({
    databasePath,
    semantic: {
      enabled: true,
      maxCandidates: 100,
      minScore: 0.05,
    },
  });

  const literalToken = app.evermemoryStore({
    content: 'literal feature%_alpha marker',
    type: 'fact',
    scope: { userId: 'u-semantic-2' },
  });
  app.evermemoryStore({
    content: 'literal featureZZalpha marker',
    type: 'fact',
    scope: { userId: 'u-semantic-2' },
  });

  assert.equal(literalToken.accepted, true);

  const hits = app.semanticRepo.search('feature%_alpha', {
    limit: 5,
    minScore: 0.05,
    candidateLimit: 100,
  });
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.memoryId, literalToken.memory?.id);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

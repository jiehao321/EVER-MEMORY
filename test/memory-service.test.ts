import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('memory service returns a single evaluated result for accepted and rejected writes', () => {
  const databasePath = createTempDbPath('memory-service');
  const app = initializeEverMemory({ databasePath });

  const accepted = app.memoryService.store({
    content: '我喜欢简洁直接的回答。',
    scope: { userId: 'user-1' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.reason, 'accepted_by_deterministic_baseline');
  assert.ok(accepted.memory);
  assert.equal(accepted.memory?.type, 'preference');

  const rejected = app.memoryService.store({
    content: '好的',
    scope: { userId: 'user-1' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'low_value_chatter');
  assert.equal(rejected.memory, null);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('memory write policy rejects empty or low-value content with explicit reasons', () => {
  const databasePath = createTempDbPath('memory-service-reject-matrix');
  const app = initializeEverMemory({ databasePath });

  const empty = app.memoryService.store({
    content: '   ',
    scope: { userId: 'user-2' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(empty.accepted, false);
  assert.equal(empty.reason, 'empty_content');

  const tooLong = app.memoryService.store({
    content: `我喜欢${'a'.repeat(10_001)}`,
    scope: { userId: 'user-2' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(tooLong.accepted, false);
  assert.equal(tooLong.reason, 'content_too_long');

  const short = app.memoryService.store({
    content: '嗯',
    scope: { userId: 'user-2' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(short.accepted, false);
  assert.equal(short.reason, 'low_value_chatter');

  const chatter = app.memoryService.store({
    content: 'ok',
    scope: { userId: 'user-2' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(chatter.accepted, false);
  assert.equal(chatter.reason, 'low_value_chatter');

  const accepted = app.memoryService.store({
    content: '决定：部署前先确认回滚方案。',
    scope: { userId: 'user-2' },
    source: { kind: 'manual', actor: 'user' },
  });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.memory?.type, 'decision');
  assert.equal(accepted.memory?.lifecycle, 'semantic');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

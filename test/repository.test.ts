import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('repository count helpers respect scope and type/lifecycle aggregation', () => {
  const databasePath = createTempDbPath('repository');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({ content: '我喜欢中文。', scope: { userId: 'u1' } });
  app.evermemoryStore({ content: '不要主动发散。', scope: { userId: 'u1' } });
  app.evermemoryStore({ content: '我喜欢英文。', scope: { userId: 'u2' } });

  assert.equal(app.memoryRepo.count({ scope: { userId: 'u1' } }), 2);
  assert.equal(app.memoryRepo.count({ scope: { userId: 'u2' } }), 1);

  const byType = app.memoryRepo.countByType({ scope: { userId: 'u1' } });
  assert.equal(byType.preference, 1);
  assert.equal(byType.constraint, 1);

  const byLifecycle = app.memoryRepo.countByLifecycle({ scope: { userId: 'u1' } });
  assert.equal(byLifecycle.semantic, 2);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

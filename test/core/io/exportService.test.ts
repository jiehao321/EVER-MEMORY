import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import { createTempDbPath } from '../../helpers.js';

test('export outputs valid JSON array', () => {
  const databasePath = createTempDbPath('export-json');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '默认使用中文。',
    type: 'preference',
    scope: { userId: 'u-export-json' },
    tags: ['language'],
  });

  const result = app.export('json', { userId: 'u-export-json' });
  const parsed = JSON.parse(result.content) as Array<{ content: string; kind: string; type: string }>;

  assert.equal(result.format, 'json');
  assert.equal(result.count, 1);
  assert.equal(parsed[0]?.content, '默认使用中文。');
  assert.equal(parsed[0]?.kind, 'preference');
  assert.equal(parsed[0]?.type, 'preference');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('export outputs markdown blocks with headings', () => {
  const databasePath = createTempDbPath('export-markdown');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '上线前先确认回滚方案。',
    type: 'constraint',
    scope: { userId: 'u-export-markdown' },
  });

  const result = app.export('markdown', { userId: 'u-export-markdown' });

  assert.equal(result.format, 'markdown');
  assert.match(result.content, /^## \[constraint\] 上线前先确认回滚方案。/m);
  assert.match(result.content, /- 标签:/);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('import JSON writes memories and skips duplicate content plus kind', async () => {
  const databasePath = createTempDbPath('import-json');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '保持回答简洁。',
    type: 'style',
    scope: { userId: 'u-import-json' },
  });

  const payload = JSON.stringify([
    { content: '保持回答简洁。', kind: 'style', tags: ['tone'] },
    { content: '部署前先确认风险。', kind: 'constraint', tags: ['release'] },
  ]);

  const result = await app.import(payload, 'json', { userId: 'u-import-json' });

  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(app.memoryRepo.count({ scope: { userId: 'u-import-json' } }), 2);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('import reports parse and validation errors', async () => {
  const databasePath = createTempDbPath('import-errors');
  const app = initializeEverMemory({ databasePath });

  const parseError = await app.import('{bad json', 'json', { userId: 'u-import-errors' });
  assert.ok(parseError.errors.length >= 1);

  const invalidContent = await app.import(JSON.stringify([
    { content: 'x'.repeat(10001), kind: 'fact' },
  ]), 'json', { userId: 'u-import-errors' });
  assert.ok(invalidContent.errors.length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

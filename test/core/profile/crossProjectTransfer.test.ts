import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import { CrossProjectTransferService } from '../../../src/core/profile/crossProjectTransfer.js';
import { createTempDbPath } from '../../helpers.js';

test('getGlobalPreferences returns global-scope preferences sorted by importance * confidence', () => {
  const databasePath = createTempDbPath('cross-project-global');
  const app = initializeEverMemory({ databasePath });
  const service = new CrossProjectTransferService(app.memoryRepo);

  app.memoryService.store({
    content: '全局约束：不要直接修改生产数据库',
    type: 'constraint',
    scope: { userId: 'u-transfer', global: true },
    source: { kind: 'manual', actor: 'user' },
    confidence: 0.92,
    importance: 0.95,
    tags: ['explicit_constraint', 'global'],
  });
  app.memoryService.store({
    content: '全局偏好：回答先给结论',
    type: 'preference',
    scope: { userId: 'u-transfer' },
    source: { kind: 'manual', actor: 'user' },
    confidence: 0.96,
    importance: 0.7,
    tags: ['user_preference', 'global'],
  });
  app.memoryService.store({
    content: '项目 A 偏好：接口优先保持稳定',
    type: 'preference',
    scope: { userId: 'u-transfer', project: 'project-a' },
    source: { kind: 'manual', actor: 'user' },
    confidence: 0.99,
    importance: 0.99,
    tags: ['user_preference'],
  });

  const preferences = service.getGlobalPreferences('u-transfer');

  assert.equal(preferences.length, 2);
  assert.equal(preferences[0]?.content, '全局约束：不要直接修改生产数据库');
  assert.equal(preferences[0]?.kind, 'explicit_constraint');
  assert.equal(preferences[1]?.content, '全局偏好：回答先给结论');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('getTransferableTo excludes preferences already covered in target project', () => {
  const databasePath = createTempDbPath('cross-project-target-filter');
  const app = initializeEverMemory({ databasePath });
  const service = new CrossProjectTransferService(app.memoryRepo);

  app.memoryService.store({
    content: '用户偏好记录：回答先给结论，再展开说明',
    type: 'preference',
    scope: { userId: 'u-transfer-2', project: 'project-a' },
    source: { kind: 'manual', actor: 'user' },
    confidence: 0.95,
    importance: 0.8,
    tags: ['user_preference'],
  });
  app.memoryService.store({
    content: '用户偏好记录：提交前保留回滚方案',
    type: 'preference',
    scope: { userId: 'u-transfer-2', project: 'project-c' },
    source: { kind: 'manual', actor: 'user' },
    confidence: 0.88,
    importance: 0.9,
    tags: ['user_preference'],
  });
  app.memoryService.store({
    content: '用户偏好记录：回答先给结论并再展开说明',
    type: 'preference',
    scope: { userId: 'u-transfer-2', project: 'project-b' },
    source: { kind: 'manual', actor: 'user' },
    confidence: 0.93,
    importance: 0.7,
    tags: ['user_preference'],
  });

  const transferable = service.getTransferableTo('u-transfer-2', 'project-b');

  assert.equal(transferable.length, 1);
  assert.equal(transferable[0]?.content, '用户偏好记录：提交前保留回滚方案');
  assert.equal(transferable[0]?.sourceProject, 'project-c');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('shouldInheritGlobal always returns true for explicit_constraint', () => {
  const databasePath = createTempDbPath('cross-project-inherit');
  const app = initializeEverMemory({ databasePath });
  const service = new CrossProjectTransferService(app.memoryRepo);

  assert.equal(service.shouldInheritGlobal({
    content: '不要直接修改生产数据库',
    kind: 'explicit_constraint',
    confidence: 0.2,
    tags: [],
  }), true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

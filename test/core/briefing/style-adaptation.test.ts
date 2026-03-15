import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import { createTempDbPath } from '../../helpers.js';

function seedBriefingData(app: ReturnType<typeof initializeEverMemory>, userId: string, project = 'apollo') {
  app.memoryService.store({
    content: '你是 Alex 的长期协作助手',
    type: 'identity',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
    tags: ['identity'],
  });
  app.memoryService.store({
    content: '关键约束：不要直接修改生产数据库',
    type: 'constraint',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
    tags: ['explicit_constraint'],
  });
  app.memoryService.store({
    content: '关键约束：部署前先准备回滚方案',
    type: 'constraint',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
    tags: ['explicit_constraint'],
  });
  app.memoryService.store({
    content: '关键约束：涉及 schema 变更必须先评审',
    type: 'constraint',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
    tags: ['explicit_constraint'],
  });
  app.memoryService.store({
    content: '最近决策：先完善回归测试',
    type: 'decision',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
  });
  app.memoryService.store({
    content: '最近决策：日志采样先保守上线',
    type: 'decision',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
  });
  app.memoryService.store({
    content: '最近决策：灰度完成后再放量',
    type: 'decision',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
  });
  app.memoryService.store({
    content: '下一步：补齐 E2E 回归',
    type: 'commitment',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
  });
  app.memoryService.store({
    content: '下一步：整理风险清单',
    type: 'commitment',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
  });
  app.memoryService.store({
    content: '下一步：更新发布说明',
    type: 'commitment',
    scope: { userId, project },
    source: { kind: 'manual', actor: 'user' },
  });
}

test('concise mode caps each briefing section at 2 items', () => {
  const databasePath = createTempDbPath('briefing-style-concise');
  const app = initializeEverMemory({ databasePath });
  seedBriefingData(app, 'u-briefing-style-1');

  const briefing = app.briefingService.build(
    { userId: 'u-briefing-style-1', project: 'apollo' },
    { communicationStyle: 'concise' },
  );

  assert.ok(Object.values(briefing.sections).every((section) => section.length <= 2));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('detailed mode allows more items to remain in briefing output', () => {
  const databasePath = createTempDbPath('briefing-style-detailed');
  const app = initializeEverMemory({ databasePath });
  seedBriefingData(app, 'u-briefing-style-2');

  const briefing = app.briefingService.build(
    { userId: 'u-briefing-style-2', project: 'apollo' },
    { communicationStyle: 'detailed' },
  );

  assert.ok(briefing.sections.constraints.length >= 3);
  assert.ok(briefing.sections.recentContinuity.length >= 3);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('briefing build remains backward compatible when communicationStyle is omitted', () => {
  const databasePath = createTempDbPath('briefing-style-default');
  const app = initializeEverMemory({ databasePath });
  seedBriefingData(app, 'u-briefing-style-3');

  const briefing = app.briefingService.build({ userId: 'u-briefing-style-3', project: 'apollo' });

  assert.ok(briefing.sections.constraints.length >= 3);
  assert.ok(briefing.sections.recentContinuity.length >= 3);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

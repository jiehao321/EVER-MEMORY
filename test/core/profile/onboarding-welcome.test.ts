import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import { createTempDbPath } from '../../helpers.js';

test('generateWelcomeMessage returns steward intro on first run', () => {
  const databasePath = createTempDbPath('onboarding-welcome-first-run');
  const app = initializeEverMemory({ databasePath });

  const message = app.onboardingService.generateWelcomeMessage(true);
  assert.match(message, /我是 EverMemory，您的 AI 大管家/);
  assert.match(message, /让我先了解一下您的工作习惯/);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('generateWelcomeMessage includes user name and memory count for returning users', () => {
  const databasePath = createTempDbPath('onboarding-welcome-returning');
  const app = initializeEverMemory({ databasePath });

  app.memoryService.store({
    content: '用户偏好：默认中文回复。',
    type: 'preference',
    scope: { userId: 'welcome-user' },
    source: { kind: 'tool', actor: 'user' },
  });
  app.memoryService.store({
    content: '项目方向：AI 工具链。',
    type: 'project',
    scope: { userId: 'welcome-user' },
    source: { kind: 'tool', actor: 'user' },
  });

  const message = app.onboardingService.generateWelcomeMessage(false, '小王', 'welcome-user');
  assert.match(message, /欢迎回来，小王/);
  assert.match(message, /我已记住 2 条您的信息/);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

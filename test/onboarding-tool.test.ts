import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('evermemoryOnboard returns questions first and then persists responses', async () => {
  const databasePath = createTempDbPath('tool-onboarding');
  const app = initializeEverMemory({ databasePath });

  const initial = await app.evermemoryOnboard({
    userId: 'u-tool-onboarding-1',
  });
  assert.equal(initial.needsOnboarding, true);
  assert.equal(initial.questions.length, 6);
  assert.equal(initial.result, undefined);
  assert.match(initial.welcomeMessage ?? '', /AI 大管家/);

  const completed = await app.evermemoryOnboard({
    userId: 'u-tool-onboarding-1',
    responses: [
      {
        questionId: 'work_style',
        answer: '直接执行，但关键风险点先确认。',
      },
      {
        questionId: 'tech_stack',
        answer: 'TypeScript、React。',
      },
      {
        questionId: 'communication_style',
        answer: '结构化输出。',
      },
      {
        questionId: 'always_remember',
        answer: '项目内默认给出 next steps。',
      },
      {
        questionId: 'never_do',
        answer: '不要跳过测试直接提交。',
      },
      {
        questionId: 'primary_domain',
        answer: '研发效能平台。',
      },
    ],
  });

  assert.equal(completed.needsOnboarding, false);
  assert.equal(completed.questions.length, 0);
  assert.equal(completed.completionMessage, '✓ 初始化完成！我已记录您的偏好。随时可以开始工作。');
  assert.deepEqual(completed.result, {
    completed: true,
    profileUpdated: true,
    memoriesCreated: 6,
  });

  const repeated = await app.evermemoryOnboard({
    userId: 'u-tool-onboarding-1',
  });
  assert.equal(repeated.needsOnboarding, false);
  assert.equal(repeated.questions.length, 0);
  assert.match(repeated.welcomeMessage ?? '', /欢迎回来/);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

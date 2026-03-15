import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import {
  ONBOARDING_COMPLETED_HINT,
} from '../../../src/core/profile/onboarding.js';
import { createTempDbPath } from '../../helpers.js';

test('isOnboardingNeeded returns true for a new user', () => {
  const databasePath = createTempDbPath('onboarding-new-user');
  const app = initializeEverMemory({ databasePath });

  assert.equal(app.onboardingService.isOnboardingNeeded('u-onboarding-new'), true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('isOnboardingNeeded returns false after onboarding is completed', async () => {
  const databasePath = createTempDbPath('onboarding-completed');
  const app = initializeEverMemory({ databasePath });

  await app.onboardingService.processResponses('u-onboarding-done', [
    {
      questionId: 'work_style',
      answer: '先确认关键步骤，再执行。',
    },
    {
      questionId: 'tech_stack',
      answer: 'TypeScript、Node.js、React。',
    },
    {
      questionId: 'communication_style',
      answer: '简洁直接，结构化输出。',
    },
    {
      questionId: 'always_remember',
      answer: '默认中文回复。',
    },
    {
      questionId: 'never_do',
      answer: '不要未经确认直接改生产配置。',
    },
    {
      questionId: 'primary_domain',
      answer: '企业效率工具开发。',
    },
  ]);

  assert.equal(app.onboardingService.isOnboardingNeeded('u-onboarding-done'), false);
  assert.ok(
    app.profileRepo.getByUserId('u-onboarding-done')?.behaviorHints.includes(ONBOARDING_COMPLETED_HINT),
  );

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('getQuestions returns six valid onboarding questions', () => {
  const databasePath = createTempDbPath('onboarding-questions');
  const app = initializeEverMemory({ databasePath });

  const questions = app.onboardingService.getQuestions();
  assert.equal(questions.length, 6);
  assert.deepEqual(
    questions.map((question) => question.id),
    [
      'work_style',
      'tech_stack',
      'communication_style',
      'always_remember',
      'never_do',
      'primary_domain',
    ],
  );
  for (const question of questions) {
    assert.ok(question.question.length >= 5);
    assert.ok(['work_style', 'tech_stack', 'communication', 'preferences'].includes(question.category));
  }

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('processResponses creates memories and updates the profile', async () => {
  const databasePath = createTempDbPath('onboarding-process');
  const app = initializeEverMemory({ databasePath });

  const result = await app.onboardingService.processResponses('u-onboarding-process', [
    {
      questionId: 'work_style',
      answer: '逐步确认，关键操作先让我确认。',
    },
    {
      questionId: 'tech_stack',
      answer: 'TypeScript、Node.js、React、PostgreSQL。',
    },
    {
      questionId: 'communication_style',
      answer: '简洁直接，结论先行。',
    },
    {
      questionId: 'always_remember',
      answer: '请默认中文输出。',
    },
    {
      questionId: 'never_do',
      answer: '不要擅自删除文件或执行破坏性命令。',
    },
    {
      questionId: 'primary_domain',
      answer: 'AI 工具链与插件开发。',
    },
  ]);

  assert.deepEqual(result, {
    completed: true,
    profileUpdated: true,
    memoriesCreated: 6,
  });

  const profile = app.profileRepo.getByUserId('u-onboarding-process');
  assert.ok(profile);
  assert.equal(profile?.stable.explicitPreferences.communication_style.value, 'concise_direct');
  assert.equal(profile?.stable.explicitPreferences.default_preference.value, '请默认中文输出。');
  assert.ok(profile?.stable.explicitConstraints.some((item) => item.value.includes('不要擅自删除文件')));
  assert.ok(profile?.behaviorHints.includes(ONBOARDING_COMPLETED_HINT));

  const memories = app.memoryService.listRecent({ userId: 'u-onboarding-process' }, 10);
  assert.equal(memories.length, 6);
  assert.ok(memories.some((memory) => memory.type === 'project' && memory.content.includes('AI 工具链')));
  assert.ok(memories.some((memory) => memory.type === 'constraint'));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('processResponses clips oversized answers before storing onboarding memories', async () => {
  const databasePath = createTempDbPath('onboarding-answer-clipping');
  const app = initializeEverMemory({ databasePath });
  const longAnswer = `  ${'a'.repeat(520)}  `;

  await app.onboardingService.processResponses('u-onboarding-clipped', [
    {
      questionId: 'always_remember',
      answer: longAnswer,
    },
  ]);

  const memories = app.memoryService.listRecent({ userId: 'u-onboarding-clipped' }, 10);
  assert.equal(memories.length, 1);
  assert.equal(memories[0]?.content.length, 503);
  assert.equal(memories[0]?.content, `${'a'.repeat(500)}...`);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

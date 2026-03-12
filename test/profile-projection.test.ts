import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('profile recompute keeps stable/derived split and never lets derived override explicit stable facts', () => {
  const databasePath = createTempDbPath('profile-projection');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '请记住：输出要简洁直接，先给结论。',
    type: 'preference',
    scope: { userId: 'u-profile-1' },
    tags: ['style'],
  });
  app.evermemoryStore({
    content: '必须先确认再执行关键操作。',
    type: 'constraint',
    scope: { userId: 'u-profile-1' },
  });
  app.memoryService.store({
    content: '推断：用户更喜欢详细长文说明。',
    type: 'style',
    scope: { userId: 'u-profile-1' },
    source: { kind: 'inference', actor: 'system' },
    explicitness: 0.35,
    confidence: 0.65,
    importance: 0.6,
  });
  app.evermemoryStore({
    content: '项目里程碑按分步计划推进，逐周复盘。',
    type: 'project',
    scope: { userId: 'u-profile-1', project: 'evermemory' },
    tags: ['evermemory', 'roadmap'],
    relatedEntities: ['milestone'],
  });

  const profile = app.profileRepo.getByUserId('u-profile-1');
  assert.ok(profile);
  assert.equal(profile?.stable.explicitPreferences.communication_style, 'concise_direct');
  assert.equal(profile?.derived.communicationStyle, undefined);
  assert.ok((profile?.derived.likelyInterests.length ?? 0) >= 1);

  const patternValues = profile?.derived.workPatterns.map((item) => item.value) ?? [];
  assert.ok(patternValues.includes('stepwise_planning'));
  assert.ok(!patternValues.includes('confirm_before_execution'));

  const profileEvents = app.debugRepo.listRecent('profile_recomputed', 10);
  assert.ok(profileEvents.length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('profile recompute handles empty memory state without throwing', () => {
  const databasePath = createTempDbPath('profile-empty');
  const app = initializeEverMemory({ databasePath });

  const profile = app.profileService.recomputeForUser('u-profile-empty');
  assert.ok(profile);
  assert.equal(profile?.userId, 'u-profile-empty');
  assert.deepEqual(profile?.stable.explicitPreferences, {});
  assert.deepEqual(profile?.stable.explicitConstraints, []);
  assert.deepEqual(profile?.derived.likelyInterests, []);
  assert.deepEqual(profile?.derived.workPatterns, []);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('profile recompute extracts timezone and preferred address from explicit preferences', () => {
  const databasePath = createTempDbPath('profile-timezone-address');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '请叫我 Alex。',
    type: 'identity',
    scope: { userId: 'u-profile-2' },
    tags: ['identity'],
  });
  app.evermemoryStore({
    content: '我的时区是 UTC+8。',
    type: 'preference',
    scope: { userId: 'u-profile-2' },
    tags: ['timezone'],
  });

  const profile = app.profileRepo.getByUserId('u-profile-2');
  assert.ok(profile);
  assert.equal(profile?.stable.preferredAddress, 'Alex');
  assert.equal(profile?.stable.timezone, 'UTC+08:00');
  assert.equal(profile?.stable.explicitPreferences.timezone, 'UTC+08:00');

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

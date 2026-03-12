import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('reflection service generates reviewable reflection records and candidate rules', () => {
  const databasePath = createTempDbPath('reflection');
  const app = initializeEverMemory({ databasePath });

  const exp1 = app.experienceService.log({
    sessionId: 'session-ref-1',
    inputText: '更正一下，之前输出错了。',
    actionSummary: '根据更正重写结果',
    outcomeSummary: '用户说：好的',
    evidenceRefs: ['msg-1'],
  });
  const exp2 = app.experienceService.log({
    sessionId: 'session-ref-1',
    inputText: '再强调一次，要先确认再执行。',
    actionSummary: '执行前确认',
    outcomeSummary: '用户确认通过',
    evidenceRefs: ['msg-2'],
  });

  const result = app.reflectionService.reflect({
    triggerKind: 'manual-review',
    sessionId: 'session-ref-1',
    experienceIds: [exp1.id, exp2.id],
    mode: 'light',
  });

  assert.ok(result.reflection);
  assert.ok((result.reflection?.candidateRules.length ?? 0) > 0);
  assert.equal(result.reflection?.state.promoted, false);

  const stored = result.reflection ? app.reflectionRepo.findById(result.reflection.id) : null;
  assert.ok(stored);

  const createdEvents = app.debugRepo.listRecent('reflection_created', 20);
  assert.ok(createdEvents.length >= 1);

  const skipped = app.reflectionService.reflect({
    triggerKind: 'manual-review',
    sessionId: 'session-not-found',
    mode: 'full',
  });
  assert.equal(skipped.reflection, null);
  assert.equal(skipped.processedExperiences, 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('reflection logs missing experience references for partial and full missing cases', () => {
  const databasePath = createTempDbPath('reflection-missing-experience');
  const app = initializeEverMemory({ databasePath });

  const existing = app.experienceService.log({
    sessionId: 'session-ref-missing-1',
    inputText: '更正一下，先确认后执行。',
    actionSummary: '执行前确认',
    outcomeSummary: '已确认',
    evidenceRefs: ['msg-ref-missing-1'],
  });

  const partial = app.reflectionService.reflect({
    triggerKind: 'manual-review',
    experienceIds: [existing.id, 'missing-experience-id-1'],
    mode: 'light',
  });
  assert.ok(partial.reflection);

  const createdEvent = app.debugRepo.listRecent('reflection_created', 1)[0];
  assert.equal(createdEvent?.payload.missingExperienceCount, 1);
  assert.deepEqual(createdEvent?.payload.missingExperienceIds, ['missing-experience-id-1']);

  const missingOnly = app.reflectionService.reflect({
    triggerKind: 'manual-review',
    experienceIds: ['missing-experience-id-2'],
    mode: 'light',
  });
  assert.equal(missingOnly.reflection, null);
  assert.equal(missingOnly.processedExperiences, 0);

  const skippedEvent = app.debugRepo.listRecent('reflection_skipped', 1)[0];
  assert.equal(skippedEvent?.payload.reason, 'missing_experience_refs');
  assert.equal(skippedEvent?.payload.missingExperienceCount, 1);
  assert.deepEqual(skippedEvent?.payload.missingExperienceIds, ['missing-experience-id-2']);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

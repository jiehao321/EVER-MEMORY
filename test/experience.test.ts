import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('experience service logs structured experience records', () => {
  const databasePath = createTempDbPath('experience');
  const app = initializeEverMemory({ databasePath });

  const experience = app.experienceService.log({
    sessionId: 'session-exp-1',
    messageId: 'msg-exp-1',
    inputText: '更正一下，上次方案不对。',
    actionSummary: '更新执行计划并等待确认',
    outcomeSummary: '用户确认：可以',
    evidenceRefs: ['msg-exp-1'],
  });

  assert.equal(experience.sessionId, 'session-exp-1');
  assert.equal(typeof experience.indicators.userCorrection, 'boolean');
  assert.equal(experience.evidenceRefs.length, 1);

  const persisted = app.experienceRepo.findById(experience.id);
  assert.ok(persisted);
  assert.equal(persisted?.id, experience.id);

  const events = app.debugRepo.listRecent('experience_logged', 20);
  assert.ok(events.length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('experience repeatMistakeSignal requires explicit repeat cue', () => {
  const databasePath = createTempDbPath('experience-repeat-gating');
  const app = initializeEverMemory({ databasePath });

  const experience = app.experienceService.log({
    sessionId: 'session-exp-2',
    messageId: 'msg-exp-2',
    inputText: '更正一下，先确认再执行。',
    actionSummary: '直接部署生产',
    outcomeSummary: '用户要求先确认',
  });

  assert.equal(experience.indicators.userCorrection, true);
  assert.equal(experience.indicators.externalActionRisk, true);
  assert.equal(experience.indicators.repeatMistakeSignal, false);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('experience repeatMistakeSignal turns true when repeat cue is present', () => {
  const databasePath = createTempDbPath('experience-repeat-cue');
  const app = initializeEverMemory({ databasePath });

  const experience = app.experienceService.log({
    sessionId: 'session-exp-3',
    messageId: 'msg-exp-3',
    inputText: '又要更正一次，先确认再执行。',
    actionSummary: '直接部署生产',
    outcomeSummary: '还是先确认',
  });

  assert.equal(experience.indicators.userCorrection, true);
  assert.equal(experience.indicators.externalActionRisk, true);
  assert.equal(experience.indicators.repeatMistakeSignal, true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

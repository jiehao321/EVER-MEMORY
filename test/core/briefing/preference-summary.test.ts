import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import { createTempDbPath } from '../../helpers.js';

test('briefing appends profile preference summary within identity section', () => {
  const databasePath = createTempDbPath('briefing-preference-summary');
  const app = initializeEverMemory({ databasePath });

  app.profileRepo.upsert({
    userId: 'u-briefing-preference',
    updatedAt: '2026-03-15T00:00:00.000Z',
    stable: {
      explicitPreferences: {},
      explicitConstraints: [],
    },
    derived: {
      communicationStyle: {
        tendency: 'concise_direct',
        confidence: 0.9,
        evidenceRefs: ['m-1'],
        source: 'derived_inference',
        guardrail: 'weak_hint',
        canonical: false,
      },
      likelyInterests: [
        {
          value: 'TypeScript',
          confidence: 0.9,
          evidenceRefs: ['m-2'],
          source: 'derived_inference',
          guardrail: 'weak_hint',
          canonical: false,
        },
      ],
      workPatterns: [
        {
          value: 'stepwise_planning',
          confidence: 0.8,
          evidenceRefs: ['m-3'],
          source: 'derived_inference',
          guardrail: 'weak_hint',
          canonical: false,
        },
      ],
    },
    behaviorHints: [],
  });

  const briefing = app.briefingService.build({ userId: 'u-briefing-preference' });

  assert.ok(briefing.sections.identity.includes('沟通风格：简洁直接'));
  assert.ok(briefing.sections.identity.includes('工作习惯：逐步确认'));
  assert.ok(briefing.sections.identity.some((line) => line.startsWith('偏好推断：')));

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('briefing tracks memory ids used to build the boot briefing', () => {
  const databasePath = createTempDbPath('briefing-memory-ids');
  const app = initializeEverMemory({ databasePath });
  const scope = { userId: 'u-briefing-memory-ids', project: 'apollo' };

  const identity = app.evermemoryStore({
    content: '你是 Alex 的长期协作助手',
    type: 'identity',
    scope,
    source: { kind: 'manual', actor: 'user' },
  }).memory;
  const constraint = app.evermemoryStore({
    content: '关键约束：发布前先过质量门禁。',
    type: 'constraint',
    scope,
    source: { kind: 'manual', actor: 'user' },
  }).memory;
  const decision = app.evermemoryStore({
    content: '最近决策：先补回归再放量。',
    type: 'decision',
    scope,
    source: { kind: 'manual', actor: 'user' },
  }).memory;
  const commitment = app.evermemoryStore({
    content: '下一步：整理发布回滚清单。',
    type: 'commitment',
    scope,
    source: { kind: 'manual', actor: 'user' },
  }).memory;
  const project = app.evermemoryStore({
    content: '项目状态：当前推进 briefing 去重链路。',
    type: 'project',
    scope,
    source: { kind: 'manual', actor: 'user' },
  }).memory;

  const briefing = app.briefingService.build(scope);

  assert.deepEqual(
    new Set(briefing.memoryIds),
    new Set([identity?.id, constraint?.id, decision?.id, commitment?.id, project?.id].filter(Boolean)),
  );

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

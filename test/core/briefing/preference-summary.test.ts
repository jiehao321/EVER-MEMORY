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

import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../../../src/index.js';
import { SmartnessMetricsService } from '../../../src/core/analytics/smartnessMetrics.js';
import type { MemoryItem } from '../../../src/types.js';
import { createTempDbPath } from '../../helpers.js';

function createMemory(input: {
  type?: MemoryItem['type'];
  tags?: string[];
  createdAt: string;
  userId?: string;
}): MemoryItem {
  return {
    id: randomUUID(),
    content: `memory ${input.createdAt}`,
    type: input.type ?? 'fact',
    lifecycle: 'semantic',
    source: { kind: 'manual', actor: 'system' },
    scope: { userId: input.userId ?? 'u-smartness-1' },
    scores: { confidence: 0.8, importance: 0.8, explicitness: 0.8 },
    timestamps: { createdAt: input.createdAt, updatedAt: input.createdAt },
    state: { active: true, archived: false },
    evidence: { references: [] },
    tags: input.tags ?? [],
    relatedEntities: [],
    sourceGrade: 'primary',
    stats: { accessCount: 0, retrievalCount: 0 },
  };
}

function isoDaysAgo(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function insertRulesLoaded(app: ReturnType<typeof initializeEverMemory>, createdAt: string, rules: number): void {
  app.database.connection.prepare(
    `INSERT INTO debug_events (id, created_at, kind, entity_id, payload_json)
     VALUES (?, ?, 'rules_loaded', 'entity-1', ?)`,
  ).run(randomUUID(), createdAt, JSON.stringify({ rules }));
}

test('smartness metrics return zero scores for an empty database', async () => {
  const databasePath = createTempDbPath('smartness-empty');
  const app = initializeEverMemory({ databasePath });

  try {
    const service = new SmartnessMetricsService(app.memoryRepo, app.debugRepo);
    const summary = await service.compute('u-smartness-1');

    assert.equal(summary.overall, 0);
    assert.equal(summary.dimensions.length, 5);
    assert.ok(summary.dimensions.every((item) => item.score === 0));
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('smartness metrics cap memory depth at full score for 100 memories', async () => {
  const databasePath = createTempDbPath('smartness-depth');
  const app = initializeEverMemory({ databasePath });

  try {
    for (let index = 0; index < 100; index += 1) {
      app.memoryRepo.insert(createMemory({ createdAt: `2026-03-${String((index % 9) + 1).padStart(2, '0')}T00:00:00.000Z` }));
    }

    const service = new SmartnessMetricsService(app.memoryRepo, app.debugRepo);
    const summary = await service.compute('u-smartness-1');
    assert.equal(summary.dimensions.find((item) => item.name === '记忆深度')?.score, 1);
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('smartness metrics give full diversity score when all 7 kinds exist', async () => {
  const databasePath = createTempDbPath('smartness-diversity');
  const app = initializeEverMemory({ databasePath });

  try {
    const kinds = [
      { type: 'project', tags: ['project_state'] },
      { type: 'decision', tags: ['decision'] },
      { type: 'constraint', tags: ['explicit_constraint'] },
      { type: 'preference', tags: ['user_preference'] },
      { type: 'commitment', tags: ['next_step'] },
      { type: 'constraint', tags: ['lesson'] },
      { type: 'constraint', tags: ['warning'] },
    ] as const;

    for (const [index, kind] of kinds.entries()) {
      app.memoryRepo.insert(createMemory({
        type: kind.type,
        tags: [...kind.tags],
        createdAt: `2026-03-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      }));
    }

    const service = new SmartnessMetricsService(app.memoryRepo, app.debugRepo);
    const summary = await service.compute('u-smartness-1');
    assert.equal(summary.dimensions.find((item) => item.name === '记忆多样性')?.score, 1);
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

test('smartness metrics compute trend from recent 7 days versus previous 7 days', async () => {
  const databasePath = createTempDbPath('smartness-trend');
  const app = initializeEverMemory({ databasePath });

  try {
    app.memoryRepo.insert(createMemory({ createdAt: isoDaysAgo(1) }));
    app.memoryRepo.insert(createMemory({ createdAt: isoDaysAgo(2) }));
    app.memoryRepo.insert(createMemory({ createdAt: isoDaysAgo(3) }));
    app.memoryRepo.insert(createMemory({ createdAt: isoDaysAgo(10) }));
    insertRulesLoaded(app, isoDaysAgo(1), 6);
    insertRulesLoaded(app, isoDaysAgo(10), 2);

    const service = new SmartnessMetricsService(app.memoryRepo, app.debugRepo);
    const summary = await service.compute('u-smartness-1');

    assert.equal(summary.dimensions.find((item) => item.name === '记忆深度')?.trend, 'up');
    assert.equal(summary.dimensions.find((item) => item.name === '行为规则成熟度')?.trend, 'up');
  } finally {
    app.database.connection.close();
    rmSync(databasePath, { force: true });
  }
});

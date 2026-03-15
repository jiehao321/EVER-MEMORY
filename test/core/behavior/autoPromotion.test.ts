import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../../../src/index.js';
import type { ReflectionRecord } from '../../../src/types.js';
import { autoPromoteRules } from '../../../src/core/behavior/autoPromotion.js';
import { createTempDbPath } from '../../helpers.js';

function nowIso(): string {
  return new Date().toISOString();
}

function makeReflection(
  id: string,
  confidence: number,
  recurrenceCount: number,
  candidateRule = `高风险动作先确认后执行，并记录回滚方案 ${id}。`,
): ReflectionRecord {
  return {
    id,
    createdAt: nowIso(),
    trigger: {
      kind: 'manual-review',
      experienceIds: [randomUUID()],
    },
    analysis: {
      category: 'general-review',
      summary: `summary-${id}`,
      nextTimeRecommendation: candidateRule,
    },
    evidence: {
      refs: [`msg-${id}`],
      confidence,
      recurrenceCount,
    },
    candidateRules: [candidateRule],
    state: {
      promoted: false,
      rejected: false,
    },
  };
}

test('auto promotion promotes rules above threshold and tags them', async () => {
  const databasePath = createTempDbPath('auto-promotion-pass');
  const app = initializeEverMemory({ databasePath });
  const reflection = makeReflection('reflection-auto-1', 0.9, 2, '高风险动作前先确认。');
  app.reflectionRepo.insert(reflection);

  const result = await autoPromoteRules(app.behaviorService);

  assert.equal(result.promoted, 1);
  assert.equal(result.skipped, 0);
  const promoted = app.behaviorRepo.listRecent(5)[0];
  assert.ok(promoted);
  assert.equal(promoted?.trace?.promotedFromReflectionId, reflection.id);
  assert.equal(promoted?.tags?.includes('auto_promoted'), true);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('auto promotion skips reflections below confidence threshold', async () => {
  const databasePath = createTempDbPath('auto-promotion-skip');
  const app = initializeEverMemory({ databasePath });
  app.reflectionRepo.insert(makeReflection('reflection-auto-2', 0.84, 3, '先确认边界条件。'));

  const result = await autoPromoteRules(app.behaviorService);

  assert.equal(result.promoted, 0);
  assert.equal(result.skipped, 1);
  assert.equal(app.behaviorRepo.listRecent(5).length, 0);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('auto promotion enforces maxPerSession limit', async () => {
  const databasePath = createTempDbPath('auto-promotion-limit');
  const app = initializeEverMemory({ databasePath });
  const statements = [
    '高风险部署前先确认窗口和回滚方案。',
    '执行数据库迁移前先确认备份与恢复路径。',
    '修改线上配置前先复述影响范围并等待确认。',
    '删除历史数据前先导出快照并确认保留周期。',
    '调用外部 API 写操作前先确认幂等与重试策略。',
  ];

  for (let index = 0; index < statements.length; index += 1) {
    app.reflectionRepo.insert(makeReflection(`reflection-auto-limit-${index}`, 0.9, 2, statements[index]));
  }

  const result = await autoPromoteRules(app.behaviorService, { maxPerSession: 3 });

  assert.equal(result.promoted, 3);
  assert.equal(result.skipped, 0);
  assert.equal(app.behaviorRepo.listRecent(10).length, 3);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

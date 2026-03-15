import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../../../src/index.js';
import type { ReflectionRecord, SessionEndInput } from '../../../src/types.js';
import {
  extractLearningInsights,
  storeInsights,
  type SessionContext,
} from '../../../src/core/memory/activeLearning.js';
import { createTempDbPath } from '../../helpers.js';

function makeInput(input: Partial<SessionEndInput> = {}): SessionEndInput {
  return {
    sessionId: 'session-learning-1',
    inputText: input.inputText,
    actionSummary: input.actionSummary,
    outcomeSummary: input.outcomeSummary,
    scope: input.scope,
    evidenceRefs: input.evidenceRefs,
  };
}

function makeReflection(input: Partial<ReflectionRecord> = {}): ReflectionRecord {
  return {
    id: input.id ?? 'reflection-learning-1',
    createdAt: input.createdAt ?? new Date().toISOString(),
    trigger: input.trigger ?? { kind: 'manual-review', experienceIds: [] },
    analysis: input.analysis ?? {
      category: 'general-review',
      summary: 'summary',
      nextTimeRecommendation: '下次先对齐目标后再继续。',
    },
    evidence: input.evidence ?? {
      refs: ['msg-learning-1'],
      confidence: 0.9,
      recurrenceCount: 1,
    },
    candidateRules: input.candidateRules ?? [],
    state: input.state ?? { promoted: false, rejected: false },
  };
}

test('correction intent extracts lesson insight', async () => {
  const insights = await extractLearningInsights(
    makeInput({
      inputText: '更正一下，不要直接改数据库，先给出迁移方案。',
      actionSummary: '直接准备修改数据库结构',
      outcomeSummary: '用户要求先说明迁移风险',
    }),
    {
      intent: {
        id: 'intent-learning-1',
        sessionId: 'session-learning-1',
        createdAt: new Date().toISOString(),
        rawText: '更正一下，不要直接改数据库，先给出迁移方案。',
        intent: {
          type: 'correction',
          confidence: 0.95,
        },
        signals: {
          urgency: 'medium',
          emotionalTone: 'neutral',
          actionNeed: 'confirmation',
          memoryNeed: 'targeted',
          preferenceRelevance: 0.7,
          correctionSignal: 0.95,
        },
        entities: [],
        retrievalHints: {
          preferredTypes: [],
          preferredScopes: [],
          preferredTimeBias: 'recent',
        },
      },
    } satisfies SessionContext,
  );

  assert.equal(insights.some((item) => item.kind === 'lesson' && item.trigger === 'correction'), true);
  assert.equal(insights[0]?.content.includes('踩坑'), true);
  assert.equal(insights[0]?.evidenceText.includes('更正一下'), true);
});

test('warning keywords extract warning insight', async () => {
  const insights = await extractLearningInsights(
    makeInput({
      inputText: '注意：不要在生产环境直接执行这个脚本。',
      outcomeSummary: 'warning: production risk',
    }),
    {},
  );

  assert.equal(insights.some((item) => item.kind === 'warning' && item.trigger === 'explicit'), true);
  assert.equal(insights[0]?.content.includes('注意') || insights[0]?.content.includes('警告'), true);
});

test('reflection recommendation extracts insight', async () => {
  const insights = await extractLearningInsights(
    makeInput({
      inputText: '这次先跳过细节。',
    }),
    {
      reflection: makeReflection({
        analysis: {
          category: 'clarity',
          summary: 'Need better clarification',
          nextTimeRecommendation: '下次先澄清验收标准，再开始实现。',
        },
      }),
    },
  );

  assert.equal(insights.some((item) => item.kind === 'insight' && item.trigger === 'explicit'), true);
  assert.equal(insights[0]?.content.includes('下次先澄清验收标准'), true);
});

test('storeInsights skips semantic duplicate content', async () => {
  const databasePath = createTempDbPath('active-learning-store');
  const app = initializeEverMemory({ databasePath });
  const scope = { userId: 'user-learning-1', project: 'evermemory' };

  app.memoryService.store({
    content: '[踩坑] 踩坑：直接改数据库结构容易破坏兼容性；修正：先设计迁移并验证回滚方案',
    type: 'constraint',
    lifecycle: 'semantic',
    scope,
    source: {
      kind: 'reflection_derived',
      actor: 'system',
      sessionId: 'session-learning-1',
    },
    tags: ['learning_insight', 'lesson'],
  });
  app.semanticRepo.upsertFromMemory(app.memoryRepo.listRecent(scope, 1)[0]!);

  const result = await storeInsights(
    [{
      content: '踩坑：直接改数据库结构容易破坏兼容性；修正：先设计迁移并验证回滚方案',
      kind: 'lesson',
      confidence: 0.92,
      trigger: 'correction',
      evidenceText: '更正一下，不要直接改数据库，先给出迁移方案。',
    }],
    scope,
    app.memoryService,
    app.semanticRepo,
  );

  assert.equal(result.storedCount, 0);
  assert.equal(result.skippedCount, 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

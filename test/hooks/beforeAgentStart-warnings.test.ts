import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticPreload } from '../../src/hooks/beforeAgentStart.js';
import { embeddingManager } from '../../src/embedding/manager.js';
import type { EmbeddingVector } from '../../src/embedding/provider.js';
import type { BehaviorRule, MemoryItem, MemoryScope } from '../../src/types.js';

function createMemory(
  id: string,
  content: string,
  scope: MemoryScope,
  tags: string[] = [],
): MemoryItem {
  return {
    id,
    content,
    type: 'constraint',
    lifecycle: 'semantic',
    source: { kind: 'test' },
    scope,
    scores: {
      confidence: 1,
      importance: 0.5,
      explicitness: 1,
    },
    timestamps: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    state: {
      active: true,
      archived: false,
    },
    evidence: {
      references: [],
    },
    tags,
    relatedEntities: [],
    sourceGrade: 'primary',
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
  };
}

function createRule(statement: string): BehaviorRule {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: statement,
    statement,
    createdAt: now,
    updatedAt: now,
    appliesTo: {
      userId: 'u-1',
      contexts: [],
      intentTypes: [],
    },
    category: 'safety',
    priority: 80,
    evidence: {
      reflectionIds: [],
      memoryIds: [],
      confidence: 0.9,
      recurrenceCount: 1,
    },
    lifecycle: {
      level: 'baseline',
      maturity: 'emerging',
      applyCount: 0,
      contradictionCount: 0,
      stale: false,
      staleness: 'fresh',
      decayScore: 0,
    },
    state: {
      active: true,
      deprecated: false,
      frozen: false,
    },
    tags: [],
  };
}

test('semanticPreload prioritizes warning memories and returns warning summaries', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([0.1, 0.9]),
    dimensions: 2,
  };

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await semanticPreload(
      '部署前先确认回滚方案',
      { userId: 'u-1', project: 'evermemory' },
      {
        searchByCosine: async () => [
          { memoryId: 'm-1', score: 0.81 },
          { memoryId: 'm-2', score: 0.92 },
          { memoryId: 'm-3', score: 0.74 },
        ],
      } as never,
      {
        findById: (id: string) => {
          if (id === 'm-1') {
            return createMemory(id, '发布前记录阶段计划', { userId: 'u-1', project: 'evermemory' });
          }
          if (id === 'm-2') {
            return createMemory(
              id,
              '[警告] 发布前必须确认回滚方案，避免直接上线',
              { userId: 'u-1', project: 'evermemory' },
              ['learning_insight', 'warning'],
            );
          }
          if (id === 'm-3') {
            return createMemory(
              id,
              '[踩坑] 直接上线导致排查成本上升',
              { userId: 'u-1', project: 'evermemory' },
              ['learning_insight', 'lesson'],
            );
          }
          return null;
        },
      } as never,
      3,
      0.35,
      [
        createRule('涉及发布或部署时先确认回滚方案'),
        createRule('回复保持简洁'),
      ],
    );

    assert.deepEqual(result.ids, ['m-2', 'm-3', 'm-1']);
    assert.equal(result.warnings.length, 2);
    assert.match(result.warnings[0] ?? '', /回滚方案/);
    assert.match(result.warnings[1] ?? '', /直接上线/);
    assert.deepEqual(result.relevantRules, ['涉及发布或部署时先确认回滚方案']);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

test('semanticPreload returns empty warnings when no lesson or warning memories match', async () => {
  const originalIsReady = embeddingManager.isReady;
  const originalEmbed = embeddingManager.embed;
  const vector: EmbeddingVector = {
    values: new Float32Array([1, 2]),
    dimensions: 2,
  };

  (embeddingManager.isReady as typeof embeddingManager.isReady) = () => true;
  (embeddingManager.embed as typeof embeddingManager.embed) = async () => vector;

  try {
    const result = await semanticPreload(
      '整理阶段计划',
      { userId: 'u-1', project: 'evermemory' },
      {
        searchByCosine: async () => [{ memoryId: 'm-1', score: 0.88 }],
      } as never,
      {
        findById: () => createMemory('m-1', '阶段计划已经更新', { userId: 'u-1', project: 'evermemory' }),
      } as never,
      3,
      0.35,
      [createRule('部署前先确认回滚方案')],
    );

    assert.deepEqual(result.ids, ['m-1']);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(result.relevantRules, []);
  } finally {
    embeddingManager.isReady = originalIsReady;
    embeddingManager.embed = originalEmbed;
  }
});

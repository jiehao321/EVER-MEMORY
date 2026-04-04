import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ClockPort } from '../../src/core/butler/ports/clock.js';
import type { HostPort } from '../../src/core/butler/ports/host.js';
import type { MemoryQueryPort, MemorySnapshot } from '../../src/core/butler/ports/memory.js';
import type { GoalStore, InsightStore } from '../../src/core/butler/ports/storage.js';
import { KnowledgeGapDetector, KnowledgeSearchService, QuestionPlanner } from '../../src/core/butler/intelligence/index.js';
import type { KnowledgeGap } from '../../src/core/butler/intelligence/types.js';

function createClock(initialNow: number): ClockPort & { set(now: number): void } {
  let now = initialNow;
  return {
    now: () => now,
    isoNow: () => new Date(now).toISOString(),
    set(value: number) {
      now = value;
    },
  };
}

function createMemory(memories: MemorySnapshot[]): MemoryQueryPort {
  return {
    search(query) {
      return memories.filter((memory) => {
        if (query.query && !memory.content.includes(query.query) && !memory.tags.includes(query.query)) {
          return false;
        }
        if (query.activeOnly === true && memory.tags.includes('inactive')) {
          return false;
        }
        if (query.scope?.project && memory.scope?.project !== query.scope.project) {
          return false;
        }
        return true;
      }).slice(0, query.limit ?? memories.length);
    },
  };
}

function createInsights(commitments: Array<{ title: string; importance: number; createdAt: string }>): InsightStore {
  return {
    insert: () => 'unused',
    findById: () => null,
    findByKind: (kind) => (
      kind === 'commitment'
        ? commitments.map((item, index) => ({
          id: `insight-${index + 1}`,
          kind: 'commitment' as const,
          title: item.title,
          summary: item.title,
          confidence: 0.8,
          importance: item.importance,
          surfacedCount: 0,
          createdAt: item.createdAt,
        }))
        : []
    ),
    findFresh: () => [],
    markSurfaced: () => undefined,
    deleteExpired: () => 0,
  };
}

function createHost(responses: Array<string | null>, externalResults?: Array<{ content: string; source: string; relevance: number }>): HostPort {
  return {
    injectContext: () => undefined,
    askUser: async () => responses.shift() ?? null,
    searchKnowledge: async () => externalResults ?? [],
  };
}

describe('KnowledgeGapDetector', () => {
  it('detects stale memories, unresolved commitments, and contradiction gaps in descending importance', () => {
    const now = Date.parse('2026-04-04T00:00:00.000Z');
    const detector = new KnowledgeGapDetector(
      createMemory([
        {
          id: 'memory-stale',
          content: 'The current release target is April and should stay locked.',
          type: 'fact',
          tags: [],
          scores: { confidence: 0.9, importance: 0.9 },
          scope: { project: 'evermemory' },
          timestamps: {
            createdAt: '2026-03-01T00:00:00.000Z',
            updatedAt: '2026-03-10T00:00:00.000Z',
          },
        },
        {
          id: 'memory-contradiction',
          content: 'Phase 2 owner is unclear between storage and runtime.',
          type: 'fact',
          tags: ['contradiction_pending'],
          scores: { confidence: 0.7, importance: 0.4 },
          scope: { project: 'evermemory' },
          timestamps: {
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
        },
      ]),
      createInsights([
        {
          title: 'Finish Butler Phase 2 rollout',
          importance: 0.8,
          createdAt: '2026-03-20T00:00:00.000Z',
        },
      ]),
      undefined as GoalStore | undefined,
      createClock(now),
    );

    const gaps = detector.detectGaps({ project: 'evermemory' });

    assert.deepEqual(gaps.map((gap) => gap.type), [
      'unresolved_contradiction',
      'stale',
      'incomplete',
    ]);
    assert.equal(gaps[0]?.memoryIds?.[0], 'memory-contradiction');
    assert.match(gaps[1]?.description ?? '', /not updated for/i);
    assert.equal(gaps[2]?.suggestedQuestion, 'What\'s the status of: "Finish Butler Phase 2 rollout"?');
  });
});

describe('QuestionPlanner', () => {
  it('plans questions, enforces cooldown and daily/session limits, and records outcomes', async () => {
    const clock = createClock(Date.parse('2026-04-04T09:00:00.000Z'));
    const host = createHost(['Yes', null]);
    const planner = new QuestionPlanner(
      {} as never,
      host,
      clock,
      undefined,
      { maxPerSession: 2, maxPerDay: 2, cooldownMinutes: 30 },
    );
    const gap: KnowledgeGap = {
      type: 'stale',
      description: 'A key memory looks stale.',
      suggestedQuestion: 'Is this still correct?',
      importance: 0.7,
    };

    const first = planner.planQuestion(gap);
    assert.ok(first);

    const firstOutcome = await planner.askQuestion(first);
    assert.equal(firstOutcome.status, 'answered');
    assert.equal(planner.getSessionQuestionCount(), 1);
    assert.equal(planner.getDailyQuestionCount(), 1);
    assert.equal(planner.planQuestion(gap), null);

    clock.set(Date.parse('2026-04-04T09:31:00.000Z'));
    const second = planner.planQuestion(gap);
    assert.ok(second);

    const secondOutcome = await planner.askQuestion(second);
    assert.equal(secondOutcome.status, 'dismissed');
    assert.equal(planner.getSessionQuestionCount(), 2);
    assert.equal(planner.getDailyQuestionCount(), 2);

    planner.resetSession();
    clock.set(Date.parse('2026-04-04T10:05:00.000Z'));
    assert.equal(planner.planQuestion(gap), null);
  });
});

describe('KnowledgeSearchService', () => {
  it('combines internal memory matches with host knowledge results and sorts by relevance', async () => {
    const service = new KnowledgeSearchService(
      createHost([], [{ content: 'External reference', source: 'docs', relevance: 0.8 }]),
      createMemory([
        {
          id: 'memory-1',
          content: 'Internal high confidence note',
          type: 'fact',
          tags: [],
          scores: { confidence: 0.9, importance: 0.95 },
          scope: { project: 'evermemory' },
          timestamps: {
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
        },
        {
          id: 'memory-2',
          content: 'Lower relevance note',
          type: 'fact',
          tags: [],
          scores: { confidence: 0.6, importance: 0.4 },
          scope: { project: 'evermemory' },
          timestamps: {
            createdAt: '2026-04-01T00:00:00.000Z',
            updatedAt: '2026-04-01T00:00:00.000Z',
          },
        },
      ]),
      createClock(Date.parse('2026-04-04T00:00:00.000Z')),
    );

    const results = await service.search('note', { scope: { project: 'evermemory' } });

    assert.deepEqual(results.map((result) => result.source), ['memory', 'docs', 'memory']);
    assert.equal(results[0]?.content, 'Internal high confidence note');
  });
});

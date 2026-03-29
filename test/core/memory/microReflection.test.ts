import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type Database from 'better-sqlite3';
import { MicroReflectionService } from '../../../src/core/memory/microReflection.js';
import { FeedbackRepository } from '../../../src/storage/feedbackRepo.js';
import type { RecallResult } from '../../../src/types/memory.js';
import { createInMemoryDb } from '../../storage/helpers.js';

describe('MicroReflectionService', () => {
  let db: Database.Database;
  let feedbackRepo: FeedbackRepository;
  let service: MicroReflectionService;

  beforeEach(() => {
    db = createInMemoryDb();
    feedbackRepo = new FeedbackRepository(db);
    service = new MicroReflectionService(feedbackRepo);
  });

  afterEach(() => {
    db.close();
  });

  it('persists top factors from recall metadata into feedback records', () => {
    const result: RecallResult = {
      items: [
        {
          id: 'memory-1',
          content: 'quality gate before release',
          type: 'fact',
          lifecycle: 'semantic',
          source: { kind: 'test' },
          scope: {},
          scores: { confidence: 0.8, importance: 0.7, explicitness: 1 },
          timestamps: {
            createdAt: '2026-03-21T00:00:00.000Z',
            updatedAt: '2026-03-21T00:00:00.000Z',
          },
          state: { active: true, archived: false },
          evidence: {},
          tags: [],
          relatedEntities: [],
          stats: { accessCount: 0, retrievalCount: 0 },
          sourceGrade: 'primary',
          metadata: {
            semanticScore: 0.62,
            topFactors: [
              { name: 'keyword', value: 0.8 },
              { name: 'base', value: 0.2 },
            ],
          },
        },
      ],
      total: 1,
      limit: 5,
      strategyUsed: 'hybrid',
    };

    service.recordRecall('session-1', 'quality gate', result);

    const feedback = feedbackRepo.findBySession('session-1');
    assert.equal(feedback.length, 1);
    assert.deepEqual(feedback[0]?.topFactors, [
      { name: 'keyword', value: 0.8 },
      { name: 'base', value: 0.2 },
    ]);
  });
});

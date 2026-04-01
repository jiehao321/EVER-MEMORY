import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryReview } from '../../src/tools/review.js';
import { MemoryArchiveService } from '../../src/core/memory/archive.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { createInMemoryDb, buildBehaviorRule, buildMemory } from '../storage/helpers.js';
import type { BehaviorRuleReviewRecord, MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const debugRepo = new DebugRepository(db);
  const archiveService = new MemoryArchiveService(memoryRepo, debugRepo);
  return { db, memoryRepo, debugRepo, archiveService };
}

const scope: MemoryScope = { userId: 'u-review-1', project: 'proj-review' };

function buildRuleReview(): BehaviorRuleReviewRecord {
  const rule = buildBehaviorRule({
    statement: 'Require approval before restoring archived memories.',
  });
  return {
    rule,
    sourceTrace: {
      reviewSourceRefs: ['reflection-1'],
    },
  };
}

test('review with archived candidates returns review data and debug event', () => {
  const { archiveService, memoryRepo, debugRepo } = makeFixture();
  const archived = buildMemory({
    content: 'Archived project summary',
    lifecycle: 'archive',
    scope,
    state: {
      active: false,
      archived: true,
    },
  });
  memoryRepo.insert(archived);

  const behaviorService = {
    reviewRule(ruleId: string) {
      assert.equal(ruleId, 'rule-1');
      return buildRuleReview();
    },
  };

  const result = evermemoryReview(archiveService, behaviorService as never, {
    scope,
    ruleId: 'rule-1',
  });

  const events = debugRepo.listRecent('memory_restore_reviewed', 5);
  assert.equal(result.total, 1);
  assert.equal(result.candidates[0]?.id, archived.id);
  assert.equal(result.candidates[0]?.restoreEligible, true);
  assert.equal(result.ruleReview?.rule.statement, 'Require approval before restoring archived memories.');
  assert.equal(events[0]?.kind, 'memory_restore_reviewed');
});

test('review with no archived memories returns empty result', () => {
  const { archiveService } = makeFixture();
  const behaviorService = {
    reviewRule() {
      return null;
    },
  };

  const result = evermemoryReview(archiveService, behaviorService as never, { scope });

  assert.equal(result.total, 0);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.ruleReview, undefined);
});

test('review filters out superseded memories by default', () => {
  const { archiveService, memoryRepo } = makeFixture();
  memoryRepo.insert(buildMemory({
    content: 'Superseded archived item',
    lifecycle: 'archive',
    scope,
    state: {
      active: false,
      archived: true,
      supersededBy: 'newer-id',
    },
  }));

  const result = evermemoryReview(archiveService, { reviewRule: () => null } as never, { scope });

  assert.equal(result.total, 0);
  assert.deepEqual(result.candidates, []);
});

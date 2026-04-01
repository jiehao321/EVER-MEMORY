import test from 'node:test';
import assert from 'node:assert/strict';
import { evermemoryBriefing } from '../../src/tools/briefing.js';
import { BriefingService } from '../../src/core/briefing/service.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { BriefingRepository } from '../../src/storage/briefingRepo.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';
import type { MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const briefingRepo = new BriefingRepository(db);
  const briefingService = new BriefingService(memoryRepo, briefingRepo);
  return { db, memoryRepo, briefingRepo, briefingService };
}

const scope: MemoryScope = { userId: 'u-briefing-1', project: 'proj-briefing' };

test('generate briefing returns sections', () => {
  const { briefingService, memoryRepo } = makeFixture();
  memoryRepo.insert(buildMemory({ content: 'User prefers concise answers', type: 'identity', scope }));
  memoryRepo.insert(buildMemory({ content: 'Do not change deploy scripts without approval', type: 'constraint', scope }));
  memoryRepo.insert(buildMemory({ content: 'Current project is EverMemory', type: 'project', scope }));
  memoryRepo.insert(buildMemory({ content: 'Decided to add archive review tests', type: 'decision', scope }));

  const result = evermemoryBriefing(briefingService, {
    scope,
    sessionId: 'session-briefing-1',
  });

  assert.equal(result.sessionId, 'session-briefing-1');
  assert.ok(result.sections.constraints.length > 0);
  assert.ok(result.sections.recentContinuity.length > 0);
  assert.ok(result.sections.activeProjects.length > 0);
  assert.equal(result.quality?.qualityLabel, 'excellent');
  assert.ok(typeof result.tokenTarget === 'number');
});

test('empty memory set returns minimal briefing', () => {
  const { briefingService } = makeFixture();

  const result = evermemoryBriefing(briefingService, { scope });

  assert.deepEqual(result.sections, {
    identity: [],
    constraints: [],
    recentContinuity: [],
    activeProjects: [],
  });
  assert.equal(result.quality?.qualityLabel, 'low');
  assert.match(result.quality?.nudge ?? '', /evermemory_store/);
  assert.equal(result.continuityScore?.label, 'empty');
});

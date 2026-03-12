import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('evermemory_review and evermemory_restore provide archive review/apply baseline', () => {
  const databasePath = createTempDbPath('archive-restore');
  const app = initializeEverMemory({ databasePath });

  const active = app.evermemoryStore({
    content: '当前有效约束：发布前先做回滚演练。',
    type: 'constraint',
    scope: { userId: 'u-restore-1' },
  });
  assert.equal(active.accepted, true);
  assert.ok(active.memory);

  const archived = app.memoryService.store({
    content: '已归档记录：历史执行摘要。',
    type: 'summary',
    lifecycle: 'archive',
    source: { kind: 'manual', actor: 'system' },
    scope: { userId: 'u-restore-1' },
    active: false,
    archived: true,
  });
  assert.equal(archived.accepted, true);
  assert.ok(archived.memory);

  const supersededArchived = app.memoryService.store({
    content: '已归档且被替代：旧执行策略。',
    type: 'decision',
    lifecycle: 'archive',
    source: { kind: 'manual', actor: 'system' },
    scope: { userId: 'u-restore-1' },
    active: false,
    archived: true,
    supersededBy: active.memory?.id,
  });
  assert.equal(supersededArchived.accepted, true);
  assert.ok(supersededArchived.memory);

  const reviewDefault = app.evermemoryReview({
    scope: { userId: 'u-restore-1' },
  });
  assert.equal(reviewDefault.total, 1);
  assert.equal(reviewDefault.candidates[0]?.id, archived.memory?.id);
  assert.equal(reviewDefault.candidates[0]?.restoreEligible, true);

  const reviewWithSuperseded = app.evermemoryReview({
    scope: { userId: 'u-restore-1' },
    includeSuperseded: true,
  });
  assert.equal(reviewWithSuperseded.total, 2);
  assert.ok(reviewWithSuperseded.candidates.some((item) => item.reason === 'superseded_by_newer_memory'));

  const restoreReview = app.evermemoryRestore({
    ids: [archived.memory?.id ?? ''],
  });
  assert.equal(restoreReview.mode, 'review');
  assert.equal(restoreReview.applied, false);
  assert.equal(restoreReview.restorable, 1);
  assert.equal(restoreReview.restored, 0);
  const archivedBeforeApply = app.memoryRepo.findById(archived.memory?.id ?? '');
  assert.equal(archivedBeforeApply?.state.archived, true);

  const restoreWithoutApproval = app.evermemoryRestore({
    ids: [archived.memory?.id ?? ''],
    mode: 'apply',
  });
  assert.equal(restoreWithoutApproval.applied, false);
  assert.ok(restoreWithoutApproval.rejected.some((item) => item.reason === 'approval_required_for_apply'));

  const applyRestore = app.evermemoryRestore({
    ids: [archived.memory?.id ?? ''],
    mode: 'apply',
    approved: true,
    targetLifecycle: 'semantic',
  });
  assert.equal(applyRestore.applied, true);
  assert.equal(applyRestore.restored, 1);
  const restored = app.memoryRepo.findById(archived.memory?.id ?? '');
  assert.equal(restored?.state.archived, false);
  assert.equal(restored?.state.active, true);
  assert.equal(restored?.lifecycle, 'semantic');

  const supersededBlocked = app.evermemoryRestore({
    ids: [supersededArchived.memory?.id ?? ''],
    mode: 'apply',
    approved: true,
  });
  assert.equal(supersededBlocked.applied, true);
  assert.equal(supersededBlocked.restored, 0);
  assert.ok(supersededBlocked.rejected.some((item) => item.reason === 'superseded_requires_allow_superseded'));

  const supersededAllowed = app.evermemoryRestore({
    ids: [supersededArchived.memory?.id ?? ''],
    mode: 'apply',
    approved: true,
    allowSuperseded: true,
  });
  assert.equal(supersededAllowed.applied, true);
  assert.equal(supersededAllowed.restored, 1);
  const restoredSuperseded = app.memoryRepo.findById(supersededArchived.memory?.id ?? '');
  assert.equal(restoredSuperseded?.state.archived, false);
  assert.equal(restoredSuperseded?.state.supersededBy, undefined);

  assert.ok(app.debugRepo.listRecent('memory_restore_reviewed', 10).length >= 1);
  assert.ok(app.debugRepo.listRecent('memory_restore_applied', 10).length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

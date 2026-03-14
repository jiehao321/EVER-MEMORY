import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import type { EverMemorySnapshotV1 } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

test('evermemory_export and evermemory_import provide reviewed import baseline', () => {
  const sourceDb = createTempDbPath('export-source');
  const targetDb = createTempDbPath('import-target');
  const source = initializeEverMemory({ databasePath: sourceDb });
  const target = initializeEverMemory({ databasePath: targetDb });

  source.evermemoryStore({
    content: '部署前先确认回滚方案。',
    type: 'constraint',
    scope: { userId: 'u-transfer-1' },
  });
  source.evermemoryStore({
    content: '请记住：默认中文回复。',
    type: 'preference',
    scope: { userId: 'u-transfer-1' },
    tags: ['language'],
  });
  source.memoryService.store({
    content: '历史归档：这是一条已归档记录。',
    type: 'summary',
    lifecycle: 'archive',
    source: { kind: 'manual', actor: 'system' },
    scope: { userId: 'u-transfer-1' },
    active: false,
    archived: true,
  });

  const activeSnapshot = source.evermemoryExport({
    scope: { userId: 'u-transfer-1' },
    includeArchived: false,
    limit: 10,
  });
  assert.equal(activeSnapshot.snapshot.format, 'evermemory.snapshot.v1');
  assert.equal(activeSnapshot.snapshot.total, 2);

  const fullSnapshot = source.evermemoryExport({
    scope: { userId: 'u-transfer-1' },
    includeArchived: true,
    limit: 10,
  });
  assert.equal(fullSnapshot.snapshot.total, 3);
  assert.ok(source.debugRepo.listRecent('memory_exported', 5).length >= 1);

  const review = target.evermemoryImport({
    snapshot: activeSnapshot.snapshot,
  });
  assert.equal(review.mode, 'review');
  assert.equal(review.applied, false);
  assert.equal(review.toCreate, 2);
  assert.equal(review.imported, 0);
  assert.equal(target.evermemoryStatus({ userId: 'u-transfer-1' }).memoryCount, 0);

  const applyWithoutApproval = target.evermemoryImport({
    snapshot: activeSnapshot.snapshot,
    mode: 'apply',
  });
  assert.equal(applyWithoutApproval.applied, false);
  assert.ok(applyWithoutApproval.rejected.some((item) => item.reason === 'approval_required_for_apply'));
  assert.equal(target.evermemoryStatus({ userId: 'u-transfer-1' }).memoryCount, 0);

  const apply = target.evermemoryImport({
    snapshot: activeSnapshot.snapshot,
    mode: 'apply',
    approved: true,
  });
  assert.equal(apply.applied, true);
  assert.equal(apply.imported, 2);
  assert.equal(apply.updated, 0);
  assert.equal(target.evermemoryStatus({ userId: 'u-transfer-1' }).memoryCount, 2);

  const duplicateApply = target.evermemoryImport({
    snapshot: activeSnapshot.snapshot,
    mode: 'apply',
    approved: true,
  });
  assert.equal(duplicateApply.applied, true);
  assert.ok(duplicateApply.rejected.length >= 2);
  assert.ok(duplicateApply.rejected.every((item) => item.reason === 'duplicate_id'));

  const modifiedSnapshot = JSON.parse(JSON.stringify(activeSnapshot.snapshot)) as EverMemorySnapshotV1;
  modifiedSnapshot.items[0].content = '更新后的导入内容：执行前先确认。';
  const overwriteApply = target.evermemoryImport({
    snapshot: modifiedSnapshot,
    mode: 'apply',
    approved: true,
    allowOverwrite: true,
  });
  assert.equal(overwriteApply.applied, true);
  assert.ok(overwriteApply.updated >= 1);
  const updatedMemory = target.memoryRepo.findById(modifiedSnapshot.items[0].id);
  assert.equal(updatedMemory?.content, '更新后的导入内容：执行前先确认。');
  assert.ok(target.debugRepo.listRecent('memory_import_applied', 5).length >= 1);

  source.database.connection.close();
  target.database.connection.close();
  rmSync(sourceDb, { force: true });
  rmSync(targetDb, { force: true });
});

test('evermemory_import rejected detail highlights invalid confidence score', () => {
  const sourceDb = createTempDbPath('invalid-confidence-source');
  const targetDb = createTempDbPath('invalid-confidence-target');
  const source = initializeEverMemory({ databasePath: sourceDb });
  const target = initializeEverMemory({ databasePath: targetDb });

  source.evermemoryStore({
    content: 'Source memory for invalid confidence test',
    type: 'preference',
    scope: { userId: 'u-invalid-confidence' },
  });

  const snapshot = source.evermemoryExport({
    scope: { userId: 'u-invalid-confidence' },
    includeArchived: false,
  }).snapshot;

  const mutatedSnapshot = JSON.parse(JSON.stringify(snapshot)) as EverMemorySnapshotV1;
  mutatedSnapshot.items[0].scores.confidence = 1.5;

  const review = target.evermemoryImport({
    snapshot: mutatedSnapshot,
  });

  const invalidScoreRejection = review.rejected.find((item) => item.reason === 'invalid_scores');
  assert.ok(invalidScoreRejection, 'expected invalid_scores rejection');
  assert.ok(invalidScoreRejection?.detail?.includes('confidence=1.5'));
  assert.equal(invalidScoreRejection?.hint, 'Clamp confidence to range 0-1');
  assert.equal(review.summary.rejectedByReason.invalid_scores, 1);

  source.database.connection.close();
  target.database.connection.close();
  rmSync(sourceDb, { force: true });
  rmSync(targetDb, { force: true });
});

test('evermemory_import rejected hint guides empty content fixes', () => {
  const sourceDb = createTempDbPath('invalid-content-source');
  const targetDb = createTempDbPath('invalid-content-target');
  const source = initializeEverMemory({ databasePath: sourceDb });
  const target = initializeEverMemory({ databasePath: targetDb });

  source.evermemoryStore({
    content: 'Valid memory before mutation',
    type: 'constraint',
    scope: { userId: 'u-invalid-content' },
  });

  const snapshot = source.evermemoryExport({
    scope: { userId: 'u-invalid-content' },
  }).snapshot;

  const mutatedSnapshot = JSON.parse(JSON.stringify(snapshot)) as EverMemorySnapshotV1;
  mutatedSnapshot.items[0].content = '  ';

  const review = target.evermemoryImport({
    snapshot: mutatedSnapshot,
  });

  const invalidContentRejection = review.rejected.find((item) => item.reason === 'invalid_content');
  assert.ok(invalidContentRejection, 'expected invalid_content rejection');
  assert.equal(invalidContentRejection?.detail, 'content is empty string');
  assert.equal(invalidContentRejection?.hint, 'Provide non-empty content with at least 3 characters');

  source.database.connection.close();
  target.database.connection.close();
  rmSync(sourceDb, { force: true });
  rmSync(targetDb, { force: true });
});

test('evermemory_import summary reports accepted counts by type', () => {
  const sourceDb = createTempDbPath('summary-source');
  const targetDb = createTempDbPath('summary-target');
  const source = initializeEverMemory({ databasePath: sourceDb });
  const target = initializeEverMemory({ databasePath: targetDb });

  source.evermemoryStore({
    content: 'Preference item 1',
    type: 'preference',
    scope: { userId: 'u-summary' },
  });
  source.evermemoryStore({
    content: 'Preference item 2',
    type: 'preference',
    scope: { userId: 'u-summary' },
  });
  source.evermemoryStore({
    content: 'Constraint item',
    type: 'constraint',
    scope: { userId: 'u-summary' },
  });

  const snapshot = source.evermemoryExport({
    scope: { userId: 'u-summary' },
    includeArchived: false,
  }).snapshot;

  const review = target.evermemoryImport({
    snapshot,
  });

  assert.equal(review.summary.totalRequested, 3);
  assert.equal(review.summary.accepted, 3);
  assert.equal(review.summary.rejected, 0);
  assert.equal(review.summary.acceptedByType.preference, 2);
  assert.equal(review.summary.acceptedByType.constraint, 1);

  source.database.connection.close();
  target.database.connection.close();
  rmSync(sourceDb, { force: true });
  rmSync(targetDb, { force: true });
});

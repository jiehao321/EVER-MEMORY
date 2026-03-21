import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { evermemoryEdit } from '../../src/tools/edit.js';
import { MemoryRepository } from '../../src/storage/memoryRepo.js';
import { DebugRepository } from '../../src/storage/debugRepo.js';
import { createInMemoryDb, buildMemory } from '../storage/helpers.js';
import type { MemoryScope } from '../../src/types.js';

function makeFixture() {
  const db = createInMemoryDb();
  const memoryRepo = new MemoryRepository(db);
  const debugRepo = new DebugRepository(db);
  return { db, memoryRepo, debugRepo };
}

// ── update ─────────────────────────────────────────────────────────────────

test('edit update: modifies content in-place and returns updated summary', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const original = buildMemory({ content: '原始内容', scope: { userId: 'u1' } });
  memoryRepo.insert(original);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: original.id,
    action: 'update',
    newContent: '更新后的内容',
  });

  assert.equal(result.success, true);
  assert.equal(result.previous?.id, original.id);
  assert.equal(result.previous?.content, '原始内容');
  assert.equal(result.current?.content, '更新后的内容');

  const persisted = memoryRepo.findById(original.id);
  assert.equal(persisted?.content, '更新后的内容');
  // update is in-place: same id
  assert.equal(persisted?.id, original.id);
});

test('edit update: requires non-empty newContent', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '内容', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'update',
    newContent: '   ',
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('newContent'));
});

test('edit update: fails when memoryId not found', async () => {
  const { memoryRepo, debugRepo } = makeFixture();

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: 'nonexistent-id',
    action: 'update',
    newContent: 'new',
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('not found'));
  assert.equal(result.previous, null);
  assert.equal(result.current, null);
});

// ── delete ─────────────────────────────────────────────────────────────────

test('edit delete: archives the memory and returns null current', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '要删除的内容', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'delete',
  });

  assert.equal(result.success, true);
  assert.equal(result.current, null);
  assert.equal(result.previous?.content, '要删除的内容');

  const persisted = memoryRepo.findById(memory.id);
  assert.equal(persisted?.state.archived, true);
  assert.equal(persisted?.state.active, false);
  assert.ok(persisted?.tags.includes('deleted_by_user'));
});

// ── correct ────────────────────────────────────────────────────────────────

test('edit correct: creates new memory superseding old one', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const original = buildMemory({ content: '错误内容', scope: { userId: 'u1' } });
  memoryRepo.insert(original);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: original.id,
    action: 'correct',
    newContent: '正确内容',
  });

  assert.equal(result.success, true);
  assert.equal(result.previous?.content, '错误内容');
  assert.equal(result.current?.content, '正确内容');
  // New id should differ from original
  assert.notEqual(result.current?.id, original.id);

  // Old memory should be archived and superseded
  const oldPersisted = memoryRepo.findById(original.id);
  assert.equal(oldPersisted?.state.archived, true);
  assert.equal(oldPersisted?.state.supersededBy, result.current?.id);

  // New memory should be active
  const newPersisted = memoryRepo.findById(result.current!.id);
  assert.equal(newPersisted?.state.active, true);
  assert.equal(newPersisted?.state.archived, false);
  assert.equal(newPersisted?.content, '正确内容');
});

test('edit correct: requires non-empty newContent', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '内容', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'correct',
    newContent: '',
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('newContent'));
});

// ── merge ──────────────────────────────────────────────────────────────────

test('edit merge: combines two memories into one, archives both sources', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const scope: MemoryScope = { userId: 'u1' };
  const memA = buildMemory({ content: '记忆 A', scope, scores: { confidence: 0.7, importance: 0.6, explicitness: 0.5 } });
  const memB = buildMemory({ content: '记忆 B', scope, scores: { confidence: 0.8, importance: 0.9, explicitness: 0.7 } });
  memoryRepo.insert(memA);
  memoryRepo.insert(memB);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memA.id,
    action: 'merge',
    mergeWithId: memB.id,
  });

  assert.equal(result.success, true);
  assert.ok(result.current?.id);
  assert.notEqual(result.current?.id, memA.id);
  assert.notEqual(result.current?.id, memB.id);

  // Merged content should contain both
  assert.ok(result.current?.content.includes('记忆 A'));
  assert.ok(result.current?.content.includes('记忆 B'));

  // Sources archived
  const persistedA = memoryRepo.findById(memA.id);
  const persistedB = memoryRepo.findById(memB.id);
  assert.equal(persistedA?.state.archived, true);
  assert.equal(persistedB?.state.archived, true);
  assert.equal(persistedA?.state.supersededBy, result.current?.id);
  assert.equal(persistedB?.state.supersededBy, result.current?.id);

  // Merged memory uses max scores
  const merged = memoryRepo.findById(result.current!.id);
  assert.equal(merged?.scores.importance, 0.9);
  assert.equal(merged?.scores.confidence, 0.8);
});

test('edit merge: uses custom newContent when provided', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const scope: MemoryScope = { userId: 'u1' };
  const memA = buildMemory({ content: '内容 A', scope });
  const memB = buildMemory({ content: '内容 B', scope });
  memoryRepo.insert(memA);
  memoryRepo.insert(memB);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memA.id,
    action: 'merge',
    mergeWithId: memB.id,
    newContent: '合并后自定义内容',
  });

  assert.equal(result.success, true);
  assert.equal(result.current?.content, '合并后自定义内容');
});

test('edit merge: rejects self-merge', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '内容', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'merge',
    mergeWithId: memory.id,
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('different'));
});

test('edit merge: fails when mergeWithId is missing', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '内容', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'merge',
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('mergeWithId'));
});

test('edit merge: fails when mergeWithId does not exist', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '内容', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'merge',
    mergeWithId: 'ghost-id',
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.includes('not found'));
});

test('edit merge: rejects cross-scope merge', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memA = buildMemory({ content: '用户 A 内容', scope: { userId: 'userA' } });
  const memB = buildMemory({ content: '用户 B 内容', scope: { userId: 'userB' } });
  memoryRepo.insert(memA);
  memoryRepo.insert(memB);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memA.id,
    action: 'merge',
    mergeWithId: memB.id,
  });

  assert.equal(result.success, false);
  assert.ok(result.error?.toLowerCase().includes('scope'));
});

// ── pin ────────────────────────────────────────────────────────────────────

test('edit pin: adds pinned tag and increases importance by 0.15', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({
    content: '重要内容',
    scope: { userId: 'u1' },
    scores: { confidence: 0.8, importance: 0.5, explicitness: 0.8 },
  });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'pin',
  });

  assert.equal(result.success, true);
  assert.ok(result.current?.id === memory.id);

  const persisted = memoryRepo.findById(memory.id);
  assert.ok(persisted?.tags.includes('pinned'));
  assert.ok(
    Math.abs((persisted?.scores.importance ?? 0) - 0.65) < 0.001,
    `Expected importance ~0.65, got ${persisted?.scores.importance}`,
  );
});

test('edit pin: importance is capped at 1.0', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({
    content: '接近最高重要度',
    scope: { userId: 'u1' },
    scores: { confidence: 0.8, importance: 0.95, explicitness: 0.8 },
  });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'pin',
  });

  assert.equal(result.success, true);
  const persisted = memoryRepo.findById(memory.id);
  assert.ok((persisted?.scores.importance ?? 0) <= 1.0);
});

test('edit pin: is idempotent (already pinned stays pinned, no duplicate tag)', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({
    content: '已 pinned 内容',
    scope: { userId: 'u1' },
    tags: ['pinned'],
    scores: { confidence: 0.8, importance: 0.6, explicitness: 0.8 },
  });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'pin',
  });

  assert.equal(result.success, true);
  const persisted = memoryRepo.findById(memory.id);
  const pinnedCount = persisted?.tags.filter((t) => t === 'pinned').length ?? 0;
  assert.equal(pinnedCount, 1, 'pinned tag should not be duplicated');
});

// ── unpin ──────────────────────────────────────────────────────────────────

test('edit unpin: removes pinned tag and decreases importance by 0.15', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({
    content: '要 unpin 的内容',
    scope: { userId: 'u1' },
    tags: ['pinned', 'user_tag'],
    scores: { confidence: 0.8, importance: 0.7, explicitness: 0.8 },
  });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'unpin',
  });

  assert.equal(result.success, true);
  const persisted = memoryRepo.findById(memory.id);
  assert.ok(!persisted?.tags.includes('pinned'));
  assert.ok(persisted?.tags.includes('user_tag'), 'other tags should be preserved');
  assert.ok(
    Math.abs((persisted?.scores.importance ?? 0) - 0.55) < 0.001,
    `Expected importance ~0.55, got ${persisted?.scores.importance}`,
  );
});

test('edit unpin: importance floor is 0.0', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({
    content: '低重要度内容',
    scope: { userId: 'u1' },
    tags: ['pinned'],
    scores: { confidence: 0.8, importance: 0.05, explicitness: 0.8 },
  });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'unpin',
  });

  assert.equal(result.success, true);
  const persisted = memoryRepo.findById(memory.id);
  assert.ok((persisted?.scores.importance ?? -1) >= 0.0);
});

// ── hasCallerAccess (security) ─────────────────────────────────────────────

test('edit access control: denies cross-user update when callerScope userId differs', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '用户 A 私有内容', scope: { userId: 'userA' } });
  memoryRepo.insert(memory);

  const callerScope: MemoryScope = { userId: 'userB' };
  const result = await evermemoryEdit(
    memoryRepo,
    debugRepo,
    undefined,
    { memoryId: memory.id, action: 'update', newContent: '入侵内容' },
    callerScope,
  );

  assert.equal(result.success, false);
  assert.ok(result.error?.toLowerCase().includes('access denied') || result.error?.toLowerCase().includes('denied'));
  // Content must not have changed
  const persisted = memoryRepo.findById(memory.id);
  assert.equal(persisted?.content, '用户 A 私有内容');
});

test('edit access control: denies cross-user delete', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '用户 A 私有', scope: { userId: 'userA' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(
    memoryRepo,
    debugRepo,
    undefined,
    { memoryId: memory.id, action: 'delete' },
    { userId: 'userB' },
  );

  assert.equal(result.success, false);
  const persisted = memoryRepo.findById(memory.id);
  assert.equal(persisted?.state.archived, false, 'memory must not be deleted by unauthorized user');
});

test('edit access control: allows access when callerScope userId matches memory userId', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '我的内容', scope: { userId: 'userA' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(
    memoryRepo,
    debugRepo,
    undefined,
    { memoryId: memory.id, action: 'update', newContent: '更新后' },
    { userId: 'userA' },
  );

  assert.equal(result.success, true);
});

test('edit access control: allows access when callerScope has no userId (no restriction)', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memory = buildMemory({ content: '任意内容', scope: { userId: 'userA' } });
  memoryRepo.insert(memory);

  const result = await evermemoryEdit(
    memoryRepo,
    debugRepo,
    undefined,
    { memoryId: memory.id, action: 'update', newContent: '允许更新' },
    { project: 'myProject' }, // no userId in callerScope
  );

  assert.equal(result.success, true);
});

test('edit merge: denies when merge target belongs to different user', async () => {
  const { memoryRepo, debugRepo } = makeFixture();
  const memA = buildMemory({ content: '我的内容', scope: { userId: 'userA' } });
  const memB = buildMemory({ content: '他人内容', scope: { userId: 'userB' } });
  memoryRepo.insert(memA);
  memoryRepo.insert(memB);

  const result = await evermemoryEdit(
    memoryRepo,
    debugRepo,
    undefined,
    { memoryId: memA.id, action: 'merge', mergeWithId: memB.id },
    { userId: 'userA' },
  );

  assert.equal(result.success, false);
});

// ── debug log ──────────────────────────────────────────────────────────────

test('edit update: emits debug log with user_update action', async () => {
  const { memoryRepo, debugRepo, db } = makeFixture();
  const memory = buildMemory({ content: '需要记录的', scope: { userId: 'u1' } });
  memoryRepo.insert(memory);

  await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memory.id,
    action: 'update',
    newContent: '更新内容',
    reason: '测试原因',
  });

  const events = db.prepare(
    "SELECT * FROM debug_events WHERE kind = 'memory_write_decision' ORDER BY created_at DESC LIMIT 1"
  ).all() as Array<{ payload_json: string }>;
  assert.ok(events.length > 0);
  const payload = JSON.parse(events[0].payload_json) as Record<string, unknown>;
  assert.equal(payload.action, 'user_update');
  assert.equal(payload.reason, '测试原因');
});

test('edit merge: emits memory_merged debug log', async () => {
  const { memoryRepo, debugRepo, db } = makeFixture();
  const scope: MemoryScope = { userId: 'u1' };
  const memA = buildMemory({ content: 'A', scope });
  const memB = buildMemory({ content: 'B', scope });
  memoryRepo.insert(memA);
  memoryRepo.insert(memB);

  await evermemoryEdit(memoryRepo, debugRepo, undefined, {
    memoryId: memA.id,
    action: 'merge',
    mergeWithId: memB.id,
  });

  const events = db.prepare(
    "SELECT * FROM debug_events WHERE kind = 'memory_merged' LIMIT 1"
  ).all() as Array<{ payload_json: string }>;
  assert.ok(events.length > 0);
});

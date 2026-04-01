import test from 'node:test';
import assert from 'node:assert/strict';
import { explainWrite } from '../../src/tools/explainTopics.js';
import type { DebugEvent } from '../../src/types.js';

function buildEvent(overrides: Partial<DebugEvent> = {}): DebugEvent {
  return {
    id: overrides.id ?? 'event-1',
    createdAt: overrides.createdAt ?? '2026-03-31T10:00:00.000Z',
    kind: overrides.kind ?? 'memory_write_decision',
    entityId: overrides.entityId ?? 'memory-1',
    payload: overrides.payload ?? {},
  };
}

test('explain write event returns formatted explanation', () => {
  const result = explainWrite(buildEvent({
    payload: {
      accepted: true,
      reason: 'accepted_by_policy',
      merged: 2,
      archivedStale: 1,
      profileRecomputed: true,
    },
  }));

  assert.equal(result.kind, 'memory_write_decision');
  assert.match(result.answer, /Write accepted by policy/);
  assert.deepEqual(result.evidence, {
    accepted: true,
    reason: 'accepted_by_policy',
    merged: 2,
    archivedStale: 1,
    profileRecomputed: true,
  });
  assert.equal(result.meta?.outcome, 'accepted');
});

test('explain write rejection returns rejected explanation', () => {
  const result = explainWrite(buildEvent({
    kind: 'memory_write_rejected',
    payload: {
      reason: 'duplicate_memory',
    },
  }));

  assert.match(result.answer, /duplicate_memory/);
  assert.equal(result.meta?.outcome, 'rejected');
  assert.equal(result.evidence.accepted, false);
});

test('explain with unknown event kind is handled gracefully', () => {
  const result = explainWrite(buildEvent({
    kind: 'unknown_debug_event' as DebugEvent['kind'],
    payload: {},
  }));

  assert.equal(result.kind, 'unknown_debug_event');
  assert.match(result.answer, /Write accepted by policy|Write decision is non-accepted/);
  assert.equal(result.meta?.categories?.[0], 'memory_write');
});

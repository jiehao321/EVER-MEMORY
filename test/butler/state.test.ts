import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ButlerPersistentState, WorkingMemoryEntry } from '../../src/core/butler/types.js';
import { ButlerStateManager } from '../../src/core/butler/state.js';
import { ButlerStateRepository } from '../../src/storage/butlerStateRepo.js';
import { createInMemoryDb } from '../storage/helpers.js';

function createLogger() {
  return {
    info: (_message: string, _meta?: Record<string, unknown>) => undefined,
    warn: (_message: string, _meta?: Record<string, unknown>) => undefined,
    error: (_message: string, _meta?: Record<string, unknown>) => undefined,
    debug: (_message: string, _meta?: Record<string, unknown>) => undefined,
  };
}

function createState(overrides: Partial<ButlerPersistentState> = {}): ButlerPersistentState {
  return {
    currentStrategyFrame: overrides.currentStrategyFrame ?? {
      currentMode: 'planning',
      likelyUserGoal: 'ship tests',
      topPriorities: ['state'],
      constraints: ['strict esm'],
      lastUpdatedAt: '2026-03-31T00:00:00.000Z',
    },
    selfModel: overrides.selfModel ?? {
      overlayAcceptanceRate: 0.3,
      insightPrecision: 0.5,
      avgCycleLatencyMs: 120,
      totalCycles: 3,
      lastEvaluatedAt: '2026-03-31T00:00:00.000Z',
    },
    workingMemory: overrides.workingMemory ?? [],
    mode: overrides.mode ?? 'reduced',
    lastCycleAt: overrides.lastCycleAt ?? '2026-03-31T00:00:00.000Z',
    lastCycleVersion: overrides.lastCycleVersion ?? 1,
  };
}

function createEntry(
  key: string,
  value: unknown,
  overrides: Partial<WorkingMemoryEntry> = {},
): WorkingMemoryEntry {
  return {
    key,
    value,
    createdAt: overrides.createdAt ?? '2026-03-31T00:00:00.000Z',
    expiresAt: overrides.expiresAt,
  };
}

function createNoopStateRepo(): ButlerStateRepository {
  return {
    load: () => null,
    save: () => undefined,
  } as unknown as ButlerStateRepository;
}

describe('ButlerStateManager', () => {
  it('initializes default state and saves it when repository is empty', () => {
    let saveCalls = 0;
    let savedState: ButlerPersistentState | undefined;
    const mockRepo = {
      load: () => null,
      save: (state: ButlerPersistentState) => {
        saveCalls += 1;
        savedState = state;
      },
    } as ButlerStateRepository;
    const manager = new ButlerStateManager({
      stateRepo: mockRepo,
      logger: createLogger(),
    });

    const state = manager.load();

    assert.equal(state.mode, 'reduced');
    assert.deepEqual(state.workingMemory, []);
    assert.equal(state.lastCycleVersion, 0);
    assert.equal(saveCalls, 1);
    assert.deepEqual(savedState, state);
  });

  it('saves and reloads state through the repository', () => {
    const db = createInMemoryDb();
    const repo = new ButlerStateRepository(db);
    const writer = new ButlerStateManager({ stateRepo: repo, logger: createLogger() });
    const reader = new ButlerStateManager({ stateRepo: repo, logger: createLogger() });
    const state = createState({
      mode: 'steward',
      workingMemory: [createEntry('note', { persisted: true })],
      lastCycleVersion: 8,
    });

    writer.save(state);
    const reloaded = reader.load();

    assert.equal(reloaded.mode, 'steward');
    assert.equal(reloaded.lastCycleVersion, 8);
    assert.equal(reloaded.workingMemory.length, 1);
    assert.equal(reloaded.workingMemory[0]?.key, 'note');
    assert.deepEqual(reloaded.workingMemory[0]?.value, { persisted: true });
    assert.equal(reloaded.workingMemory[0]?.createdAt, '2026-03-31T00:00:00.000Z');
  });

  it('adds working memory entries without mutating the original state', () => {
    const manager = new ButlerStateManager({
      stateRepo: createNoopStateRepo(),
      logger: createLogger(),
    });
    const state = createState({
      workingMemory: [createEntry('existing', 'value')],
    });

    const next = manager.addWorkingMemoryEntry(state, 'new-key', { ok: true }, 1_000);

    assert.equal(state.workingMemory.length, 1);
    assert.equal(next.workingMemory.length, 2);
    assert.equal(next.workingMemory[1]?.key, 'new-key');
    assert.deepEqual(next.workingMemory[1]?.value, { ok: true });
    assert.ok(next.workingMemory[1]?.expiresAt);
  });

  it('prunes expired working memory entries', () => {
    const manager = new ButlerStateManager({
      stateRepo: createNoopStateRepo(),
      logger: createLogger(),
    });
    const state = createState({
      workingMemory: [
        createEntry('expired', true, { expiresAt: '2000-01-01T00:00:00.000Z' }),
        createEntry('active', true, { expiresAt: '2099-01-01T00:00:00.000Z' }),
        createEntry('persistent', true),
      ],
    });

    const next = manager.pruneExpiredWorkingMemory(state);

    assert.deepEqual(next.workingMemory.map((entry) => entry.key), ['active', 'persistent']);
    assert.equal(state.workingMemory.length, 3);
  });
});

import type { ButlerLogger, ButlerMode, ButlerPersistentState, WorkingMemoryEntry } from './types.js';
import type { ClockPort } from './ports/clock.js';
import type { StateStore } from './ports/storage.js';

const MAX_WORKING_MEMORY_ENTRIES = 20;

interface ButlerStateManagerOptions {
  stateRepo: StateStore;
  clock?: ClockPort;
  logger?: ButlerLogger;
}

const DEFAULT_CLOCK: ClockPort = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

function isExpired(entry: WorkingMemoryEntry, now: number): boolean {
  if (!entry.expiresAt) {
    return false;
  }
  return Date.parse(entry.expiresAt) <= now;
}

function withWorkingMemory(
  state: ButlerPersistentState,
  workingMemory: WorkingMemoryEntry[],
): ButlerPersistentState {
  return {
    ...state,
    workingMemory,
  };
}

export class ButlerStateManager {
  private readonly stateRepo: StateStore;
  private readonly clock: ClockPort;
  private readonly logger?: ButlerLogger;
  private currentState: ButlerPersistentState | null = null;

  constructor(options: ButlerStateManagerOptions) {
    this.stateRepo = options.stateRepo;
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.logger = options.logger;
  }

  load(): ButlerPersistentState {
    const loaded = this.stateRepo.load();
    if (loaded) {
      this.currentState = loaded;
      return loaded;
    }

    const state = this.createDefaultState();
    this.save(state);
    return state;
  }

  save(state: ButlerPersistentState): void {
    this.stateRepo.save(state);
    this.currentState = {
      ...state,
      workingMemory: state.workingMemory.map((entry) => ({ ...entry })),
    };
  }

  getMode(): ButlerMode {
    return this.load().mode;
  }

  setMode(mode: ButlerMode): void {
    const current = this.load();
    this.save({
      ...current,
      mode,
    });
  }

  createDefaultState(): ButlerPersistentState {
    const timestamp = this.clock.isoNow();
    return {
      currentStrategyFrame: {
        currentMode: 'exploring',
        likelyUserGoal: '',
        topPriorities: [],
        constraints: [],
        lastUpdatedAt: timestamp,
      },
      selfModel: {
        overlayAcceptanceRate: 0,
        insightPrecision: 0,
        avgCycleLatencyMs: 0,
        totalCycles: 0,
        lastEvaluatedAt: timestamp,
      },
      workingMemory: [],
      mode: 'reduced',
      lastCycleAt: timestamp,
      lastCycleVersion: 0,
    };
  }

  addWorkingMemoryEntry(
    state: ButlerPersistentState,
    key: string,
    value: unknown,
    ttlMs?: number,
  ): ButlerPersistentState {
    const baseState = this.pruneExpiredWorkingMemory(state);
    const entry = this.createWorkingMemoryEntry(key, value, ttlMs);
    const workingMemory = [...baseState.workingMemory, entry].slice(-MAX_WORKING_MEMORY_ENTRIES);
    return withWorkingMemory(baseState, workingMemory);
  }

  pruneExpiredWorkingMemory(state: ButlerPersistentState): ButlerPersistentState {
    const now = this.clock.now();
    const workingMemory = state.workingMemory.filter((entry) => !isExpired(entry, now));
    return withWorkingMemory(state, workingMemory);
  }

  private createWorkingMemoryEntry(
    key: string,
    value: unknown,
    ttlMs?: number,
  ): WorkingMemoryEntry {
    const createdAt = this.clock.isoNow();
    const expiresAt = typeof ttlMs === 'number' && ttlMs > 0
      ? new Date(this.clock.now() + ttlMs).toISOString()
      : undefined;

    this.logger?.debug?.('ButlerStateManager adding working memory entry', { key });
    return {
      key,
      value,
      createdAt,
      expiresAt,
    };
  }
}

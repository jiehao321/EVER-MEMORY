import type { CognitiveEngine } from '../cognition.js';
import type {
  ButlerLogger,
  CognitiveTask,
  NarrativeMomentum,
  NarrativePhase,
  NarrativeThread,
} from '../types.js';
import { NarrativeRepository } from '../../../storage/narrativeRepo.js';
import { nowIso } from '../../../util/time.js';

const PHASES = new Set<NarrativePhase>([
  'exploring',
  'forming',
  'expanding',
  'converging',
  'stabilizing',
  'releasing',
  'governing',
]);

const MOMENTA = new Set<NarrativeMomentum>(['accelerating', 'steady', 'stalling', 'blocked']);

function isPhase(value: unknown): value is NarrativePhase {
  return typeof value === 'string' && PHASES.has(value as NarrativePhase);
}

function isMomentum(value: unknown): value is NarrativeMomentum {
  return typeof value === 'string' && MOMENTA.has(value as NarrativeMomentum);
}

function serializeScope(scope?: Record<string, unknown>): string | undefined {
  return scope === undefined ? undefined : JSON.stringify(scope);
}

export class NarrativeThreadService {
  constructor(
    private readonly options: {
      narrativeRepo: NarrativeRepository;
      cognitiveEngine: CognitiveEngine;
      logger?: ButlerLogger;
    },
  ) {}

  getActiveThreads(scope?: Record<string, unknown>): NarrativeThread[] {
    return this.options.narrativeRepo.findActive(scope);
  }

  async updateThread(
    threadId: string,
    event: string,
    scope?: Record<string, unknown>,
  ): Promise<NarrativeThread | null> {
    const current = this.options.narrativeRepo.findById(threadId);
    if (!current) {
      return null;
    }
    const next = await this.assessThread(current, event, scope);
    this.options.narrativeRepo.update(threadId, next);
    return this.options.narrativeRepo.findById(threadId);
  }

  async createThread(input: {
    theme: string;
    objective: string;
    scope?: Record<string, unknown>;
  }): Promise<NarrativeThread> {
    const timestamp = nowIso();
    const id = this.options.narrativeRepo.insert({
      theme: input.theme,
      objective: input.objective,
      currentPhase: 'exploring',
      momentum: 'steady',
      recentEvents: [],
      blockers: [],
      likelyNextTurn: '',
      strategicImportance: 0.5,
      scopeJson: serializeScope(input.scope),
      startedAt: timestamp,
      updatedAt: timestamp,
    });
    return this.options.narrativeRepo.findById(id) as NarrativeThread;
  }

  closeThread(threadId: string): void {
    this.options.narrativeRepo.close(threadId);
  }

  findByTheme(theme: string): NarrativeThread | null {
    const needle = theme.toLowerCase();
    return this.options.narrativeRepo.findActive().find((thread) => (
      thread.theme.toLowerCase().includes(needle)
    )) ?? null;
  }

  updateOrCreateForSession(payload: {
    scope?: Record<string, unknown>;
    sessionId?: string;
  }): void {
    const existing = this.options.narrativeRepo.findActive(payload.scope);
    if (existing.length > 0) {
      const thread = existing[0];
      this.options.narrativeRepo.update(thread.id, {
        recentEvents: [
          ...thread.recentEvents.slice(-9),
          `session:${new Date().toISOString()}`,
        ],
        updatedAt: new Date().toISOString(),
      });
    } else {
      const timestamp = nowIso();
      this.options.narrativeRepo.insert({
        theme: 'session-narrative',
        objective: 'Track cross-session work continuity',
        currentPhase: 'exploring',
        momentum: 'steady',
        recentEvents: [`created:${timestamp}`],
        blockers: [],
        likelyNextTurn: '',
        strategicImportance: 0.5,
        scopeJson: payload.scope ? JSON.stringify(payload.scope) : undefined,
        startedAt: timestamp,
        updatedAt: timestamp,
      });
    }
  }

  private async assessThread(
    thread: NarrativeThread,
    event: string,
    scope?: Record<string, unknown>,
  ): Promise<Partial<NarrativeThread>> {
    const recentEvents = [...thread.recentEvents, event].slice(-5);
    const fallback: Partial<NarrativeThread> = { recentEvents };
    const task: CognitiveTask<Record<string, unknown>> = {
      taskType: 'narrative-assessment',
      evidence: { thread, event, scope: scope ?? {} },
      outputSchema: {
        type: 'object',
        properties: {
          phase: { type: 'string' },
          momentum: { type: 'string' },
          likelyNextTurn: { type: 'string' },
        },
      },
      latencyClass: 'foreground',
      privacyClass: 'local_only',
      budgetClass: 'cheap',
    };
    if (!this.options.cognitiveEngine.canAfford(task)) {
      return fallback;
    }
    const result = await this.options.cognitiveEngine.runTask(task);
    if (result.fallbackUsed || typeof result.output !== 'object' || result.output === null) {
      return fallback;
    }
    const output = result.output as Record<string, unknown>;
    return {
      recentEvents,
      currentPhase: isPhase(output.phase) ? output.phase : thread.currentPhase,
      momentum: isMomentum(output.momentum) ? output.momentum : thread.momentum,
      likelyNextTurn: typeof output.likelyNextTurn === 'string'
        ? output.likelyNextTurn
        : thread.likelyNextTurn,
    };
  }
}

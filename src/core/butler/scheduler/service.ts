import type { ButlerAgent } from '../agent.js';
import type { ClockPort } from '../ports/clock.js';
import type { ButlerLogger, ButlerTrigger } from '../types.js';
import type { TriggerEvaluatorDeps, WakeUpTrigger } from './triggers.js';
import { evaluateTriggers } from './triggers.js';

export interface SchedulerConfig {
  enabled: boolean;
  tickIntervalMs: number;
  idleThrottleMs: number;
  maxTickBudgetMs: number;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  enabled: true,
  tickIntervalMs: 60_000,
  idleThrottleMs: 300_000,
  maxTickBudgetMs: 5_000,
};

function shouldRunCycle(triggers: WakeUpTrigger[]): boolean {
  return triggers.some((trigger) => trigger.priority === 'high' || trigger.priority === 'medium');
}

function toAutonomousTrigger(triggers: WakeUpTrigger[]): ButlerTrigger {
  return {
    type: 'autonomous_tick',
    payload: {
      autonomous: true,
      triggerKinds: triggers.map((trigger) => trigger.kind),
    },
  };
}

export class ButlerScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private lastTickAt = 0;
  private readonly config: SchedulerConfig;

  constructor(
    private readonly agent: ButlerAgent,
    private readonly triggerDeps: TriggerEvaluatorDeps,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
    config?: Partial<SchedulerConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  start(): void {
    if (!this.config.enabled || this.intervalHandle) {
      return;
    }
    this.intervalHandle = setInterval(() => {
      this.tick().catch((error: unknown) => {
        this.logger?.error('ButlerScheduler tick failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.config.tickIntervalMs);
    this.logger?.info('ButlerScheduler started', { intervalMs: this.config.tickIntervalMs });
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }
    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
    this.logger?.info('ButlerScheduler stopped');
  }

  async checkAndTick(): Promise<boolean> {
    if (!this.config.enabled) {
      return false;
    }
    if (this.clock.now() - this.lastTickAt < this.config.tickIntervalMs) {
      return false;
    }
    await this.tick();
    return true;
  }

  async tick(): Promise<{ triggers: WakeUpTrigger[]; cycleRan: boolean }> {
    this.lastTickAt = this.clock.now();
    const triggers = evaluateTriggers(this.triggerDeps);

    if (triggers.length === 0 || !shouldRunCycle(triggers)) {
      return { triggers, cycleRan: false };
    }

    await this.agent.runCycle(toAutonomousTrigger(triggers));
    return { triggers, cycleRan: true };
  }

  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  getLastTickAt(): number {
    return this.lastTickAt;
  }
}

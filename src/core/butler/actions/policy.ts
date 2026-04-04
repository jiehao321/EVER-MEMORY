import type { ClockPort } from '../ports/clock.js';
import type { ButlerLogger } from '../types.js';
import type { ActionPolicyConfig, ActionStep } from './types.js';

function currentDate(clock: ClockPort): string {
  return clock.isoNow().slice(0, 10);
}

export class ActionPolicy {
  private sessionActionCount = 0;
  private dailyActionCount = 0;
  private lastResetDate = '';

  constructor(
    private readonly config: ActionPolicyConfig,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
  ) {}

  canExecute(step: ActionStep): { allowed: boolean; reason?: string } {
    this.resetDailyIfNeeded();

    if (this.dailyActionCount >= this.config.maxActionsPerDay) {
      return { allowed: false, reason: 'daily action limit reached' };
    }
    if (this.sessionActionCount >= this.config.maxActionsPerSession) {
      return { allowed: false, reason: 'session action limit reached' };
    }
    if (this.config.requireConfirmTiers.includes(step.tier)) {
      return { allowed: false, reason: 'requires user confirmation' };
    }
    return { allowed: true };
  }

  recordAction(): void {
    this.resetDailyIfNeeded();
    this.dailyActionCount += 1;
    this.sessionActionCount += 1;
    this.logger?.debug?.('Butler action recorded.', {
      dailyActionCount: this.dailyActionCount,
      sessionActionCount: this.sessionActionCount,
    });
  }

  getDailyActionCount(): number {
    this.resetDailyIfNeeded();
    return this.dailyActionCount;
  }

  getSessionActionCount(): number {
    this.resetDailyIfNeeded();
    return this.sessionActionCount;
  }

  resetSession(): void {
    this.sessionActionCount = 0;
  }

  private resetDailyIfNeeded(): void {
    const today = currentDate(this.clock);
    if (today === this.lastResetDate) {
      return;
    }
    this.dailyActionCount = 0;
    this.sessionActionCount = 0;
    this.lastResetDate = today;
  }
}

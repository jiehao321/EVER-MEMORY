import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { MemoryItem } from '../../types/memory.js';

export interface DecayWarning {
  type: 'decay_warning';
  memoryId: string;
  content: string;
  importance: number;
  daysSinceAccess: number;
  message: string;
}

export interface CommitmentReminder {
  type: 'commitment_reminder';
  memoryId: string;
  content: string;
  daysSinceCreated: number;
  message: string;
}

export type ProactiveAlert = DecayWarning | CommitmentReminder;

type AlertScope = Pick<MemoryItem['scope'], 'userId' | 'project'>;

const DECAY_WARNING_THRESHOLD_DAYS = 14;
const COMMITMENT_REMINDER_DAYS = 7;
const MAX_ALERTS = 5;
const IMPORTANT_MEMORY_THRESHOLD = 0.6;
const COMMITMENT_IMPORTANCE_THRESHOLD = 0.5;
const MS_PER_DAY = 86_400_000;
const COMMITMENT_TYPES = ['commitment', 'decision'] as const;

export class ProactiveAlertsService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
  ) {}

  /**
   * Generate proactive alerts at session start.
   * Returns decay warnings + commitment reminders.
   */
  generateAlerts(scope?: AlertScope): ProactiveAlert[] {
    const alerts: ProactiveAlert[] = [];

    const decayWarnings = this.findDecayingMemories(scope);
    alerts.push(...decayWarnings);

    const reminders = this.findPendingCommitments(scope);
    alerts.push(...reminders);

    return alerts
      .sort((left, right) => this.alertPriority(right) - this.alertPriority(left))
      .slice(0, MAX_ALERTS);
  }

  private findDecayingMemories(scope?: AlertScope): DecayWarning[] {
    try {
      const memories = this.memoryRepo.search({
        scope: this.toSearchScope(scope),
        activeOnly: true,
        limit: 50,
      });
      const now = Date.now();
      const warnings: DecayWarning[] = [];

      for (const memory of memories) {
        if (memory.scores.importance < IMPORTANT_MEMORY_THRESHOLD) {
          continue;
        }

        const lastAccessedAt = memory.timestamps.lastAccessedAt ?? memory.timestamps.updatedAt;
        const lastAccessed = new Date(lastAccessedAt).getTime();
        if (Number.isNaN(lastAccessed)) {
          continue;
        }

        const daysSinceAccess = (now - lastAccessed) / MS_PER_DAY;
        if (daysSinceAccess < DECAY_WARNING_THRESHOLD_DAYS) {
          continue;
        }

        const roundedDaysSinceAccess = Math.floor(daysSinceAccess);
        warnings.push({
          type: 'decay_warning',
          memoryId: memory.id,
          content: this.truncate(memory.content, 100),
          importance: memory.scores.importance,
          daysSinceAccess: roundedDaysSinceAccess,
          message: `Memory "${this.truncate(memory.content, 50)}" hasn't been accessed in ${roundedDaysSinceAccess} days and may be archived soon.`,
        });
      }

      return warnings.sort((left, right) => right.importance - left.importance);
    } catch {
      return [];
    }
  }

  private findPendingCommitments(scope?: AlertScope): CommitmentReminder[] {
    try {
      const commitments = this.memoryRepo.search({
        types: [...COMMITMENT_TYPES],
        scope: this.toSearchScope(scope),
        activeOnly: true,
        limit: 20,
      });
      const now = Date.now();
      const reminders: CommitmentReminder[] = [];

      for (const memory of commitments) {
        const createdAt = new Date(memory.timestamps.createdAt).getTime();
        if (Number.isNaN(createdAt)) {
          continue;
        }

        const daysSinceCreated = (now - createdAt) / MS_PER_DAY;
        if (
          daysSinceCreated < COMMITMENT_REMINDER_DAYS
          || memory.scores.importance < COMMITMENT_IMPORTANCE_THRESHOLD
        ) {
          continue;
        }

        const roundedDaysSinceCreated = Math.floor(daysSinceCreated);
        reminders.push({
          type: 'commitment_reminder',
          memoryId: memory.id,
          content: this.truncate(memory.content, 100),
          daysSinceCreated: roundedDaysSinceCreated,
          message: `Commitment "${this.truncate(memory.content, 50)}" was made ${roundedDaysSinceCreated} days ago. Is it still relevant?`,
        });
      }

      return reminders;
    } catch {
      return [];
    }
  }

  private toSearchScope(scope?: AlertScope): AlertScope | undefined {
    if (!scope) {
      return undefined;
    }

    const resolvedScope: AlertScope = {};
    if (scope.userId) {
      resolvedScope.userId = scope.userId;
    }
    if (scope.project) {
      resolvedScope.project = scope.project;
    }

    return Object.keys(resolvedScope).length > 0 ? resolvedScope : undefined;
  }

  private alertPriority(alert: ProactiveAlert): number {
    if (alert.type === 'decay_warning') {
      return alert.importance + alert.daysSinceAccess / DECAY_WARNING_THRESHOLD_DAYS;
    }

    return 1 + alert.daysSinceCreated / COMMITMENT_REMINDER_DAYS;
  }

  private truncate(content: string, limit: number): string {
    if (content.length <= limit) {
      return content;
    }

    return `${content.slice(0, limit)}...`;
  }
}

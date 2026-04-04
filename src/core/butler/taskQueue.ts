import type { ButlerLogger, ButlerTask, DrainBudget, NewButlerTask } from './types.js';
import type { TaskStore } from './ports/storage.js';

interface TaskQueueServiceOptions {
  taskRepo: TaskStore;
  logger?: ButlerLogger;
}

function maxPriorityForFilter(
  filter: DrainBudget['priorityFilter'],
): number {
  switch (filter) {
    case 'high_only':
      return 3;
    case 'high_and_medium':
      return 6;
    case 'all':
    case undefined:
      return Number.MAX_SAFE_INTEGER;
  }
}

function canContinue(startedAt: number, budget: DrainBudget, tasksDrained: number): boolean {
  if (tasksDrained >= budget.maxTasks) {
    return false;
  }
  return Date.now() - startedAt < budget.maxTimeMs;
}

export class TaskQueueService {
  private readonly taskRepo: TaskStore;
  private readonly logger?: ButlerLogger;

  constructor(options: TaskQueueServiceOptions) {
    this.taskRepo = options.taskRepo;
    this.logger = options.logger;
  }

  enqueue(task: NewButlerTask): string {
    const existing = this.findExistingTask(task.idempotencyKey);
    if (existing) {
      return existing.id;
    }

    try {
      return this.taskRepo.addTask(task);
    } catch (error) {
      const recovered = this.findExistingTask(task.idempotencyKey);
      if (recovered) {
        return recovered.id;
      }
      this.logger?.error('TaskQueueService enqueue failed', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  drain(budget: DrainBudget): ButlerTask[] {
    if (budget.maxTasks <= 0 || budget.maxTimeMs <= 0) {
      return [];
    }

    const startedAt = Date.now();
    const maxPriority = maxPriorityForFilter(budget.priorityFilter);
    const drained: ButlerTask[] = [];

    while (canContinue(startedAt, budget, drained.length)) {
      const leased = this.taskRepo.leaseTasks(1, maxPriority);
      if (leased.length === 0) {
        break;
      }
      drained.push(leased[0]);
    }

    return drained;
  }

  complete(taskId: string, result: unknown): void {
    this.taskRepo.completeTask(taskId, result);
  }

  fail(taskId: string, error: string): void {
    this.taskRepo.failTask(taskId, error);
  }

  getPendingCount(): number {
    return this.taskRepo.getPendingCount();
  }

  private findExistingTask(idempotencyKey: string | undefined): ButlerTask | null {
    if (!idempotencyKey) {
      return null;
    }
    return this.taskRepo.getByIdempotencyKey(idempotencyKey);
  }
}

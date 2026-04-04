import type { ClockPort } from '../ports/clock.js';
import type { HostPort } from '../ports/host.js';
import type { ButlerLogger } from '../types.js';
import { ActionPolicy } from './policy.js';
import type { ActionPlan, ActionResult, ActionStep } from './types.js';

export class ActionExecutor {
  constructor(
    private readonly host: HostPort,
    private readonly policy: ActionPolicy,
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
  ) {}

  async execute(plan: ActionPlan): Promise<ActionResult> {
    const startedAt = this.clock.now();
    const stepResults: ActionResult['stepResults'] = [];

    for (const step of plan.steps) {
      if (this.clock.now() - startedAt >= plan.budgetMs) {
        break;
      }

      const check = this.policy.canExecute(step);
      if (!check.allowed) {
        stepResults.push({ step, success: false, error: check.reason, durationMs: 0 });
        continue;
      }

      const stepStart = this.clock.now();
      try {
        const result = await this.executeStep(step);
        this.policy.recordAction();
        stepResults.push({
          step,
          success: true,
          result,
          durationMs: this.clock.now() - stepStart,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger?.warn('Butler action step failed.', {
          stepType: step.type,
          error: message,
        });
        stepResults.push({
          step,
          success: false,
          error: message,
          durationMs: this.clock.now() - stepStart,
        });
      }
    }

    return {
      stepResults,
      totalDurationMs: this.clock.now() - startedAt,
      actionsExecuted: stepResults.filter((entry) => entry.success).length,
      actionsFailed: stepResults.filter((entry) => !entry.success).length,
    };
  }

  private async executeStep(step: ActionStep): Promise<unknown> {
    switch (step.type) {
      case 'store_memory':
        return this.invokeTool('evermemory_store', {
          content: step.content,
          type: step.memoryType,
        });
      case 'recall_memory':
        return this.invokeTool('evermemory_recall', { query: step.query });
      case 'create_relation':
        return this.invokeTool('evermemory_relations', {
          action: 'add',
          fromId: step.fromId,
          toId: step.toId,
          relationType: step.relationType,
        });
      case 'update_goal':
        throw new Error('Goal updates are not supported yet.');
      case 'ask_user':
        if (!this.host.askUser) {
          throw new Error('Host does not support asking the user');
        }
        return this.host.askUser(step.question, { context: step.context });
      case 'search_knowledge':
        if (!this.host.searchKnowledge) {
          throw new Error('Host does not support knowledge search');
        }
        return this.host.searchKnowledge(step.query, step.sources);
      case 'delete_memory':
        return this.invokeTool('evermemory_edit', { action: 'delete', id: step.memoryId });
      case 'archive_memory':
        return this.invokeTool('evermemory_edit', { action: 'archive', id: step.memoryId });
      default: {
        const exhaustive: never = step;
        return exhaustive;
      }
    }
  }

  private invokeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.host.invokeTool) {
      throw new Error('Host does not support tool invocation');
    }
    return this.host.invokeTool(toolName, params);
  }
}

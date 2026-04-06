import { randomUUID } from 'node:crypto';
import type { ButlerAgent } from '../agent.js';
import type { ClockPort } from '../ports/clock.js';
import type { ButlerStoragePort } from '../ports/storage.js';
import type { ButlerScheduler } from '../scheduler/service.js';
import type { ButlerLogger, ButlerTrigger } from '../types.js';
import type {
  ButlerEvent,
  ButlerMessage,
  ButlerResponse,
  ButlerStatusPayload,
} from './types.js';

export interface ProtocolHandlerOptions {
  agent: ButlerAgent;
  scheduler: ButlerScheduler;
  storage: ButlerStoragePort;
  clock: ClockPort;
  logger?: ButlerLogger;
  onOutbound?: (message: ButlerMessage) => void;
}

export class ProtocolHandler {
  private readonly startedAt: number;
  private readonly pendingQuestions = new Map<
    string,
    {
      resolve: (answer: string | null) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly pendingActions = new Map<
    string,
    {
      resolve: (result: { success: boolean; result?: unknown; error?: string }) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly options: ProtocolHandlerOptions) {
    this.startedAt = options.clock.now();
  }

  async handle(message: ButlerMessage): Promise<ButlerMessage | null> {
    switch (message.type) {
      case 'event':
        return this.handleEvent(message.id, message.event);
      case 'answer':
        this.options.logger?.debug?.('ProtocolHandler received answer message', {
          questionId: message.questionId,
        });
        this.resolveQuestion(message.questionId, message.answer);
        return null;
      case 'action_result':
        this.options.logger?.debug?.('ProtocolHandler received action result', {
          actionId: message.actionId,
          success: message.success,
        });
        this.resolveAction(message.actionId, this.toActionResolution(message));
        return null;
      case 'shutdown':
        this.options.scheduler.stop();
        this.clearPending();
        return {
          type: 'status',
          id: randomUUID(),
          status: await this.getStatus(),
        };
      default:
        return null;
    }
  }

  askUser(question: string, options?: { context?: string; timeoutMs?: number }): Promise<string | null> {
    const id = randomUUID();
    const timeoutMs = options?.timeoutMs ?? 30_000;

    return new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingQuestions.delete(id);
        resolve(null);
      }, timeoutMs);

      this.pendingQuestions.set(id, { resolve, timer });

      this.emit({
        type: 'question',
        id,
        questionText: question,
        context: options?.context,
        importance: 0.5,
      });
    });
  }

  requestActionConfirmation(
    action: { type: string; params: Record<string, unknown> },
    options?: { timeoutMs?: number },
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    const id = randomUUID();
    const timeoutMs = options?.timeoutMs ?? 30_000;

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingActions.delete(id);
        resolve({ success: false, error: 'Confirmation timeout' });
      }, timeoutMs);

      this.pendingActions.set(id, { resolve, timer });

      this.emit({
        type: 'action',
        id,
        action,
        tier: 'confirm',
      });
    });
  }

  emitEvent(event: ButlerEvent): void {
    this.emit({
      type: 'event',
      id: randomUUID(),
      event,
    });
  }

  private async handleEvent(requestId: string, event: ButlerEvent): Promise<ButlerMessage> {
    try {
      const trigger = this.eventToTrigger(event);
      const trace = await this.options.agent.runCycle(trigger);
      const response: ButlerResponse = {
        cycleTrace: trace,
      };
      return {
        type: 'response',
        id: randomUUID(),
        requestId,
        result: response,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.options.logger?.error('ProtocolHandler event handling failed', {
        eventKind: event.kind,
        error: message,
      });
      return {
        type: 'response',
        id: randomUUID(),
        requestId,
        result: { error: message },
      };
    }
  }

  private eventToTrigger(event: ButlerEvent): ButlerTrigger {
    switch (event.kind) {
      case 'session_started':
        return {
          type: 'session_started',
          sessionId: event.sessionId,
          scope: event.scope,
        };
      case 'message':
        return {
          type: 'message_received',
          sessionId: event.sessionId,
          payload: { text: event.text },
        };
      case 'session_ended':
        return {
          type: 'session_ended',
          sessionId: event.sessionId,
        };
      case 'tick':
        return { type: 'autonomous_tick' };
      case 'tool_result':
        return {
          type: 'agent_ended',
          payload: {
            toolName: event.toolName,
            result: event.result,
          },
        };
      case 'user_feedback':
        return {
          type: 'message_received',
          payload: {
            feedback: true,
            insightId: event.insightId,
            rating: event.rating,
          },
        };
    }
  }

  private emit(message: ButlerMessage): void {
    this.options.onOutbound?.(message);
  }

  private resolveQuestion(questionId: string, answer: string): void {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingQuestions.delete(questionId);
    pending.resolve(answer);
  }

  private resolveAction(
    actionId: string,
    result: { success: boolean; result?: unknown; error?: string },
  ): void {
    const pending = this.pendingActions.get(actionId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingActions.delete(actionId);
    pending.resolve(result);
  }

  private clearPending(): void {
    for (const [id, pending] of this.pendingQuestions) {
      clearTimeout(pending.timer);
      pending.resolve(null);
      this.pendingQuestions.delete(id);
    }

    for (const [id, pending] of this.pendingActions) {
      clearTimeout(pending.timer);
      pending.resolve({ success: false, error: 'Shutdown' });
      this.pendingActions.delete(id);
    }
  }

  private toActionResolution(message: {
    success: boolean;
    result?: unknown;
    error?: string;
  }): { success: boolean; result?: unknown; error?: string } {
    const resolution: { success: boolean; result?: unknown; error?: string } = {
      success: message.success,
    };

    if (message.result !== undefined) {
      resolution.result = message.result;
    }
    if (message.error !== undefined) {
      resolution.error = message.error;
    }

    return resolution;
  }

  private getStatusSync(): ButlerStatusPayload {
    const state = this.options.agent.getState();
    return {
      mode: state?.mode ?? 'reduced',
      uptime: this.options.clock.now() - this.startedAt,
      totalCycles: state?.selfModel.totalCycles ?? 0,
      pendingTasks: this.options.storage.tasks.getPendingCount(),
      activeGoals: this.options.storage.goals.findActive().length,
      activeInsights: this.options.storage.insights.findFresh().length,
    };
  }

  private async getStatus(): Promise<ButlerStatusPayload> {
    return this.getStatusSync();
  }
}

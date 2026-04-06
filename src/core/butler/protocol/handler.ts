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
}

export class ProtocolHandler {
  private readonly startedAt: number;

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
        return null;
      case 'action_result':
        this.options.logger?.debug?.('ProtocolHandler received action result', {
          actionId: message.actionId,
          success: message.success,
        });
        return null;
      case 'shutdown':
        this.options.scheduler.stop();
        return {
          type: 'status',
          id: randomUUID(),
          status: await this.getStatus(),
        };
      default:
        return null;
    }
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

  private async getStatus(): Promise<ButlerStatusPayload> {
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
}

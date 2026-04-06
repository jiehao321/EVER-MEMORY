import type {
  ButlerCycleTrace,
  ButlerInsight,
  ButlerMode,
  ButlerTrigger,
} from '../types.js';

export type ButlerMessage =
  | ButlerEventMessage
  | ButlerResponseMessage
  | ButlerActionMessage
  | ButlerActionResultMessage
  | ButlerQuestionMessage
  | ButlerAnswerMessage
  | ButlerStatusMessage
  | ButlerShutdownMessage;

export interface ButlerEventMessage {
  type: 'event';
  id: string;
  event: ButlerEvent;
}

export interface ButlerResponseMessage {
  type: 'response';
  id: string;
  requestId: string;
  result: ButlerResponse;
}

export interface ButlerActionMessage {
  type: 'action';
  id: string;
  action: { type: string; params: Record<string, unknown> };
  tier: 'auto' | 'confirm';
}

export interface ButlerActionResultMessage {
  type: 'action_result';
  id: string;
  actionId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface ButlerQuestionMessage {
  type: 'question';
  id: string;
  questionText: string;
  context?: string;
  importance: number;
}

export interface ButlerAnswerMessage {
  type: 'answer';
  id: string;
  questionId: string;
  answer: string;
}

export interface ButlerStatusMessage {
  type: 'status';
  id: string;
  status: ButlerStatusPayload;
}

export interface ButlerShutdownMessage {
  type: 'shutdown';
  id: string;
  reason?: string;
}

export type ButlerEvent =
  | { kind: 'session_started'; sessionId: string; scope?: Record<string, unknown> }
  | { kind: 'message'; text: string; sessionId: string }
  | { kind: 'session_ended'; sessionId: string }
  | { kind: 'tool_result'; toolName: string; result: unknown }
  | { kind: 'user_feedback'; insightId: string; rating: 'helpful' | 'not_helpful' | 'dismiss' }
  | { kind: 'tick' };

export interface ButlerResponse {
  cycleTrace?: ButlerCycleTrace;
  contextXml?: string;
  insights?: ButlerInsight[];
  error?: string;
}

export interface ButlerStatusPayload {
  mode: ButlerMode;
  uptime: number;
  totalCycles: number;
  pendingTasks: number;
  activeGoals: number;
  activeInsights: number;
}

export type ButlerProtocolTrigger = ButlerTrigger;

import type { BootBriefing } from './briefing.js';
import type { BehaviorRule } from './behavior.js';
import type { IntentRecord } from './intent.js';
import type { MemoryItem, MemoryScope, RecallResult } from './memory.js';
import type { ExperienceLog, ReflectionRecord } from './reflection.js';

export interface SessionStartInput {
  sessionId: string;
  userId?: string;
  chatId?: string;
  project?: string;
  channel?: string;
}

export interface InteractionRuntimeContext {
  sessionId: string;
  messageId?: string;
  scope: MemoryScope;
  intent: IntentRecord;
  recalledItems: MemoryItem[];
  appliedBehaviorRules?: BehaviorRule[];
  updatedAt: string;
}

export interface RuntimeSessionContext {
  sessionId: string;
  scope: MemoryScope;
  bootBriefing?: BootBriefing;
  activeBehaviorRules?: BehaviorRule[];
  interaction?: InteractionRuntimeContext;
}

export interface SessionStartResult {
  sessionId: string;
  scope: MemoryScope;
  briefing: BootBriefing;
  behaviorRules?: BehaviorRule[];
}

export interface MessageReceivedInput {
  sessionId: string;
  messageId?: string;
  text: string;
  scope?: MemoryScope;
  channel?: string;
  contexts?: string[];
  recallLimit?: number;
}

export interface MessageReceivedResult {
  sessionId: string;
  messageId?: string;
  intent: IntentRecord;
  recall: RecallResult;
  behaviorRules?: BehaviorRule[];
}

export interface SessionEndInput {
  sessionId: string;
  messageId?: string;
  scope?: MemoryScope;
  inputText?: string;
  actionSummary?: string;
  outcomeSummary?: string;
  evidenceRefs?: string[];
  forceReflect?: boolean;
}

export interface SessionEndResult {
  sessionId: string;
  experience: ExperienceLog;
  reflection?: ReflectionRecord;
  promotedRules?: BehaviorRule[];
  autoMemory?: {
    generated: number;
    accepted: number;
    rejected: number;
    storedIds: string[];
    rejectedReasons: string[];
    generatedByKind?: Partial<Record<string, number>>;
    acceptedByKind?: Partial<Record<string, number>>;
  };
  rejectedRules?: Array<{
    statement: string;
    reason: string;
  }>;
}

import type { DebugRepository } from '../storage/debugRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ExperienceService } from '../core/reflection/experience.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { MemoryService } from '../core/memory/service.js';
import type { IntentRecord, MemoryStoreInput } from '../types.js';
import type { SessionEndInput, SessionEndResult } from '../types.js';
import { clearSessionContext, getInteractionContext } from '../runtime/context.js';

function nowIso(): string {
  return new Date().toISOString();
}

const PROJECT_PATTERNS = [
  /\b(project|phase|milestone|roadmap|plan)\b/i,
  /(项目|阶段|里程碑|路线图|计划|推进|下一步)/,
];

const CORRECTION_PATTERNS = [
  /\b(i mean|correction|to be clear)\b/i,
  /(不是|更正|纠正|准确来说|修正一下)/,
];

const DECISION_PATTERNS = [
  /\b(decide|decided|choose|selected|final)\b/i,
  /(决定|定为|采用|改为|最终方案)/,
];

const PREFERENCE_PATTERNS = [
  /\b(i prefer|i like|i want)\b/i,
  /(我偏好|我喜欢|希望你|我想要)/,
];

const TEST_NOISE_PATTERNS = [
  /\bopenclaw-smoke\b/i,
  /\bE2E-\d+/i,
  /\bevermemory_(store|recall|status)\b/i,
  /请调用\s*(evermemory_store|evermemory_recall|evermemory_status)/,
  /skills store policy \(operator configured\)/i,
  /AGENTS\.md instructions/i,
  /do not claim exclusivity/i,
];

function clip(value: string | undefined, max = 140): string {
  if (!value) {
    return '';
  }
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}

function containsAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function shouldSkipAutoCapture(text: string): boolean {
  return containsAny(text, TEST_NOISE_PATTERNS);
}

function normalizeUserInput(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/^\[[^\]]+\]\s*/u, '')
    .trim();
}

function normalizeAssistantOutput(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/^\[\[reply_to_current\]\]\s*/u, '')
    .trim();
}

function buildAutoMemoryCandidates(
  input: SessionEndInput,
  intent: IntentRecord | undefined,
  correctionTriggered: boolean,
): MemoryStoreInput[] {
  const preferredInputText = normalizeUserInput(intent?.rawText);
  const fallbackInputText = normalizeUserInput(input.inputText);
  const inputText = clip(preferredInputText || fallbackInputText, 220);
  const actionSummary = clip(normalizeAssistantOutput(input.actionSummary), 220);
  const outcomeSummary = clip(input.outcomeSummary, 120);
  const combined = `${inputText} ${actionSummary}`.trim();
  if (!combined || shouldSkipAutoCapture(combined)) {
    return [];
  }

  const scope = input.scope ?? {};
  const source: MemoryStoreInput['source'] = {
    kind: 'summary',
    actor: 'system',
    sessionId: input.sessionId,
    messageId: input.messageId,
  };
  const candidates: MemoryStoreInput[] = [];
  const projectName = scope.project;

  const isProjectLike = containsAny(combined, PROJECT_PATTERNS)
    || intent?.intent.type === 'planning';
  if (isProjectLike) {
    const parts = [
      projectName ? `项目(${projectName})` : '项目',
      inputText ? `输入: ${inputText}` : undefined,
      actionSummary ? `执行: ${actionSummary}` : undefined,
      outcomeSummary ? `结果: ${outcomeSummary}` : undefined,
    ].filter((part): part is string => Boolean(part));
    candidates.push({
      content: `项目状态更新：${parts.join('；')}`,
      type: 'project',
      lifecycle: 'episodic',
      scope,
      source,
      evidence: { references: input.evidenceRefs ?? [] },
      tags: ['auto_capture', 'project_state', projectName ?? 'project'],
    });
  }

  const correctionHint = intent?.intent.type === 'correction'
    || containsAny(inputText, CORRECTION_PATTERNS)
    || ((intent?.signals.correctionSignal ?? 0) >= 0.85)
    || (correctionTriggered && containsAny(combined, CORRECTION_PATTERNS));
  if (correctionHint) {
    candidates.push({
      content: `纠正约束：当用户提出更正时，先复述修正点并确认，再继续执行。最近更正：${inputText || '未提供'}`,
      type: 'constraint',
      lifecycle: 'semantic',
      scope,
      source,
      evidence: { references: input.evidenceRefs ?? [] },
      tags: ['auto_capture', 'correction_lesson'],
    });
  }

  const preferenceHint = (intent?.intent.type === 'preference')
    || (intent?.signals.preferenceRelevance ?? 0) >= 0.75
    || containsAny(combined, PREFERENCE_PATTERNS);
  if (preferenceHint && inputText) {
    candidates.push({
      content: `用户偏好记录：${inputText}`,
      type: 'preference',
      lifecycle: 'semantic',
      scope,
      source,
      evidence: { references: input.evidenceRefs ?? [] },
      tags: ['auto_capture', 'user_preference'],
    });
  }

  const decisionHint = containsAny(combined, DECISION_PATTERNS)
    || intent?.intent.type === 'planning';
  if (decisionHint && actionSummary) {
    candidates.push({
      content: `决策与执行记录：${actionSummary}${outcomeSummary ? `；结果：${outcomeSummary}` : ''}`,
      type: 'decision',
      lifecycle: 'semantic',
      scope,
      source,
      evidence: { references: input.evidenceRefs ?? [] },
      tags: ['auto_capture', 'decision'],
    });
  }

  const deduped = new Map<string, MemoryStoreInput>();
  for (const candidate of candidates) {
    const key = candidate.content.trim();
    if (key.length < 8 || deduped.has(key)) {
      continue;
    }
    deduped.set(key, candidate);
  }
  return Array.from(deduped.values());
}

function pickTriggerKind(input: SessionEndInput, correction: boolean, repeat: boolean) {
  if (correction) {
    return 'correction' as const;
  }
  if (repeat) {
    return 'repeat-pattern' as const;
  }
  if (input.forceReflect) {
    return 'manual-review' as const;
  }
  return null;
}

export function handleSessionEnd(
  input: SessionEndInput,
  experienceService: ExperienceService,
  reflectionService: ReflectionService,
  behaviorService: BehaviorService,
  memoryService: MemoryService,
  debugRepo?: DebugRepository,
): SessionEndResult {
  const experience = experienceService.log({
    sessionId: input.sessionId,
    messageId: input.messageId,
    inputText: input.inputText,
    actionSummary: input.actionSummary,
    outcomeSummary: input.outcomeSummary,
    evidenceRefs: input.evidenceRefs,
  });

  const triggerKind = pickTriggerKind(
    input,
    experience.indicators.userCorrection,
    experience.indicators.repeatMistakeSignal,
  );

  const reflection = triggerKind
    ? reflectionService.reflect({
        triggerKind,
        sessionId: input.sessionId,
        experienceIds: [experience.id],
        mode: 'light',
      }).reflection ?? undefined
    : undefined;
  const promotionResult = reflection
    ? behaviorService.promoteFromReflection({
        reflectionId: reflection.id,
        appliesTo: {
          userId: input.scope?.userId,
        },
      })
    : undefined;
  const reviewedReflection = reflection
    ? {
        ...reflection,
        state: {
          ...reflection.state,
          promoted: reflection.state.promoted || (promotionResult?.promotedRules.length ?? 0) > 0,
          rejected: (promotionResult?.promotedRules.length ?? 0) === 0,
          reviewedAt: promotionResult ? nowIso() : reflection.state.reviewedAt,
        },
      }
    : undefined;

  const interaction = getInteractionContext(input.sessionId);
  const memoryCandidates = buildAutoMemoryCandidates(
    input,
    interaction?.intent,
    experience.indicators.userCorrection || experience.indicators.repeatMistakeSignal,
  );
  const storedIds: string[] = [];
  const rejectedReasons: string[] = [];
  for (const candidate of memoryCandidates) {
    const result = memoryService.store(candidate, input.scope);
    if (result.accepted && result.memory) {
      storedIds.push(result.memory.id);
    } else {
      rejectedReasons.push(result.reason);
    }
  }

  debugRepo?.log('session_end_processed', input.sessionId, {
    sessionId: input.sessionId,
    experienceId: experience.id,
    reflectionId: reviewedReflection?.id,
    reflected: Boolean(reviewedReflection),
    promotedRules: promotionResult?.promotedRules.length ?? 0,
    autoMemoryGenerated: memoryCandidates.length,
    autoMemoryAccepted: storedIds.length,
    autoMemoryRejected: rejectedReasons.length,
  });

  // Clear session context to prevent memory leak
  clearSessionContext(input.sessionId);

  return {
    sessionId: input.sessionId,
    experience,
    reflection: reviewedReflection,
    promotedRules: promotionResult?.promotedRules,
    autoMemory: {
      generated: memoryCandidates.length,
      accepted: storedIds.length,
      rejected: rejectedReasons.length,
      storedIds,
      rejectedReasons,
    },
    rejectedRules: promotionResult?.rejected,
  };
}

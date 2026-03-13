import type { DebugRepository } from '../storage/debugRepo.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ExperienceService } from '../core/reflection/experience.js';
import type { ReflectionService } from '../core/reflection/service.js';
import type { MemoryService } from '../core/memory/service.js';
import type {
  ExperienceLog,
  IntentRecord,
  MemoryStoreInput,
  ReflectionRecord,
} from '../types.js';
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

const CONSTRAINT_PATTERNS = [
  /\b(don't|do not|never|always|must)\b/i,
  /(不要|别|务必|必须|一律|先确认)/,
];

const NEXT_STEP_PATTERNS = [
  /\b(next step|follow up|todo|to do|then)\b/i,
  /(下一步|接下来|后续|待办|跟进)/,
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

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function stripExperiencePlaceholder(value: string | undefined): string {
  const normalized = (value ?? '').trim();
  if (!normalized || normalized.startsWith('No ')) {
    return '';
  }
  return normalized;
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

type AutoMemoryCandidateKind =
  | 'project_state'
  | 'decision'
  | 'explicit_constraint'
  | 'user_preference'
  | 'next_step'
  | 'project_summary';

interface AutoMemoryCandidate {
  kind: AutoMemoryCandidateKind;
  memory: MemoryStoreInput;
}

function buildProjectSummaryContent(input: {
  projectName?: string;
  status: string;
  keyConstraint: string;
  recentDecision: string;
  nextStep: string;
}): string {
  const projectName = input.projectName ?? 'current';
  return `项目连续性摘要（${projectName}）：状态：${input.status}；关键约束：${input.keyConstraint}；最近决策：${input.recentDecision}；下一步：${input.nextStep}`;
}

function deriveNextStep(
  input: SessionEndInput,
  reflection: ReflectionRecord | undefined,
  sourceText: string,
): string {
  const fromReflection = clip(reflection?.analysis.nextTimeRecommendation, 120);
  if (fromReflection) {
    return fromReflection;
  }

  const fromInput = clip(input.inputText, 120);
  if (fromInput && containsAny(fromInput, NEXT_STEP_PATTERNS)) {
    return fromInput;
  }

  const fromAction = clip(normalizeAssistantOutput(input.actionSummary), 120);
  if (fromAction && containsAny(fromAction, NEXT_STEP_PATTERNS)) {
    return fromAction;
  }

  if (containsAny(sourceText, NEXT_STEP_PATTERNS)) {
    return clip(sourceText, 120);
  }

  return '';
}

function countByKind(
  kinds: AutoMemoryCandidateKind[],
): Partial<Record<AutoMemoryCandidateKind, number>> {
  return kinds.reduce((acc, kind) => {
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<AutoMemoryCandidateKind, number>>);
}

function buildAutoMemoryCandidates(
  input: SessionEndInput,
  context: {
    intent?: IntentRecord;
    experience: ExperienceLog;
    reflection?: ReflectionRecord;
  },
): AutoMemoryCandidate[] {
  const intent = context.intent;
  const experience = context.experience;
  const reflection = context.reflection;
  const preferredInputText = normalizeUserInput(intent?.rawText);
  const fallbackInputText = normalizeUserInput(input.inputText || stripExperiencePlaceholder(experience.inputSummary));
  const inputText = clip(preferredInputText || fallbackInputText, 220);
  const actionSummary = clip(
    normalizeAssistantOutput(input.actionSummary || stripExperiencePlaceholder(experience.actionSummary)),
    220,
  );
  const outcomeSummary = clip(input.outcomeSummary || stripExperiencePlaceholder(experience.outcomeSummary), 120);
  const combined = [inputText, actionSummary, outcomeSummary].filter(Boolean).join(' ').trim();
  if (!combined || shouldSkipAutoCapture(combined)) {
    return [];
  }

  const scope = input.scope ?? {};
  const evidenceReferences = dedupeStrings([
    ...(input.evidenceRefs ?? []),
    ...(reflection?.evidence.refs ?? []),
    ...experience.evidenceRefs,
  ]);
  const sourceBase = {
    actor: 'system' as const,
    sessionId: input.sessionId,
    messageId: input.messageId,
  };
  const sourceRuntimeProject: MemoryStoreInput['source'] = {
    ...sourceBase,
    kind: 'runtime_project',
  };
  const sourceRuntimeUser: MemoryStoreInput['source'] = {
    ...sourceBase,
    kind: 'runtime_user',
  };
  const sourceReflectionDerived: MemoryStoreInput['source'] = {
    ...sourceBase,
    kind: 'reflection_derived',
  };
  const candidates: AutoMemoryCandidate[] = [];
  const projectName = scope.project;

  const isProjectLike = Boolean(projectName)
    || containsAny(combined, PROJECT_PATTERNS)
    || intent?.intent.type === 'planning'
    || intent?.intent.type === 'status_update';
  const correctionHint = intent?.intent.type === 'correction'
    || containsAny(inputText, CORRECTION_PATTERNS)
    || ((intent?.signals.correctionSignal ?? 0) >= 0.85)
    || experience.indicators.userCorrection
    || experience.indicators.repeatMistakeSignal;
  const constraintHint = correctionHint
    || containsAny(inputText, CONSTRAINT_PATTERNS)
    || containsAny(combined, CONSTRAINT_PATTERNS)
    || Boolean(reflection?.analysis.nextTimeRecommendation);
  const decisionHint = containsAny(combined, DECISION_PATTERNS)
    || intent?.intent.type === 'planning'
    || intent?.intent.type === 'status_update';
  const preferenceHint = (intent?.intent.type === 'preference')
    || (intent?.signals.preferenceRelevance ?? 0) >= 0.75
    || containsAny(combined, PREFERENCE_PATTERNS);
  const nextStep = deriveNextStep(input, reflection, combined);
  const nextStepHint = Boolean(nextStep);
  const keyConstraint = clip(
    reflection?.analysis.nextTimeRecommendation
      || (constraintHint ? '先复述修正点并确认，再继续执行。' : ''),
    120,
  );
  const recentDecision = clip(actionSummary || inputText, 120);
  const projectStatus = clip(outcomeSummary || actionSummary || inputText, 120);

  if (isProjectLike) {
    const parts = [
      projectName ? `项目(${projectName})` : '项目',
      inputText ? `输入: ${inputText}` : undefined,
      actionSummary ? `执行: ${actionSummary}` : undefined,
      outcomeSummary ? `结果: ${outcomeSummary}` : undefined,
    ].filter((part): part is string => Boolean(part));
    candidates.push({
      kind: 'project_state',
      memory: {
        content: `项目状态更新：${parts.join('；')}`,
        type: 'project',
        lifecycle: 'episodic',
        scope,
        source: sourceRuntimeProject,
        evidence: { references: evidenceReferences },
        tags: ['auto_capture', 'project_state', projectName ?? 'project'],
        relatedEntities: projectName ? [projectName] : [],
      },
    });
  }

  if (decisionHint && actionSummary) {
    candidates.push({
      kind: 'decision',
      memory: {
        content: `最近决策：${actionSummary}${outcomeSummary ? `；结果：${outcomeSummary}` : ''}`,
        type: 'decision',
        lifecycle: 'semantic',
        scope,
        source: sourceRuntimeProject,
        evidence: { references: evidenceReferences },
        tags: ['auto_capture', 'decision'],
        relatedEntities: projectName ? [projectName] : [],
      },
    });
  }

  if (constraintHint) {
    candidates.push({
      kind: 'explicit_constraint',
      memory: {
        content: `关键约束：${keyConstraint || '先确认关键约束，再执行。'}${inputText ? ` 最近输入：${inputText}` : ''}`,
        type: 'constraint',
        lifecycle: 'semantic',
        scope,
        source: sourceReflectionDerived,
        evidence: { references: evidenceReferences },
        tags: ['auto_capture', correctionHint ? 'correction_lesson' : 'explicit_constraint'],
        relatedEntities: projectName ? [projectName] : [],
      },
    });
  }

  if (preferenceHint && inputText) {
    candidates.push({
      kind: 'user_preference',
      memory: {
        content: `用户偏好记录：${inputText}`,
        type: 'preference',
        lifecycle: 'semantic',
        scope,
        source: sourceRuntimeUser,
        evidence: { references: evidenceReferences },
        tags: ['auto_capture', 'user_preference'],
        relatedEntities: projectName ? [projectName] : [],
      },
    });
  }

  if (nextStepHint) {
    candidates.push({
      kind: 'next_step',
      memory: {
        content: `下一步：${nextStep}`,
        type: 'commitment',
        lifecycle: 'semantic',
        scope,
        source: sourceRuntimeProject,
        evidence: { references: evidenceReferences },
        tags: ['auto_capture', 'next_step'],
        relatedEntities: projectName ? [projectName] : [],
      },
    });
  }

  if (isProjectLike && projectStatus) {
    candidates.push({
      kind: 'project_summary',
      memory: {
        content: buildProjectSummaryContent({
          projectName,
          status: projectStatus,
          keyConstraint: keyConstraint || '确保关键约束先确认',
          recentDecision: recentDecision || '待补充',
          nextStep: nextStep || '待确认',
        }),
        type: 'summary',
        lifecycle: 'semantic',
        scope,
        source: sourceRuntimeProject,
        evidence: { references: evidenceReferences },
        tags: ['auto_capture', 'active_project_summary', 'project_continuity'],
        relatedEntities: projectName ? [projectName] : [],
      },
    });
  }

  const deduped = new Map<string, AutoMemoryCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.memory.content.trim()}`;
    if (candidate.memory.content.trim().length < 8 || deduped.has(key)) {
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
  const interaction = getInteractionContext(input.sessionId);
  const experience = experienceService.log({
    sessionId: input.sessionId,
    messageId: input.messageId,
    inputText: input.inputText,
    actionSummary: input.actionSummary,
    outcomeSummary: input.outcomeSummary,
    intent: interaction?.intent,
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

  const memoryCandidates = buildAutoMemoryCandidates(
    input,
    {
      intent: interaction?.intent,
      experience,
      reflection: reviewedReflection,
    },
  );
  const generatedByKind = countByKind(memoryCandidates.map((candidate) => candidate.kind));
  const acceptedByKind: Partial<Record<AutoMemoryCandidateKind, number>> = {};
  const acceptedIdsByKind: Partial<Record<AutoMemoryCandidateKind, string[]>> = {};
  const storedIds: string[] = [];
  const rejectedReasons: string[] = [];
  for (const candidate of memoryCandidates) {
    const result = memoryService.store(candidate.memory, input.scope);
    if (result.accepted && result.memory) {
      storedIds.push(result.memory.id);
      acceptedByKind[candidate.kind] = (acceptedByKind[candidate.kind] ?? 0) + 1;
      const ids = acceptedIdsByKind[candidate.kind] ?? [];
      ids.push(result.memory.id);
      acceptedIdsByKind[candidate.kind] = ids;
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
    autoMemoryGeneratedByKind: generatedByKind,
    autoMemoryAcceptedByKind: acceptedByKind,
    autoMemoryAcceptedIdsByKind: acceptedIdsByKind,
    projectSummaryGenerated: generatedByKind.project_summary ?? 0,
    projectSummaryAccepted: acceptedByKind.project_summary ?? 0,
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
      generatedByKind,
      acceptedByKind,
    },
    rejectedRules: promotionResult?.rejected,
  };
}

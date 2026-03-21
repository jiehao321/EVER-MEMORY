import type {
  ExperienceLog,
  IntentRecord,
  MemoryStoreInput,
  ReflectionRecord,
  SessionEndInput,
} from '../../types.js';
import {
  CONSTRAINT_PATTERNS,
  CORRECTION_PATTERNS,
  DECISION_PATTERNS,
  GENERIC_OUTCOME_PATTERNS,
  NEXT_STEP_PATTERNS,
  PREFERENCE_PATTERNS,
  PROJECT_COMPACT_PATTERNS,
  PROJECT_PATTERNS,
  PROJECT_STATUS_PATTERNS,
  TEST_NOISE_PATTERNS,
} from '../../patterns.js';
import {
  AUTO_CAPTURE_CLIP_DEFAULT,
  AUTO_CAPTURE_CLIP_INPUT,
  AUTO_CAPTURE_CLIP_OUTCOME,
  AUTO_CAPTURE_CORRECTION_SIGNAL_THRESHOLD,
  AUTO_CAPTURE_MIN_CONTENT_LENGTH,
  AUTO_CAPTURE_MIN_QUALITY,
  AUTO_CAPTURE_PREFERENCE_RELEVANCE_THRESHOLD,
  AUTO_CAPTURE_SUMMARY_MIN_SIGNALS,
} from '../../tuning.js';

export type AutoMemoryCandidateKind =
  | 'project_state'
  | 'decision'
  | 'explicit_constraint'
  | 'user_preference'
  | 'next_step'
  | 'project_summary';

export interface AutoMemoryCandidate {
  kind: AutoMemoryCandidateKind;
  memory: MemoryStoreInput;
}

export interface EvaluatedAutoMemoryCandidate extends AutoMemoryCandidate {
  quality: number;
}

export interface AutoCaptureContext {
  intent?: IntentRecord;
  experience: ExperienceLog;
  reflection?: ReflectionRecord;
}

function clip(value: string | undefined, max = AUTO_CAPTURE_CLIP_DEFAULT): string {
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

function buildProjectSummaryContent(input: {
  projectName?: string;
  status: string;
  keyConstraint?: string;
  recentDecision?: string;
  nextStep?: string;
}): string {
  const projectName = input.projectName ?? 'current';
  const parts = [`项目连续性摘要（${projectName}）`];
  const status = input.status?.trim();
  if (status) {
    parts.push(`状态：${status}`);
  }
  const keyConstraint = input.keyConstraint?.trim();
  if (keyConstraint && !keyConstraint.includes('确保关键')) {
    parts.push(`关键约束：${keyConstraint}`);
  }
  const recentDecision = input.recentDecision?.trim();
  if (recentDecision && recentDecision !== '待补充') {
    parts.push(`最近决策：${recentDecision}`);
  }
  const nextStep = input.nextStep?.trim();
  if (nextStep && nextStep !== '待确认') {
    parts.push(`下一步：${nextStep}`);
  }
  return parts.join('；');
}

function deriveNextStep(
  input: SessionEndInput,
  reflection: ReflectionRecord | undefined,
  sourceText: string,
): string {
  const fromReflection = clip(reflection?.analysis.nextTimeRecommendation, AUTO_CAPTURE_CLIP_OUTCOME);
  if (fromReflection) {
    return fromReflection;
  }

  const fromInput = clip(input.inputText, AUTO_CAPTURE_CLIP_OUTCOME);
  if (fromInput && containsAny(fromInput, NEXT_STEP_PATTERNS)) {
    return fromInput;
  }

  const fromAction = clip(normalizeAssistantOutput(input.actionSummary), AUTO_CAPTURE_CLIP_OUTCOME);
  if (fromAction && containsAny(fromAction, NEXT_STEP_PATTERNS)) {
    return fromAction;
  }

  const fromOutcome = clip(input.outcomeSummary, AUTO_CAPTURE_CLIP_OUTCOME);
  if (fromOutcome && containsAny(fromOutcome, NEXT_STEP_PATTERNS)) {
    return fromOutcome;
  }

  if (containsAny(sourceText, NEXT_STEP_PATTERNS)) {
    return clip(sourceText, AUTO_CAPTURE_CLIP_OUTCOME);
  }

  return '';
}

function isGenericOutcome(value: string): boolean {
  return GENERIC_OUTCOME_PATTERNS.some((pattern) => pattern.test(value.trim()));
}

function hasProjectStatusSignal(value: string): boolean {
  return containsAny(value, PROJECT_STATUS_PATTERNS);
}

function extractSummaryField(content: string, label: string): string {
  const start = content.indexOf(label);
  if (start === -1) {
    return '';
  }
  const valueStart = start + label.length;
  const delimiterIndex = content.indexOf('；', valueStart);
  const raw = delimiterIndex === -1 ? content.slice(valueStart) : content.slice(valueStart, delimiterIndex);
  return raw.trim();
}

function isPlaceholderFieldValue(value: string): boolean {
  const normalized = value.trim();
  return !normalized
    || normalized.startsWith('待')
    || normalized.includes('待补充')
    || normalized.includes('待确认')
    || normalized.startsWith('确保关键');
}

export function evaluateCandidateQuality(candidate: AutoMemoryCandidate): number {
  const content = candidate.memory.content.trim();
  if (content.length < AUTO_CAPTURE_MIN_CONTENT_LENGTH) {
    return 0;
  }

  switch (candidate.kind) {
    case 'project_summary': {
      if (content.includes('待补充') && content.includes('待确认')) {
        return 0;
      }
      const summaryFields = ['状态：', '关键约束：', '最近决策：', '下一步：'];
      const filled = summaryFields.filter((field) => {
        const value = extractSummaryField(content, field);
        return value && !isPlaceholderFieldValue(value);
      });
      return filled.length >= 3 ? 1 : 0;
    }

    case 'decision': {
      if (containsAny(content, DECISION_PATTERNS)) {
        return 1.0;
      }
      if (containsAny(content, GENERIC_OUTCOME_PATTERNS)) {
        return 0.3;
      }
      return 0.6;
    }

    case 'explicit_constraint': {
      if (containsAny(content, CONSTRAINT_PATTERNS)) {
        return 1.0;
      }
      return 0.4;
    }

    case 'user_preference': {
      if (containsAny(content, PREFERENCE_PATTERNS)) {
        return 1.0;
      }
      return 0.3;
    }

    case 'next_step': {
      if (containsAny(content, NEXT_STEP_PATTERNS)) {
        return 1.0;
      }
      return 0.3;
    }

    case 'project_state': {
      const parts = ['输入:', '执行:', '结果:'];
      const filledCount = parts.filter((part) => content.includes(part)).length;
      if (filledCount >= 2) {
        return 1.0;
      }
      if (filledCount === 1) {
        return 0.4;
      }
      return 0;
    }

    default:
      return 1;
  }
}

export function buildAutoMemoryCandidates(
  input: SessionEndInput,
  context: AutoCaptureContext,
): EvaluatedAutoMemoryCandidate[] {
  const intent = context.intent;
  const experience = context.experience;
  const reflection = context.reflection;
  const preferredInputText = normalizeUserInput(intent?.rawText);
  const fallbackInputText = normalizeUserInput(input.inputText || stripExperiencePlaceholder(experience.inputSummary));
  const inputText = clip(preferredInputText || fallbackInputText, AUTO_CAPTURE_CLIP_INPUT);
  const actionSummary = clip(
    normalizeAssistantOutput(input.actionSummary || stripExperiencePlaceholder(experience.actionSummary)),
    AUTO_CAPTURE_CLIP_INPUT,
  );
  const outcomeSummary = clip(
    input.outcomeSummary || stripExperiencePlaceholder(experience.outcomeSummary),
    AUTO_CAPTURE_CLIP_OUTCOME,
  );
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
    channel: input.channel,
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
    || ((intent?.signals.correctionSignal ?? 0) >= AUTO_CAPTURE_CORRECTION_SIGNAL_THRESHOLD)
    || experience.indicators.userCorrection
    || experience.indicators.repeatMistakeSignal;
  const constraintHint = correctionHint
    || containsAny(inputText, CONSTRAINT_PATTERNS)
    || containsAny(combined, CONSTRAINT_PATTERNS)
    || Boolean(reflection?.analysis.nextTimeRecommendation);
  const decisionHint = containsAny(combined, DECISION_PATTERNS)
    || containsAny(actionSummary, DECISION_PATTERNS)
    || containsAny(inputText, DECISION_PATTERNS);
  const preferenceHint = (intent?.intent.type === 'preference')
    || (intent?.signals.preferenceRelevance ?? 0) >= AUTO_CAPTURE_PREFERENCE_RELEVANCE_THRESHOLD
    || containsAny(combined, PREFERENCE_PATTERNS);
  const nextStep = deriveNextStep(input, reflection, combined);
  const nextStepHint = Boolean(nextStep);
  const keyConstraint = clip(
    reflection?.analysis.nextTimeRecommendation
      || (constraintHint ? '先复述修正点并确认，再继续执行。' : ''),
    AUTO_CAPTURE_CLIP_OUTCOME,
  );
  const fallbackDecisionSource = outcomeSummary && !isGenericOutcome(outcomeSummary) ? outcomeSummary : '';
  const recentDecisionSource = decisionHint ? (actionSummary || inputText) : fallbackDecisionSource;
  const recentDecision = recentDecisionSource ? clip(recentDecisionSource, AUTO_CAPTURE_CLIP_OUTCOME) : '';
  const projectStatusSource = [
    inputText && hasProjectStatusSignal(inputText) ? inputText : '',
    actionSummary && hasProjectStatusSignal(actionSummary) ? actionSummary : '',
    inputText && containsAny(inputText, PROJECT_COMPACT_PATTERNS) ? inputText : '',
    actionSummary && containsAny(actionSummary, PROJECT_COMPACT_PATTERNS) ? actionSummary : '',
    outcomeSummary && !isGenericOutcome(outcomeSummary) ? outcomeSummary : '',
  ].find((value) => Boolean(value)) ?? '';
  const projectStatus = clip(projectStatusSource, AUTO_CAPTURE_CLIP_OUTCOME);
  const summarySignalCount = [
    Boolean(projectStatus),
    Boolean(keyConstraint),
    Boolean(recentDecision),
    Boolean(nextStep),
  ].filter(Boolean).length;

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

  const hasCompactProjectSignal = Boolean(projectName)
    && Boolean(inputText)
    && Boolean(actionSummary)
    && (
      containsAny(inputText, PROJECT_COMPACT_PATTERNS)
      || containsAny(actionSummary, PROJECT_COMPACT_PATTERNS)
      || hasProjectStatusSignal(inputText)
      || hasProjectStatusSignal(actionSummary)
    );

  if (
    isProjectLike
    && projectStatus
    && (summarySignalCount >= AUTO_CAPTURE_SUMMARY_MIN_SIGNALS || hasCompactProjectSignal)
  ) {
    candidates.push({
      kind: 'project_summary',
      memory: {
        content: buildProjectSummaryContent({
          projectName,
          status: projectStatus,
          keyConstraint: keyConstraint || undefined,
          recentDecision: recentDecision || undefined,
          nextStep: nextStep || undefined,
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

  const deduped = new Map<string, EvaluatedAutoMemoryCandidate>();
  for (const candidate of candidates) {
    const content = candidate.memory.content.trim();
    const key = `${candidate.kind}:${content}`;
    const quality = evaluateCandidateQuality(candidate);
    if (quality < AUTO_CAPTURE_MIN_QUALITY || deduped.has(key)) {
      continue;
    }
    deduped.set(key, {
      ...candidate,
      quality,
    });
  }
  return Array.from(deduped.values());
}

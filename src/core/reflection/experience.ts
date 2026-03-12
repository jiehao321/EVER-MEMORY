import { randomUUID } from 'node:crypto';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { ExperienceRepository } from '../../storage/experienceRepo.js';
import type { ExperienceIndicators, ExperienceLog, ExperienceLogInput } from '../../types.js';
import {
  APPROVAL_CUE_EN_REGEX,
  APPROVAL_CUE_ZH_REGEX,
  CORRECTION_CUE_EN_REGEX,
  CORRECTION_CUE_ZH_REGEX,
  EXTERNAL_RISK_CUE_EN_REGEX,
  EXTERNAL_RISK_CUE_ZH_REGEX,
  HESITATION_CUE_EN_REGEX,
  HESITATION_CUE_ZH_REGEX,
  REPEAT_CUE_EN_REGEX,
  REPEAT_CUE_ZH_REGEX,
} from './patterns.js';

function nowIso(): string {
  return new Date().toISOString();
}

function summarizeText(text: string | undefined, fallback: string, maxLength = 240): string {
  const value = (text ?? '').trim();
  if (!value) {
    return fallback;
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function inferIndicators(input: ExperienceLogInput): ExperienceIndicators {
  const normalizedInput = (input.inputText ?? '').toLowerCase();
  const normalizedOutcome = (input.outcomeSummary ?? '').toLowerCase();
  const normalizedAction = (input.actionSummary ?? '').toLowerCase();

  const correctionSignal = input.intent?.signals.correctionSignal ?? 0;
  const preferenceSignal = input.intent?.signals.preferenceRelevance ?? 0;

  const userCorrection = correctionSignal >= 0.6
    || CORRECTION_CUE_ZH_REGEX.test(input.inputText ?? '')
    || CORRECTION_CUE_EN_REGEX.test(normalizedInput);

  const userApproval = APPROVAL_CUE_ZH_REGEX.test(input.outcomeSummary ?? '')
    || APPROVAL_CUE_EN_REGEX.test(normalizedOutcome)
    || preferenceSignal >= 0.7;

  const hesitation = HESITATION_CUE_ZH_REGEX.test(input.inputText ?? '')
    || HESITATION_CUE_EN_REGEX.test(normalizedInput);

  const externalActionRisk = EXTERNAL_RISK_CUE_ZH_REGEX.test(input.actionSummary ?? '')
    || EXTERNAL_RISK_CUE_EN_REGEX.test(normalizedAction);

  const repeatCue = REPEAT_CUE_ZH_REGEX.test(input.inputText ?? '')
    || REPEAT_CUE_ZH_REGEX.test(input.outcomeSummary ?? '')
    || REPEAT_CUE_EN_REGEX.test(normalizedInput)
    || REPEAT_CUE_EN_REGEX.test(normalizedOutcome);
  const repeatMistakeSignal = userCorrection && repeatCue && (hesitation || externalActionRisk);

  return {
    userCorrection,
    userApproval,
    hesitation,
    externalActionRisk,
    repeatMistakeSignal,
  };
}

function mergeIndicators(
  inferred: ExperienceIndicators,
  override: Partial<ExperienceIndicators> | undefined,
): ExperienceIndicators {
  if (!override) {
    return inferred;
  }

  return {
    userCorrection: override.userCorrection ?? inferred.userCorrection,
    userApproval: override.userApproval ?? inferred.userApproval,
    hesitation: override.hesitation ?? inferred.hesitation,
    externalActionRisk: override.externalActionRisk ?? inferred.externalActionRisk,
    repeatMistakeSignal: override.repeatMistakeSignal ?? inferred.repeatMistakeSignal,
  };
}

export class ExperienceService {
  constructor(
    private readonly experienceRepo: ExperienceRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  log(input: ExperienceLogInput): ExperienceLog {
    const inferred = inferIndicators(input);
    const indicators = mergeIndicators(inferred, input.indicators);
    const experience: ExperienceLog = {
      id: randomUUID(),
      sessionId: input.sessionId,
      messageId: input.messageId,
      createdAt: nowIso(),
      inputSummary: summarizeText(input.inputText, 'No input summary.'),
      actionSummary: summarizeText(input.actionSummary, 'No action summary.'),
      outcomeSummary: summarizeText(input.outcomeSummary, '', 240) || undefined,
      indicators,
      evidenceRefs: input.evidenceRefs ?? [],
    };

    this.experienceRepo.insert(experience);
    this.debugRepo?.log('experience_logged', experience.id, {
      sessionId: experience.sessionId,
      messageId: experience.messageId,
      indicators,
    });

    return experience;
  }
}

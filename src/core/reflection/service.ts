import { randomUUID } from 'node:crypto';
import { generateCandidateRules } from './candidateRules.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { ExperienceRepository } from '../../storage/experienceRepo.js';
import type { ReflectionRepository } from '../../storage/reflectionRepo.js';
import type {
  ExperienceLog,
  ReflectionRecord,
  ReflectionRunInput,
  ReflectionRunResult,
} from '../../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function summarizeAnalysis(triggerKind: ReflectionRecord['trigger']['kind'], experiences: ExperienceLog[]) {
  const correctionCount = experiences.filter((item) => item.indicators.userCorrection).length;
  const approvalCount = experiences.filter((item) => item.indicators.userApproval).length;
  const riskCount = experiences.filter((item) => item.indicators.externalActionRisk).length;
  const hesitationCount = experiences.filter((item) => item.indicators.hesitation).length;

  if (triggerKind === 'correction') {
    return {
      category: 'correction-handling',
      summary: `Detected ${correctionCount || 1} correction signal(s); response should prioritize explicit confirmation before next action.`,
      whatFailed: 'Correction handling was not explicit enough.',
      nextTimeRecommendation: '在接到纠正后，先复述修正点并确认，再继续执行。',
    };
  }

  if (triggerKind === 'success') {
    return {
      category: 'successful-pattern',
      summary: `Observed ${approvalCount || 1} approval signal(s); style/approach should be reused when context matches.`,
      whatWorked: 'Current strategy aligned with user expectations.',
      nextTimeRecommendation: '在同类任务中优先复用被确认有效的输出策略。',
    };
  }

  if (triggerKind === 'mistake' || riskCount > 0) {
    return {
      category: 'risk-control',
      summary: `Observed ${riskCount || 1} external risk signal(s); high-risk actions require stricter pre-execution checks.`,
      whatFailed: 'Risk gating before action was insufficient.',
      nextTimeRecommendation: '高风险动作缺少明确确认时，先问清再执行。',
    };
  }

  if (triggerKind === 'repeat-pattern') {
    return {
      category: 'repeat-pattern',
      summary: `Found repeated issue pattern across ${experiences.length} experience(s).`,
      whatFailed: 'Previously observed issue was not fully prevented.',
      nextTimeRecommendation: '重复问题出现两次及以上时，优先检索并应用最近反思结论。',
    };
  }

  return {
    category: hesitationCount > 0 ? 'clarity' : 'general-review',
    summary: `Manual review over ${experiences.length} experience(s) produced a lightweight reflection.`,
    whatWorked: approvalCount > 0 ? 'Some outputs were approved by user.' : undefined,
    whatFailed: correctionCount > 0 ? 'Some outputs required correction.' : undefined,
    nextTimeRecommendation: '在不确定场景下先澄清目标，再执行关键动作。',
  };
}

function computeConfidence(
  triggerKind: ReflectionRecord['trigger']['kind'],
  experiences: ExperienceLog[],
  evidenceRefs: string[],
  mode: NonNullable<ReflectionRunInput['mode']>,
): number {
  const base = (() => {
    switch (triggerKind) {
      case 'correction':
        return 0.82;
      case 'mistake':
        return 0.78;
      case 'success':
        return 0.76;
      case 'repeat-pattern':
        return 0.85;
      case 'manual-review':
      default:
        return 0.7;
    }
  })();

  const correctionCount = experiences.filter((item) => item.indicators.userCorrection).length;
  const approvalCount = experiences.filter((item) => item.indicators.userApproval).length;
  const recurrenceBoost = Math.min(0.1, Math.max(0, experiences.length - 1) * 0.03);
  const evidenceBoost = evidenceRefs.length >= 2 ? 0.05 : 0;
  const correctionBoost = correctionCount > 0 ? 0.04 : 0;
  const approvalBoost = approvalCount > 0 ? 0.03 : 0;
  const modePenalty = mode === 'full' ? 0 : 0.02;

  return clamp01(base + recurrenceBoost + evidenceBoost + correctionBoost + approvalBoost - modePenalty);
}

export class ReflectionService {
  constructor(
    private readonly experienceRepo: ExperienceRepository,
    private readonly reflectionRepo: ReflectionRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  reflect(input: ReflectionRunInput): ReflectionRunResult {
    const mode = input.mode ?? 'light';
    const limit = mode === 'full' ? 20 : 8;

    const resolved = this.resolveExperiences(input, limit);
    const experiences = resolved.experiences;
    const missingExperienceIds = resolved.missingExperienceIds;
    if (experiences.length === 0) {
      this.debugRepo?.log('reflection_skipped', undefined, {
        reason: missingExperienceIds.length > 0 ? 'missing_experience_refs' : 'no_experience',
        triggerKind: input.triggerKind,
        missingExperienceCount: missingExperienceIds.length,
        missingExperienceIds,
      });
      return {
        reflection: null,
        processedExperiences: 0,
      };
    }

    const evidenceRefs = dedupe(experiences.flatMap((item) => item.evidenceRefs));
    const analysis = summarizeAnalysis(input.triggerKind, experiences);
    const confidence = computeConfidence(input.triggerKind, experiences, evidenceRefs, mode);
    const threshold = mode === 'full' ? 0.7 : 0.55;

    if (confidence < threshold) {
      this.debugRepo?.log('reflection_skipped', undefined, {
        reason: 'low_confidence',
        confidence,
        threshold,
        triggerKind: input.triggerKind,
      });
      return {
        reflection: null,
        processedExperiences: experiences.length,
      };
    }

    const reflection: ReflectionRecord = {
      id: randomUUID(),
      createdAt: nowIso(),
      trigger: {
        kind: input.triggerKind,
        experienceIds: experiences.map((item) => item.id),
      },
      analysis,
      evidence: {
        refs: evidenceRefs,
        confidence,
        recurrenceCount: experiences.length,
      },
      candidateRules: [],
      state: {
        promoted: false,
        rejected: false,
      },
    };

    reflection.candidateRules = generateCandidateRules(input.triggerKind, experiences, reflection);
    this.reflectionRepo.insert(reflection);

    this.debugRepo?.log('reflection_created', reflection.id, {
      triggerKind: reflection.trigger.kind,
      confidence: reflection.evidence.confidence,
      recurrenceCount: reflection.evidence.recurrenceCount,
      candidateRules: reflection.candidateRules.length,
      missingExperienceCount: missingExperienceIds.length,
      missingExperienceIds,
    });

    return {
      reflection,
      processedExperiences: experiences.length,
    };
  }

  private resolveExperiences(
    input: ReflectionRunInput,
    limit: number,
  ): { experiences: ExperienceLog[]; missingExperienceIds: string[] } {
    if (input.experienceIds && input.experienceIds.length > 0) {
      const experiences: ExperienceLog[] = [];
      const missingExperienceIds: string[] = [];
      for (const id of input.experienceIds) {
        const experience = this.experienceRepo.findById(id);
        if (experience) {
          experiences.push(experience);
        } else {
          missingExperienceIds.push(id);
        }
      }
      return {
        experiences,
        missingExperienceIds,
      };
    }

    if (input.sessionId) {
      return {
        experiences: this.experienceRepo.listRecentBySession(input.sessionId, limit),
        missingExperienceIds: [],
      };
    }

    return {
      experiences: this.experienceRepo.listRecent(limit),
      missingExperienceIds: [],
    };
  }
}

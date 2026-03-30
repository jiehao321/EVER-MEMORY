import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { runMigrations } from '../../src/storage/migrations.js';
import type {
  BehaviorRule,
  ExperienceLog,
  MemoryItem,
  ProjectedProfile,
  ReflectionRecord,
} from '../../src/types.js';

export function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildMemory(overrides: Partial<MemoryItem> = {}): MemoryItem {
  const timestamp = overrides.timestamps?.createdAt ?? nowIso();
  return {
    id: overrides.id ?? randomUUID(),
    content: overrides.content ?? 'memory content',
    type: overrides.type ?? 'fact',
    lifecycle: overrides.lifecycle ?? 'episodic',
    source: {
      kind: overrides.source?.kind ?? 'test',
      actor: overrides.source?.actor,
      sessionId: overrides.source?.sessionId,
      messageId: overrides.source?.messageId,
      channel: overrides.source?.channel,
    },
    scope: {
      userId: overrides.scope?.userId,
      chatId: overrides.scope?.chatId,
      project: overrides.scope?.project,
      global: overrides.scope?.global ?? false,
    },
    scores: {
      confidence: overrides.scores?.confidence ?? 0.6,
      importance: overrides.scores?.importance ?? 0.5,
      explicitness: overrides.scores?.explicitness ?? 0.4,
    },
    timestamps: {
      createdAt: timestamp,
      updatedAt: overrides.timestamps?.updatedAt ?? timestamp,
      lastAccessedAt: overrides.timestamps?.lastAccessedAt,
    },
    state: {
      active: overrides.state?.active ?? true,
      archived: overrides.state?.archived ?? false,
      supersededBy: overrides.state?.supersededBy,
    },
    evidence: {
      excerpt: overrides.evidence?.excerpt,
      references: overrides.evidence?.references ?? [],
    },
    tags: overrides.tags ?? [],
    relatedEntities: overrides.relatedEntities ?? [],
    sourceGrade: overrides.sourceGrade ?? 'primary',
    stats: {
      accessCount: overrides.stats?.accessCount ?? 0,
      retrievalCount: overrides.stats?.retrievalCount ?? 0,
    },
  };
}

export function buildBehaviorRule(overrides: Partial<BehaviorRule> = {}): BehaviorRule {
  const timestamp = overrides.createdAt ?? nowIso();
  return {
    id: overrides.id ?? randomUUID(),
    statement: overrides.statement ?? 'Always confirm before high-risk actions.',
    createdAt: timestamp,
    updatedAt: overrides.updatedAt ?? timestamp,
    appliesTo: {
      userId: overrides.appliesTo?.userId,
      channel: overrides.appliesTo?.channel,
      intentTypes: overrides.appliesTo?.intentTypes ?? [],
      contexts: overrides.appliesTo?.contexts ?? [],
    },
    category: overrides.category ?? 'execution',
    priority: overrides.priority ?? 70,
    evidence: {
      reflectionIds: overrides.evidence?.reflectionIds ?? ['reflection-1'],
      memoryIds: overrides.evidence?.memoryIds ?? [],
      confidence: overrides.evidence?.confidence ?? 0.8,
      recurrenceCount: overrides.evidence?.recurrenceCount ?? 2,
    },
    lifecycle: {
      level: overrides.lifecycle?.level ?? 'baseline',
      maturity: overrides.lifecycle?.maturity ?? 'emerging',
      applyCount: overrides.lifecycle?.applyCount ?? 0,
      contradictionCount: overrides.lifecycle?.contradictionCount ?? 0,
      overrideCount: overrides.lifecycle?.overrideCount ?? 0,
      lastAppliedAt: overrides.lifecycle?.lastAppliedAt,
      lastContradictedAt: overrides.lifecycle?.lastContradictedAt,
      lastOverriddenAt: overrides.lifecycle?.lastOverriddenAt,
      lastReviewedAt: overrides.lifecycle?.lastReviewedAt,
      stale: overrides.lifecycle?.stale ?? false,
      staleness: overrides.lifecycle?.staleness ?? 'fresh',
      decayScore: overrides.lifecycle?.decayScore ?? 0,
      autoSuspended: overrides.lifecycle?.autoSuspended ?? false,
      autoSuspendedAt: overrides.lifecycle?.autoSuspendedAt,
      frozenAt: overrides.lifecycle?.frozenAt,
      freezeReason: overrides.lifecycle?.freezeReason,
      expiresAt: overrides.lifecycle?.expiresAt,
    },
    state: {
      active: overrides.state?.active ?? true,
      deprecated: overrides.state?.deprecated ?? false,
      frozen: overrides.state?.frozen ?? false,
      supersededBy: overrides.state?.supersededBy,
      statusReason: overrides.state?.statusReason,
      statusSourceReflectionId: overrides.state?.statusSourceReflectionId,
      statusChangedAt: overrides.state?.statusChangedAt,
    },
    trace: overrides.trace,
    tags: overrides.tags ?? [],
  };
}

export function buildProfile(overrides: Partial<ProjectedProfile> = {}): ProjectedProfile {
  return {
    userId: overrides.userId ?? 'user-1',
    updatedAt: overrides.updatedAt ?? nowIso(),
    stable: {
      displayName: overrides.stable?.displayName,
      preferredAddress: overrides.stable?.preferredAddress,
      timezone: overrides.stable?.timezone,
      explicitPreferences: overrides.stable?.explicitPreferences ?? {},
      explicitConstraints: overrides.stable?.explicitConstraints ?? [],
    },
    derived: {
      communicationStyle: overrides.derived?.communicationStyle,
      likelyInterests: overrides.derived?.likelyInterests ?? [],
      workPatterns: overrides.derived?.workPatterns ?? [],
    },
    behaviorHints: overrides.behaviorHints ?? [],
  };
}

export function buildExperience(overrides: Partial<ExperienceLog> = {}): ExperienceLog {
  return {
    id: overrides.id ?? randomUUID(),
    sessionId: overrides.sessionId,
    messageId: overrides.messageId,
    createdAt: overrides.createdAt ?? nowIso(),
    inputSummary: overrides.inputSummary ?? 'Input summary',
    actionSummary: overrides.actionSummary ?? 'Action summary',
    outcomeSummary: overrides.outcomeSummary,
    indicators: {
      userCorrection: overrides.indicators?.userCorrection ?? false,
      userApproval: overrides.indicators?.userApproval ?? false,
      hesitation: overrides.indicators?.hesitation ?? false,
      externalActionRisk: overrides.indicators?.externalActionRisk ?? false,
      repeatMistakeSignal: overrides.indicators?.repeatMistakeSignal ?? false,
    },
    evidenceRefs: overrides.evidenceRefs ?? [],
  };
}

export function buildReflection(overrides: Partial<ReflectionRecord> = {}): ReflectionRecord {
  return {
    id: overrides.id ?? randomUUID(),
    createdAt: overrides.createdAt ?? nowIso(),
    trigger: {
      kind: overrides.trigger?.kind ?? 'manual-review',
      experienceIds: overrides.trigger?.experienceIds ?? [],
    },
    analysis: {
      category: overrides.analysis?.category ?? 'process',
      summary: overrides.analysis?.summary ?? 'Reflection summary',
      whatWorked: overrides.analysis?.whatWorked,
      whatFailed: overrides.analysis?.whatFailed,
      nextTimeRecommendation: overrides.analysis?.nextTimeRecommendation,
    },
    evidence: {
      refs: overrides.evidence?.refs ?? [],
      confidence: overrides.evidence?.confidence ?? 0.7,
      recurrenceCount: overrides.evidence?.recurrenceCount ?? 1,
    },
    candidateRules: overrides.candidateRules ?? [],
    state: {
      promoted: overrides.state?.promoted ?? false,
      rejected: overrides.state?.rejected ?? false,
      reviewedAt: overrides.state?.reviewedAt,
    },
  };
}

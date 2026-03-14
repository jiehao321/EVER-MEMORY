import type { DebugRepository } from '../storage/debugRepo.js';
import type {
  DebugEvent,
  EverMemoryExplainToolInput,
  EverMemoryExplainToolResult,
  EverMemoryExplainTopic,
} from '../types.js';

const EVENT_KINDS_BY_TOPIC: Record<EverMemoryExplainTopic, Array<DebugEvent['kind']>> = {
  write: ['memory_write_decision', 'memory_write_rejected'],
  retrieval: ['retrieval_executed'],
  rule: ['rule_promoted', 'rule_rejected', 'rule_frozen', 'rule_deprecated', 'rule_rolled_back'],
  session: ['session_end_processed'],
  archive: ['memory_archived', 'memory_restore_reviewed', 'memory_restore_applied'],
  intent: ['intent_generated'],
};

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function toString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((entry): entry is string => typeof entry === 'string');
  return items;
}

function explainWrite(event: DebugEvent): EverMemoryExplainToolResult['items'][number] {
  if (event.kind === 'memory_write_rejected') {
    const reason = toString(event.payload.reason) ?? 'unknown_reason';
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'Why was this memory write rejected?',
      answer: `Write was rejected because: ${reason}.`,
      evidence: {
        accepted: false,
        reason,
      },
      meta: {
        outcome: 'rejected',
        affectedCount: 0,
        reason,
        categories: ['memory_write'],
      },
    };
  }

  const accepted = toBoolean(event.payload.accepted) ?? true;
  const reason = toString(event.payload.reason) ?? 'accepted_by_policy';
  const merged = toNumber(event.payload.merged) ?? 0;
  const archivedStale = toNumber(event.payload.archivedStale) ?? 0;
  const profileRecomputed = toBoolean(event.payload.profileRecomputed) ?? false;

  return {
    createdAt: event.createdAt,
    kind: event.kind,
    entityId: event.entityId,
    question: 'Why was this memory write accepted?',
    answer: accepted
      ? `Write accepted by policy (${reason}); merged=${merged}, archivedStale=${archivedStale}, profileRecomputed=${profileRecomputed}.`
      : `Write decision is non-accepted (${reason}).`,
    evidence: {
      accepted,
      reason,
      merged,
      archivedStale,
      profileRecomputed,
    },
    meta: {
      outcome: accepted ? 'accepted' : 'rejected',
      affectedCount: accepted ? 1 : 0,
      reason,
      categories: ['memory_write'],
    },
  };
}

function explainRetrieval(event: DebugEvent): EverMemoryExplainToolResult['items'][number] {
  const query = toString(event.payload.query) ?? '';
  const mode = toString(event.payload.mode) ?? 'keyword';
  const requestedMode = toString(event.payload.requestedMode) ?? mode;
  const returned = toNumber(event.payload.returned) ?? 0;
  const candidates = toNumber(event.payload.candidates) ?? 0;

  return {
    createdAt: event.createdAt,
    kind: event.kind,
    entityId: event.entityId,
    question: 'Why were these memories retrieved?',
    answer: `Retrieval ran in ${mode} mode (requested=${requestedMode}) and returned ${returned} item(s) from ${candidates} candidate(s).`,
    evidence: {
      query,
      requestedMode,
      mode,
      returned,
      candidates,
      semanticEnabled: toBoolean(event.payload.semanticEnabled),
      semanticHits: toNumber(event.payload.semanticHits),
      topScores: event.payload.topScores,
    },
    meta: {
      outcome: 'applied',
      affectedCount: returned,
      reason: mode,
      categories: ['retrieval'],
    },
  };
}

function explainRule(event: DebugEvent): EverMemoryExplainToolResult['items'][number] {
  if (event.kind === 'rule_rejected') {
    const reason = toString(event.payload.reason) ?? 'unknown_reason';
    const statement = toString(event.payload.statement);
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'Why was this rule rejected?',
      answer: `Rule candidate was rejected: ${reason}.`,
      evidence: {
        statement,
        reason,
        reflectionId: toString(event.payload.reflectionId),
      },
      meta: {
        outcome: 'rejected',
        affectedCount: 0,
        reason,
        categories: ['rule_governance'],
      },
    };
  }

  if (event.kind === 'rule_frozen') {
    const reason = toString(event.payload.reason) ?? 'freeze_requested';
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'Why was this rule frozen?',
      answer: `Rule was frozen and removed from active loading because: ${reason}.`,
      evidence: {
        reason,
        reflectionId: toString(event.payload.reflectionId),
        statusChangedAt: toString(event.payload.statusChangedAt),
        replacementRuleId: toString(event.payload.replacementRuleId),
      },
      meta: {
        outcome: 'skipped',
        affectedCount: 0,
        reason,
        categories: ['rule_governance'],
      },
    };
  }

  if (event.kind === 'rule_deprecated') {
    const reason = toString(event.payload.reason) ?? 'deprecated_requested';
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'Why was this rule deprecated?',
      answer: `Rule was deprecated because: ${reason}.`,
      evidence: {
        reason,
        reflectionId: toString(event.payload.reflectionId),
        statusChangedAt: toString(event.payload.statusChangedAt),
        replacementRuleId: toString(event.payload.replacementRuleId),
      },
      meta: {
        outcome: 'skipped',
        affectedCount: 0,
        reason,
        categories: ['rule_governance'],
      },
    };
  }

  if (event.kind === 'rule_rolled_back') {
    const reason = toString(event.payload.reason) ?? 'rollback_requested';
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'Why was this rule rolled back?',
      answer: `Rule was rolled back because: ${reason}.`,
      evidence: {
        reason,
        reflectionId: toString(event.payload.reflectionId),
        statusChangedAt: toString(event.payload.statusChangedAt),
        replacementRuleId: toString(event.payload.replacementRuleId),
      },
      meta: {
        outcome: 'rejected',
        affectedCount: 0,
        reason,
        categories: ['rule_governance'],
      },
    };
  }

  const category = toString(event.payload.category) ?? 'unknown';
  const priority = toNumber(event.payload.priority);
  const confidence = toNumber(event.payload.confidence);
  return {
    createdAt: event.createdAt,
    kind: event.kind,
    entityId: event.entityId,
    question: 'Why was this rule promoted?',
    answer: `Rule promoted with category=${category}, priority=${priority ?? 'n/a'}, confidence=${confidence ?? 'n/a'}.`,
    evidence: {
      category,
      priority,
      confidence,
      reflectionId: toString(event.payload.reflectionId),
      promotedReason: toString(event.payload.promotedReason),
      reviewSourceRefs: event.payload.reviewSourceRefs,
      promotionEvidenceSummary: toString(event.payload.promotionEvidenceSummary),
    },
    meta: {
      outcome: 'applied',
      affectedCount: 1,
      reason: toString(event.payload.promotedReason) ?? undefined,
      categories: ['rule_governance'],
    },
  };
}

function explainSession(event: DebugEvent): EverMemoryExplainToolResult['items'][number] {
  const autoGenerated = toNumber(event.payload.autoMemoryGenerated) ?? 0;
  const autoAccepted = toNumber(event.payload.autoMemoryAccepted) ?? 0;
  const autoRejected = toNumber(event.payload.autoMemoryRejected) ?? 0;
  const rejectedReasons = toStringArray(event.payload.autoMemoryRejectedReasons) ?? [];
  const reflected = toBoolean(event.payload.reflected) ?? false;
  const promotedRules = toNumber(event.payload.promotedRules) ?? 0;
  const answerParts = [
    `Auto capture generated ${autoGenerated} candidate(s): accepted=${autoAccepted}, rejected=${autoRejected}.`,
  ];
  if (rejectedReasons.length > 0) {
    answerParts.push(`Rejection reasons: ${rejectedReasons.join(', ')}.`);
  }
  if (reflected) {
    answerParts.push(`Reflection ${toString(event.payload.reflectionId) ?? 'unknown'} triggered and evaluated ${promotedRules} promoted rule(s).`);
  } else {
    answerParts.push('No reflection was triggered for this session.');
  }
  const projectSummaryAccepted = toNumber(event.payload.projectSummaryAccepted) ?? 0;
  if (projectSummaryAccepted > 0) {
    answerParts.push(`Project summaries accepted: ${projectSummaryAccepted}.`);
  }
  const metaReason = reflected
    ? 'reflection_triggered'
    : rejectedReasons[0]
      ?? (autoGenerated === 0 ? 'no_candidates_generated' : (autoAccepted > 0 ? 'auto_memory_applied' : 'candidates_rejected'));
  return {
    createdAt: event.createdAt,
    kind: event.kind,
    entityId: event.entityId,
    question: 'What happened during session end processing?',
    answer: answerParts.join(' '),
    evidence: {
      sessionId: toString(event.payload.sessionId),
      scopeUserId: toString(event.payload.scopeUserId),
      scopeChatId: toString(event.payload.scopeChatId),
      scopeProject: toString(event.payload.scopeProject),
      channel: toString(event.payload.channel),
      experienceId: toString(event.payload.experienceId),
      reflectionId: toString(event.payload.reflectionId),
      reflected,
      promotedRules,
      autoMemoryGenerated: autoGenerated,
      autoMemoryAccepted: autoAccepted,
      autoMemoryRejected: autoRejected,
      autoMemoryGeneratedByKind: event.payload.autoMemoryGeneratedByKind,
      autoMemoryAcceptedByKind: event.payload.autoMemoryAcceptedByKind,
      autoMemoryAcceptedIdsByKind: event.payload.autoMemoryAcceptedIdsByKind,
      autoMemoryRejectedReasons: rejectedReasons,
      projectSummaryGenerated: toNumber(event.payload.projectSummaryGenerated),
      projectSummaryAccepted,
    },
    meta: {
      outcome: reflected || autoAccepted > 0 ? 'applied' : 'skipped',
      affectedCount: autoAccepted,
      reason: metaReason,
      categories: ['session', reflected ? 'reflection' : 'auto_capture'],
    },
  };
}

function explainArchive(event: DebugEvent): EverMemoryExplainToolResult['items'][number] {
  if (event.kind === 'memory_archived') {
    const reason = toString(event.payload.reason) ?? 'archive_policy';
    const previousLifecycle = toString(event.payload.previousLifecycle);
    const newLifecycle = toString(event.payload.newLifecycle);
    const decayScore = toNumber(event.payload.decayScore);
    const summary = [
      `Memory ${event.entityId ?? 'unknown'} archived because ${reason}.`,
      previousLifecycle ? `Previous lifecycle=${previousLifecycle}.` : '',
      newLifecycle ? `Migrated to ${newLifecycle}.` : '',
      typeof decayScore === 'number' ? `Decay score=${decayScore}.` : '',
    ].filter(Boolean).join(' ');
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'Why was this memory archived?',
      answer: summary,
      evidence: {
        reason,
        previousLifecycle,
        newLifecycle,
        decayScore,
        updatedAt: toString(event.payload.updatedAt),
      },
      meta: {
        outcome: 'applied',
        affectedCount: 1,
        reason,
        categories: ['archive'],
      },
    };
  }

  if (event.kind === 'memory_restore_reviewed') {
    const source = toString(event.payload.source) ?? 'evermemory_restore';
    if (source === 'evermemory_review') {
      const total = toNumber(event.payload.total) ?? 0;
      const includeSuperseded = toBoolean(event.payload.includeSuperseded) ?? false;
      const candidateIds = toStringArray(event.payload.candidateIds) ?? [];
      return {
        createdAt: event.createdAt,
        kind: event.kind,
        entityId: event.entityId,
        question: 'What did archived memory review return?',
        answer: `Review surfaced ${total} archived candidate(s)${includeSuperseded ? ' including superseded items' : ''}.`,
        evidence: {
          total,
          includeSuperseded,
          scope: event.payload.scope,
          query: toString(event.payload.query),
          limit: toNumber(event.payload.limit),
          candidateIds,
        },
        meta: {
          outcome: 'reviewed',
          affectedCount: total,
          reason: includeSuperseded ? 'includes_superseded' : undefined,
          categories: ['archive', 'review'],
        },
      };
    }

    const mode = toString(event.payload.mode) ?? 'review';
    const approved = toBoolean(event.payload.approved) ?? false;
    const applied = toBoolean(event.payload.applied) ?? false;
    const total = toNumber(event.payload.total) ?? 0;
    const restorable = toNumber(event.payload.restorable) ?? 0;
    const rejected = toNumber(event.payload.rejected) ?? 0;
    const requestedIds = toStringArray(event.payload.requestedIds) ?? [];
    const restorableIds = toStringArray(event.payload.restorableIds) ?? [];
    const reason = toString(event.payload.reason);
    return {
      createdAt: event.createdAt,
      kind: event.kind,
      entityId: event.entityId,
      question: 'What happened during memory restore review?',
      answer: `Restore (${mode}) request for ${total || requestedIds.length} id(s) is ${approved ? 'approved' : 'pending'}; ${restorable || restorableIds.length} eligible and ${rejected} rejected.`,
      evidence: {
        mode,
        approved,
        applied,
        total,
        restorable,
        rejected,
        targetLifecycle: toString(event.payload.targetLifecycle),
        allowSuperseded: toBoolean(event.payload.allowSuperseded),
        requestedIds,
        restorableIds,
        reason,
      },
      meta: {
        outcome: applied ? 'applied' : 'reviewed',
        affectedCount: applied ? restorable : restorable || restorableIds.length,
        reason: reason ?? (approved ? 'ready_for_apply' : 'approval_required'),
        categories: ['archive', 'restore'],
      },
    };
  }

  const mode = toString(event.payload.mode) ?? 'apply';
  const restored = toNumber(event.payload.restored) ?? 0;
  const restorable = toNumber(event.payload.restorable) ?? 0;
  const rejected = toNumber(event.payload.rejected) ?? 0;
  const restoredIds = toStringArray(event.payload.restoredIds) ?? [];
  const restorableIds = toStringArray(event.payload.restorableIds) ?? [];
  return {
    createdAt: event.createdAt,
    kind: event.kind,
    entityId: event.entityId,
    question: 'What was the result of restore apply?',
    answer: `Restore (${mode}) applied ${restored} / ${restorable || restorableIds.length} candidate(s); rejected=${rejected}. Restored IDs: ${restoredIds.length > 0 ? restoredIds.join(', ') : 'none'}.`,
    evidence: {
      mode,
      total: toNumber(event.payload.total),
      restorable,
      rejected,
      restored,
      targetLifecycle: toString(event.payload.targetLifecycle),
      allowSuperseded: toBoolean(event.payload.allowSuperseded),
      restoredIds,
      restorableIds,
      requestedIds: toStringArray(event.payload.requestedIds),
    },
    meta: {
      outcome: 'applied',
      affectedCount: restored,
      reason: restored > 0 ? undefined : 'no_restorable_ids',
      categories: ['archive', 'restore'],
    },
  };
}

function explainIntent(event: DebugEvent): EverMemoryExplainToolResult['items'][number] {
  const intentType = toString(event.payload.intentType) ?? 'unknown';
  const intentConfidence = toNumber(event.payload.intentConfidence);
  const memoryNeed = toString(event.payload.memoryNeed) ?? 'none';
  const actionNeed = toString(event.payload.actionNeed) ?? 'none';
  const preferredScopes = toStringArray(event.payload.preferredScopes) ?? [];
  const preferredTypes = toStringArray(event.payload.preferredTypes) ?? [];
  const preferredTimeBias = toString(event.payload.preferredTimeBias);
  const answer = `Intent classified as ${intentType} (confidence=${intentConfidence ?? 'n/a'}) requiring ${actionNeed}; memoryNeed=${memoryNeed}. Routing prefers scopes=${preferredScopes.join(', ') || 'session'}, types=${preferredTypes.join(', ') || 'fact'}, timeBias=${preferredTimeBias ?? 'balanced'}.`;
  return {
    createdAt: event.createdAt,
    kind: event.kind,
    entityId: event.entityId,
    question: 'How was the intent interpreted?',
    answer,
    evidence: {
      sessionId: toString(event.payload.sessionId),
      messageId: toString(event.payload.messageId),
      intentType,
      intentConfidence,
      memoryNeed,
      actionNeed,
      preferredScopes,
      preferredTypes,
      preferredTimeBias,
    },
    meta: {
      outcome: 'applied',
      affectedCount: 1,
      reason: `memory_need_${memoryNeed}`,
      categories: ['intent'],
    },
  };
}

function toExplanation(
  topic: EverMemoryExplainTopic,
  event: DebugEvent,
): EverMemoryExplainToolResult['items'][number] {
  switch (topic) {
    case 'write':
      return explainWrite(event);
    case 'retrieval':
      return explainRetrieval(event);
    case 'rule':
      return explainRule(event);
    case 'session':
      return explainSession(event);
    case 'archive':
      return explainArchive(event);
    case 'intent':
      return explainIntent(event);
    default:
      return explainRule(event);
  }
}

export function evermemoryExplain(
  debugRepo: DebugRepository,
  input: EverMemoryExplainToolInput = {},
): EverMemoryExplainToolResult {
  const topic: EverMemoryExplainTopic = input.topic ?? 'write';
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
  const fetchLimit = Math.max(30, limit * 8);
  const kinds = EVENT_KINDS_BY_TOPIC[topic];

  const events = kinds
    .flatMap((kind) => debugRepo.listRecent(kind, fetchLimit))
    .filter((event) => !input.entityId || event.entityId === input.entityId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit);

  return {
    topic,
    total: events.length,
    items: events.map((event) => toExplanation(topic, event)),
  };
}

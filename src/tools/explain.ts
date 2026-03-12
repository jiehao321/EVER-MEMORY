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
  rule: ['rule_promoted', 'rule_rejected'],
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

import type { DebugRepository } from '../storage/debugRepo.js';
import type {
  DebugEvent,
  EverMemoryExplainToolInput,
  EverMemoryExplainToolResult,
  EverMemoryExplainTopic,
} from '../types.js';
import {
  explainArchive,
  explainIntent,
  explainRetrieval,
  explainRule,
  explainSession,
  explainWrite,
} from './explainTopics.js';

const EVENT_KINDS_BY_TOPIC: Record<EverMemoryExplainTopic, Array<DebugEvent['kind']>> = {
  write: ['memory_write_decision', 'memory_write_rejected'],
  retrieval: ['retrieval_executed'],
  rule: ['rule_promoted', 'rule_rejected', 'rule_frozen', 'rule_deprecated', 'rule_rolled_back'],
  session: ['session_end_processed'],
  archive: ['memory_archived', 'memory_restore_reviewed', 'memory_restore_applied'],
  intent: ['intent_generated'],
};

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

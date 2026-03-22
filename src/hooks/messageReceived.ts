import type { IntentService } from '../core/intent/service.js';
import type { BehaviorService } from '../core/behavior/service.js';
import type { ContradictionMonitor } from '../core/memory/contradictionMonitor.js';
import type { ProactiveRecallService } from '../core/memory/proactiveRecall.js';
import type { ProgressiveConsolidationService } from '../core/memory/progressiveConsolidation.js';
import type { RetrievalService } from '../retrieval/service.js';
import { getSessionContext } from '../runtime/context.js';
import { setInteractionContext } from '../runtime/context.js';
import type { DebugRepository } from '../storage/debugRepo.js';
import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { SemanticRepository } from '../storage/semanticRepo.js';
import type {
  BehaviorRule,
  InteractionRuntimeContext,
  MemoryItem,
  MessageReceivedInput,
  MessageReceivedResult,
  RuntimeUserProfile,
} from '../types.js';
import { semanticPreload, type SemanticPreloadResult } from './beforeAgentStart.js';

function nowIso(): string {
  return new Date().toISOString();
}

function toWarningItem(content: string, sessionId: string, index: number, messageId?: string): MemoryItem {
  const timestamp = nowIso();
  return {
    id: `warning:${sessionId}:${messageId ?? 'message'}:${index}`,
    content,
    type: 'constraint',
    lifecycle: 'working',
    source: {
      kind: 'summary',
      actor: 'system',
      sessionId,
      messageId,
    },
    scope: {},
    scores: {
      confidence: 1,
      importance: 0.95,
      explicitness: 1,
    },
    timestamps: {
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    state: {
      active: true,
      archived: false,
    },
    evidence: {
      references: [],
    },
    tags: ['warning'],
    relatedEntities: [],
    sourceGrade: 'inferred',
    stats: {
      accessCount: 0,
      retrievalCount: 0,
    },
    metadata: {
      source: 'warning',
    },
  };
}

function mergeBehaviorRules(
  existing: readonly BehaviorRule[],
  candidates: readonly BehaviorRule[],
): BehaviorRule[] {
  const seen = new Set(existing.map((rule) => rule.id));
  const merged = [...existing];

  for (const rule of candidates) {
    if (seen.has(rule.id)) {
      continue;
    }
    merged.push(rule);
    seen.add(rule.id);
  }

  return merged;
}

export async function handleMessageReceived(
  input: MessageReceivedInput,
  intentService: IntentService,
  behaviorService: BehaviorService,
  retrievalService: RetrievalService,
  debugRepo?: DebugRepository,
  semanticRepo?: SemanticRepository,
  memoryRepo?: MemoryRepository,
  proactiveRecallService?: ProactiveRecallService,
  contradictionMonitor?: ContradictionMonitor,
  userProfile?: RuntimeUserProfile,
  progressiveConsolidationService?: ProgressiveConsolidationService,
): Promise<MessageReceivedResult> {
  const intent = intentService.analyze({
    text: input.text,
    sessionId: input.sessionId,
    messageId: input.messageId,
    scope: input.scope,
  });

  const recall = await retrievalService.recallForIntent({
    intent,
    scope: input.scope,
    query: input.text,
    limit: input.recallLimit,
  });
  const note = recall.degraded
    ? 'Semantic search was unavailable for this recall; results may be incomplete.'
    : undefined;
  const recallLimit = recall.limit;
  const sessionContext = getSessionContext(input.sessionId);
  const contextRules = sessionContext?.activeBehaviorRules ?? [];
  let semanticHits: SemanticPreloadResult = { ids: [], hits: [], warnings: [], relevantRules: [] };
  if (semanticRepo && memoryRepo && recallLimit > 0 && !recall.degraded) {
    try {
      semanticHits = await semanticPreload(
        input.text,
        input.scope ?? {},
        semanticRepo,
        memoryRepo,
        recallLimit,
        undefined,
        contextRules,
        debugRepo,
      );
    } catch (error) {
      semanticHits = { ids: [], hits: [], warnings: [], relevantRules: [] };
      debugRepo?.log('semantic_preload_failed', input.sessionId ?? 'unknown', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const recallIds = new Set(recall.items.map((item) => item.id));
  const warningItems = semanticHits.warnings.map((warning, index) => toWarningItem(
    warning,
    input.sessionId,
    index,
    input.messageId,
  ));
  const semanticItems: MemoryItem[] = [];
  for (const hit of semanticHits.hits) {
    if (recallIds.has(hit.memoryId)) {
      continue;
    }
    const memory = memoryRepo?.findById(hit.memoryId);
    if (!memory) {
      continue;
    }
    semanticItems.push({
      ...memory,
      metadata: {
        ...(memory.metadata ?? {}),
        source: 'semantic',
        semanticScore: hit.score,
      },
    });
  }
  const mergedItems = [...warningItems, ...recall.items, ...semanticItems]
    .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, recallLimit);
  const mergedRecall = {
    ...recall,
    items: mergedItems,
    total: mergedItems.length,
  };
  const behaviorRules = behaviorService.getActiveRules({
    scope: input.scope,
    intentType: intent.intent.type,
    channel: input.channel,
    contexts: input.contexts,
    limit: 6,
  });
  const relevantContextRules = contextRules.filter((rule) => semanticHits.relevantRules.includes(rule.statement));
  const appliedBehaviorRules = mergeBehaviorRules(behaviorRules, relevantContextRules);

  const interaction: InteractionRuntimeContext = {
    sessionId: input.sessionId,
    messageId: input.messageId,
    scope: input.scope ?? {},
    intent,
    recalledItems: mergedRecall.items,
    appliedBehaviorRules,
    updatedAt: nowIso(),
  };

  setInteractionContext(interaction);
  debugRepo?.log('rules_loaded', input.messageId, {
    sessionId: input.sessionId,
    messageId: input.messageId,
    source: 'messageReceived',
    rules: appliedBehaviorRules.length,
    intentType: intent.intent.type,
  });

  debugRepo?.log('interaction_processed', input.messageId, {
    sessionId: input.sessionId,
    messageId: input.messageId,
    memoryNeed: intent.signals.memoryNeed,
    recalled: mergedRecall.total,
    rules: appliedBehaviorRules.length,
  });

  let proactiveItems: MessageReceivedResult['proactiveItems'];
  if (proactiveRecallService && mergedRecall.items.length > 0) {
    try {
      const proactive = proactiveRecallService.findProactiveItems(
        mergedRecall.items,
        userProfile,
        input.scope ? { userId: input.scope.userId, project: input.scope.project } : undefined,
      );
      if (proactive.items.length > 0) {
        proactiveItems = proactive.items;
      }
    } catch {
      // Proactive recall errors must not affect regular flow
    }
  }

  const alerts = contradictionMonitor?.drainAlerts(input.sessionId);

  if (progressiveConsolidationService) {
    try {
      progressiveConsolidationService.onMessage(input.sessionId);
    } catch {
      // Best-effort progressive consolidation must not affect regular flow
    }
  }

  return {
    sessionId: input.sessionId,
    messageId: input.messageId,
    intent,
    recall: mergedRecall,
    note,
    behaviorRules: appliedBehaviorRules,
    proactiveItems,
    alerts: alerts && alerts.length > 0 ? alerts : undefined,
  };
}

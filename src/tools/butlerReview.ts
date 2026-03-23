import type { AttentionService } from '../core/butler/attention/service.js';
import { ButlerStateManager } from '../core/butler/state.js';
import type { ButlerInsight } from '../core/butler/types.js';
import {
  ButlerFeedbackRepository,
  type ButlerFeedbackAction,
} from '../storage/butlerFeedbackRepo.js';
import { ButlerInsightRepository } from '../storage/butlerInsightRepo.js';

type ButlerReviewAction = 'list' | 'accept' | 'reject' | 'snooze' | 'dismiss';
type ButlerReviewStatus = 'active' | 'snoozed' | 'dismissed';
type ButlerReviewListItem = {
  id: string;
  kind: string;
  title: string;
  confidence: number;
  importance: number;
  status: ButlerReviewStatus;
};

export interface ButlerReviewResult {
  action: string;
  insight?: { id: string; kind: string; title: string; status: ButlerReviewStatus };
  listed?: ButlerReviewListItem[];
  acceptanceRate?: number;
  message: string;
}

function getInsightStatus(
  feedbackRepo: ButlerFeedbackRepository,
  insightId: string,
): ButlerReviewStatus {
  if (feedbackRepo.isDismissed(insightId)) {
    return 'dismissed';
  }
  if (feedbackRepo.isSnoozed(insightId)) {
    return 'snoozed';
  }
  return 'active';
}

function requireInsight(
  insightRepo: ButlerInsightRepository,
  insightId: string | undefined,
): ButlerInsight {
  if (!insightId) {
    throw new Error('insightId is required for this action.');
  }
  const insight = insightRepo.findById(insightId);
  if (!insight) {
    throw new Error(`Butler insight not found: ${insightId}`);
  }
  return insight;
}

function toListedInsight(
  feedbackRepo: ButlerFeedbackRepository,
  insight: ButlerInsight,
): ButlerReviewListItem {
  return {
    id: insight.id,
    kind: insight.kind,
    title: insight.title,
    confidence: insight.confidence,
    importance: insight.importance,
    status: getInsightStatus(feedbackRepo, insight.id),
  };
}

function maybeUpdateAcceptanceRate(
  action: ButlerReviewAction,
  feedbackRepo: ButlerFeedbackRepository,
  stateManager: ButlerStateManager,
): number | undefined {
  if (action !== 'accept' && action !== 'reject') {
    return undefined;
  }
  const stats = feedbackRepo.getAcceptanceStats();
  const acceptanceRate = stats.total > 0 ? stats.accepted / stats.total : 0;
  const state = stateManager.load();
  stateManager.save({
    ...state,
    selfModel: {
      ...state.selfModel,
      overlayAcceptanceRate: acceptanceRate,
    },
  });
  return acceptanceRate;
}

function createFeedbackAction(action: ButlerReviewAction): ButlerFeedbackAction {
  switch (action) {
    case 'accept':
      return 'accepted';
    case 'reject':
      return 'rejected';
    case 'snooze':
      return 'snoozed';
    case 'dismiss':
      return 'dismissed';
    case 'list':
      throw new Error('list does not record feedback.');
  }
}

function createSnoozeUntil(snoozeHours: number | undefined): string {
  const hours = snoozeHours ?? 24;
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error('snoozeHours must be a positive number.');
  }
  return new Date(Date.now() + (hours * 60 * 60 * 1000)).toISOString();
}

function listInsights(
  attentionService: AttentionService,
  feedbackRepo: ButlerFeedbackRepository,
  insightRepo: ButlerInsightRepository,
): ButlerReviewResult {
  attentionService.pruneExpiredFeedback();
  const listed = attentionService
    .rankInsights(insightRepo.findFresh(50))
    .map((insight) => toListedInsight(feedbackRepo, insight));
  return {
    action: 'list',
    listed,
    message: listed.length > 0
      ? `Listed ${listed.length} Butler insights.`
      : 'No fresh Butler insights available for review.',
  };
}

export async function butlerReview(input: {
  attentionService: AttentionService;
  feedbackRepo: ButlerFeedbackRepository;
  insightRepo: ButlerInsightRepository;
  stateManager: ButlerStateManager;
  action: ButlerReviewAction;
  insightId?: string;
  snoozeHours?: number;
  reason?: string;
}): Promise<ButlerReviewResult> {
  if (input.action === 'list') {
    return listInsights(input.attentionService, input.feedbackRepo, input.insightRepo);
  }

  input.attentionService.pruneExpiredFeedback();
  const insight = requireInsight(input.insightRepo, input.insightId);
  input.feedbackRepo.insert({
    insightId: insight.id,
    action: createFeedbackAction(input.action),
    snoozeUntil: input.action === 'snooze' ? createSnoozeUntil(input.snoozeHours) : undefined,
    reason: input.reason,
  });
  const acceptanceRate = maybeUpdateAcceptanceRate(input.action, input.feedbackRepo, input.stateManager);
  return {
    action: input.action,
    insight: {
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      status: getInsightStatus(input.feedbackRepo, insight.id),
    },
    acceptanceRate,
    message: `Butler insight ${input.action} recorded for "${insight.title}".`,
  };
}

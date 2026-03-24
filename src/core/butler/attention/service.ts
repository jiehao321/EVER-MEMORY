import { ButlerFeedbackRepository } from '../../../storage/butlerFeedbackRepo.js';
import type { ButlerInsight, ButlerLogger } from '../types.js';
import { ButlerInsightRepository } from '../../../storage/butlerInsightRepo.js';

const SURFACE_COOLDOWN_MS = 30 * 60 * 1000;
const MAX_FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

interface AttentionConfig {
  maxInsightsPerBriefing: number;
  minConfidence: number;
  tokenBudgetPercent: number;
}

interface AttentionServiceOptions {
  insightRepo: ButlerInsightRepository;
  feedbackRepo: ButlerFeedbackRepository;
  config: AttentionConfig;
  logger?: ButlerLogger;
}

function nowMs(): number {
  return Date.now();
}

function toMs(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function freshnessScore(insight: ButlerInsight, referenceMs: number): number {
  const freshUntilMs = toMs(insight.freshUntil);
  if (freshUntilMs === null) {
    return 1;
  }
  const remaining = freshUntilMs - referenceMs;
  if (remaining <= 0) {
    return 0;
  }
  return clamp(remaining / MAX_FRESHNESS_WINDOW_MS, 0, 1);
}

function combinedScore(insight: ButlerInsight, referenceMs: number): number {
  return (insight.importance * 0.5) + (insight.confidence * 0.3) + (freshnessScore(insight, referenceMs) * 0.2);
}

export class AttentionService {
  private readonly insightRepo: ButlerInsightRepository;
  private readonly feedbackRepo: ButlerFeedbackRepository;
  private readonly config: AttentionConfig;
  private readonly logger?: ButlerLogger;

  constructor(options: AttentionServiceOptions) {
    this.insightRepo = options.insightRepo;
    this.feedbackRepo = options.feedbackRepo;
    this.config = options.config;
    this.logger = options.logger;
  }

  getTopInsights(limit = this.config.maxInsightsPerBriefing): ButlerInsight[] {
    const insights = this.insightRepo.findFresh(limit * 4);
    return this.rankInsights(insights.filter((insight) => this.shouldSurface(insight))).slice(0, limit);
  }

  shouldForceSurface(insight: ButlerInsight): boolean {
    if (insight.importance < 0.9) {
      return false;
    }
    if (this.feedbackRepo.isSnoozed(insight.id)) {
      return false;
    }
    return !this.feedbackRepo.isDismissed(insight.id);
  }

  getCriticalInsights(limit = this.config.maxInsightsPerBriefing): ButlerInsight[] {
    const maxItems = Math.max(1, limit);
    const freshInsights = this.insightRepo.findFresh(maxItems * 4);
    const forced = this.rankInsights(freshInsights.filter((insight) => this.shouldForceSurface(insight)));
    const regular = this.getTopInsights(maxItems);
    const deduped: ButlerInsight[] = [];
    const seen = new Set<string>();
    for (const insight of [...forced, ...regular]) {
      if (seen.has(insight.id)) {
        continue;
      }
      seen.add(insight.id);
      deduped.push(insight);
      if (deduped.length >= maxItems) {
        break;
      }
    }
    return deduped;
  }

  rankInsights(insights: ButlerInsight[]): ButlerInsight[] {
    const referenceMs = nowMs();
    return [...insights].sort((left, right) => (
      combinedScore(right, referenceMs) - combinedScore(left, referenceMs)
      || right.importance - left.importance
      || right.confidence - left.confidence
      || right.createdAt.localeCompare(left.createdAt)
    ));
  }

  shouldSurface(insight: ButlerInsight): boolean {
    if (insight.confidence < this.config.minConfidence || insight.importance < 0.3) {
      return false;
    }
    if (this.feedbackRepo.isBlocked(insight.id)) {
      return false;
    }
    const lastSurfacedMs = toMs(insight.lastSurfacedAt);
    return lastSurfacedMs === null || nowMs() - lastSurfacedMs > SURFACE_COOLDOWN_MS;
  }

  markSurfaced(insightIds: string[]): void {
    for (const id of insightIds) {
      this.insightRepo.markSurfaced(id);
    }
    this.logger?.debug?.('AttentionService marked insights surfaced', { count: insightIds.length });
  }

  pruneStale(): number {
    return this.insightRepo.deleteExpired();
  }

  pruneExpiredFeedback(): void {
    this.feedbackRepo.pruneExpired();
  }
}

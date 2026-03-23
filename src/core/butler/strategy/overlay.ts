import type { OpenClawLogger } from '../../../openclaw/shared.js';
import type { CognitiveEngine } from '../cognition.js';
import type {
  AssistantPosture,
  ButlerPersistentState,
  CognitiveTask,
  ProjectMode,
  StrategicOverlay,
} from '../types.js';
import { ButlerInsightRepository } from '../../../storage/butlerInsightRepo.js';

const OVERLAY_SCHEMA = {
  type: 'object',
  required: ['currentMode', 'likelyUserGoal', 'topPriorities', 'recommendedPosture', 'confidence'],
  properties: {
    currentMode: { type: 'string' },
    likelyUserGoal: { type: 'string' },
    topPriorities: { type: 'array' },
    constraints: { type: 'array' },
    watchouts: { type: 'array' },
    recommendedPosture: { type: 'string' },
    suggestedNextStep: { type: 'string' },
    confidence: { type: 'number' },
  },
} satisfies Record<string, unknown>;

const PROJECT_MODES = new Set<ProjectMode>([
  'exploring',
  'planning',
  'implementing',
  'debugging',
  'reviewing',
  'releasing',
]);

const POSTURES = new Set<AssistantPosture>([
  'concise',
  'proactive',
  'skeptical',
  'execution_first',
  'exploratory',
]);

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isProjectMode(value: unknown): value is ProjectMode {
  return typeof value === 'string' && PROJECT_MODES.has(value as ProjectMode);
}

function isAssistantPosture(value: unknown): value is AssistantPosture {
  return typeof value === 'string' && POSTURES.has(value as AssistantPosture);
}

function toFallbackOverlay(state: ButlerPersistentState): StrategicOverlay {
  return {
    currentMode: state.currentStrategyFrame.currentMode,
    likelyUserGoal: state.currentStrategyFrame.likelyUserGoal || 'Unknown',
    topPriorities: [...state.currentStrategyFrame.topPriorities],
    constraints: [...state.currentStrategyFrame.constraints],
    watchouts: [],
    recommendedPosture: 'concise',
    confidence: 0.3,
  };
}

function toOverlay(output: unknown, fallback: StrategicOverlay): StrategicOverlay | null {
  if (!isRecord(output) || !isProjectMode(output.currentMode) || typeof output.likelyUserGoal !== 'string') {
    return null;
  }
  if (!isStringArray(output.topPriorities) || !isAssistantPosture(output.recommendedPosture)) {
    return null;
  }
  if (typeof output.confidence !== 'number') {
    return null;
  }
  return {
    currentMode: output.currentMode,
    likelyUserGoal: output.likelyUserGoal,
    topPriorities: output.topPriorities,
    constraints: isStringArray(output.constraints) ? output.constraints : fallback.constraints,
    watchouts: isStringArray(output.watchouts) ? output.watchouts : [],
    recommendedPosture: output.recommendedPosture,
    suggestedNextStep: typeof output.suggestedNextStep === 'string' ? output.suggestedNextStep : undefined,
    confidence: output.confidence,
  };
}

export class StrategicOverlayGenerator {
  constructor(
    private readonly options: {
      cognitiveEngine: CognitiveEngine;
      insightRepo: ButlerInsightRepository;
      logger?: OpenClawLogger;
    },
  ) {}

  async generateOverlay(
    state: ButlerPersistentState,
    context?: { recentMessages?: string[]; scope?: Record<string, unknown> },
  ): Promise<StrategicOverlay> {
    const fallback = toFallbackOverlay(state);
    const evidence = this.buildEvidencePayload(state, context);
    const task: CognitiveTask<Record<string, unknown>> = {
      taskType: 'strategic-overlay',
      evidence,
      outputSchema: OVERLAY_SCHEMA,
      latencyClass: 'foreground',
      privacyClass: 'local_only',
      budgetClass: 'balanced',
    };
    if (!this.options.cognitiveEngine.canAfford(task)) {
      return fallback;
    }
    const result = await this.options.cognitiveEngine.runTask(task);
    const overlay = result.fallbackUsed ? null : toOverlay(result.output, fallback);
    if (overlay) {
      return overlay;
    }
    this.options.logger?.debug('StrategicOverlayGenerator fell back to heuristic overlay.');
    return fallback;
  }

  buildEvidencePayload(
    state: ButlerPersistentState,
    context?: { recentMessages?: string[]; scope?: Record<string, unknown> },
  ): Record<string, unknown> {
    const now = Date.now();
    const workingMemory = state.workingMemory
      .filter((entry) => !entry.expiresAt || Date.parse(entry.expiresAt) > now)
      .slice(-5)
      .map((entry) => ({ key: entry.key, value: entry.value, createdAt: entry.createdAt }));
    const recentInsights = this.options.insightRepo.findFresh(5).map((insight) => ({
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      summary: insight.summary,
      confidence: insight.confidence,
      importance: insight.importance,
    }));
    return {
      strategyFrame: state.currentStrategyFrame,
      selfModel: state.selfModel,
      workingMemory,
      recentMessages: context?.recentMessages ?? [],
      scope: context?.scope ?? {},
      recentInsights,
    };
  }
}

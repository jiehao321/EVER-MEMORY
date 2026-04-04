import type { ClockPort } from '../ports/clock.js';
import type { ButlerLogger } from '../types.js';
import type { EvolutionMetrics, ParameterChange, TunableParameter } from './types.js';

const EMA_ALPHA = 0.3;

const DEFAULT_PARAMETERS: TunableParameter[] = [
  { key: 'overlay_confidence_threshold', currentValue: 0.3, minValue: 0.1, maxValue: 0.8, description: 'Min overlay confidence to surface' },
  { key: 'insight_cooldown_minutes', currentValue: 30, minValue: 5, maxValue: 120, description: 'Minutes between insight re-surfacing' },
  { key: 'question_frequency_per_session', currentValue: 2, minValue: 0, maxValue: 5, description: 'Max questions per session' },
  { key: 'attention_importance_weight', currentValue: 0.5, minValue: 0.2, maxValue: 0.8, description: 'Attention formula importance weight' },
  { key: 'attention_confidence_weight', currentValue: 0.3, minValue: 0.1, maxValue: 0.6, description: 'Attention formula confidence weight' },
  { key: 'attention_freshness_weight', currentValue: 0.2, minValue: 0.05, maxValue: 0.5, description: 'Attention formula freshness weight' },
  { key: 'task_drain_budget', currentValue: 3, minValue: 1, maxValue: 10, description: 'Max tasks drained per cycle' },
];

export class ParameterTuner {
  private readonly parameters: Map<string, TunableParameter>;
  private readonly history: ParameterChange[] = [];

  constructor(
    private readonly clock: ClockPort,
    private readonly logger?: ButlerLogger,
    initialParams?: TunableParameter[],
  ) {
    this.parameters = new Map((initialParams ?? DEFAULT_PARAMETERS).map((parameter) => [parameter.key, { ...parameter }]));
  }

  tune(metrics: EvolutionMetrics): ParameterChange[] {
    const changes: ParameterChange[] = [];

    if (metrics.insightDismissalRate > 0.5) {
      const change = this.adjustParameter('insight_cooldown_minutes', 1.15, 'High insight dismissal rate');
      if (change) changes.push(change);
    }
    if (metrics.overlayAcceptanceRate < 0.3 && metrics.overlayAcceptanceRate > 0) {
      const change = this.adjustParameter('overlay_confidence_threshold', 1.1, 'Low overlay acceptance');
      if (change) changes.push(change);
    }
    if (metrics.questionAnswerRate < 0.3 && metrics.questionAnswerRate > 0) {
      const change = this.adjustParameter('question_frequency_per_session', 0.8, 'Low question answer rate');
      if (change) changes.push(change);
    }
    if (metrics.avgCycleLatencyMs > 1000) {
      const change = this.adjustParameter('task_drain_budget', 0.85, 'High cycle latency');
      if (change) changes.push(change);
    }

    this.history.push(...changes);
    return changes;
  }

  getParameter(key: string): TunableParameter | undefined {
    const parameter = this.parameters.get(key);
    return parameter ? { ...parameter } : undefined;
  }

  getAllParameters(): TunableParameter[] {
    return [...this.parameters.values()].map((parameter) => ({ ...parameter }));
  }

  getHistory(): ParameterChange[] {
    return [...this.history];
  }

  private adjustParameter(key: string, factor: number, reason: string): ParameterChange | null {
    const parameter = this.parameters.get(key);
    if (!parameter) {
      return null;
    }

    const oldValue = parameter.currentValue;
    const rawTarget = oldValue * factor;
    const emaValue = oldValue + ((rawTarget - oldValue) * EMA_ALPHA);
    const clamped = Math.max(parameter.minValue, Math.min(parameter.maxValue, emaValue));
    const newValue = Math.round(clamped * 100) / 100;

    if (Math.abs(newValue - oldValue) < 0.01) {
      return null;
    }

    this.parameters.set(key, { ...parameter, currentValue: newValue });
    this.logger?.info(`ParameterTuner adjusted ${key}`, {
      oldValue,
      newValue,
      reason,
      evaluatedAt: this.clock.isoNow(),
    });
    return { key, oldValue, newValue, reason };
  }
}

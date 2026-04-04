export interface EvolutionMetrics {
  overlayAcceptanceRate: number;
  insightDismissalRate: number;
  questionAnswerRate: number;
  actionSuccessRate: number;
  actionRollbackRate: number;
  avgCycleLatencyMs: number;
}

export interface EvolutionResult {
  cycleType: 'parameter_tune' | 'prompt_variant' | 'heuristic_update';
  changes: ParameterChange[];
  evidence: string;
  confidence: number;
}

export interface ParameterChange {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
}

export interface TunableParameter {
  key: string;
  currentValue: number;
  minValue: number;
  maxValue: number;
  description: string;
}

export interface PromptVariant {
  id: string;
  taskType: string;
  variantText: string;
  performance: { successRate: number; avgConfidence: number; sampleSize: number };
  status: 'candidate' | 'active' | 'retired';
  createdAt: string;
}

export interface EvolutionLogEntry {
  id: string;
  cycleType: string;
  parameterKey?: string;
  oldValueJson?: string;
  newValueJson?: string;
  evidenceJson: string;
  confidence: number;
  status: 'active' | 'reverted' | 'superseded';
  createdAt: string;
}

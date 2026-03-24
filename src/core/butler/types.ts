// Butler logger — matches RuntimeLogger shape without importing from openclaw SDK
export type ButlerLogger = {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

// LLM
export interface LlmGateway {
  invoke(request: LlmRequest): Promise<LlmResponse>;
}

export interface LlmRequest {
  purpose: string;
  caller: { pluginId: string; component?: string };
  mode?: 'foreground' | 'background';
  priority?: 'low' | 'normal' | 'high';
  timeoutMs?: number;
  messages: LlmMessage[];
  responseFormat?: {
    type: 'text' | 'json_object' | 'json_schema';
    schema?: Record<string, unknown>;
  };
  modelHint?: { tier?: 'cheap' | 'balanced' | 'strong' };
  budget?: { maxInputTokens?: number; maxOutputTokens?: number };
  privacy?: { level?: 'local_only' | 'host_allowed' | 'cloud_allowed' };
  idempotencyKey?: string;
  traceId?: string;
}

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface LlmResponse {
  content: string;
  parsed?: unknown;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  model?: string;
  provider?: string;
  latencyMs?: number;
  cacheHit?: boolean;
}

// Butler state
export interface ButlerPersistentState {
  currentStrategyFrame: StrategyFrame;
  selfModel: SelfModelMetrics;
  workingMemory: WorkingMemoryEntry[];
  mode: ButlerMode;
  lastCycleAt: string;
  lastCycleVersion: number;
}

export type ButlerMode = 'steward' | 'reduced';

export interface StrategyFrame {
  currentMode: ProjectMode;
  likelyUserGoal: string;
  topPriorities: string[];
  constraints: string[];
  lastUpdatedAt: string;
}

export type ProjectMode =
  | 'exploring'
  | 'planning'
  | 'implementing'
  | 'debugging'
  | 'reviewing'
  | 'releasing';

export interface SelfModelMetrics {
  overlayAcceptanceRate: number;
  insightPrecision: number;
  avgCycleLatencyMs: number;
  totalCycles: number;
  lastEvaluatedAt: string;
}

export interface WorkingMemoryEntry {
  key: string;
  value: unknown;
  expiresAt?: string;
  createdAt: string;
}

// Strategic overlay
export interface StrategicOverlay {
  currentMode: ProjectMode;
  likelyUserGoal: string;
  topPriorities: string[];
  constraints: string[];
  watchouts: string[];
  recommendedPosture: AssistantPosture;
  suggestedNextStep?: string;
  confidence: number;
}

export type AssistantPosture =
  | 'concise'
  | 'proactive'
  | 'skeptical'
  | 'execution_first'
  | 'exploratory';

// Narrative threads
export interface NarrativeThread {
  id: string;
  theme: string;
  objective: string;
  currentPhase: NarrativePhase;
  momentum: NarrativeMomentum;
  recentEvents: string[];
  blockers: string[];
  likelyNextTurn: string;
  strategicImportance: number;
  scopeJson?: string;
  startedAt: string;
  updatedAt: string;
  closedAt?: string;
}

export type NarrativePhase =
  | 'exploring'
  | 'forming'
  | 'expanding'
  | 'converging'
  | 'stabilizing'
  | 'releasing'
  | 'governing';

export type NarrativeMomentum = 'accelerating' | 'steady' | 'stalling' | 'blocked';

// Task queue
export interface ButlerTask {
  id: string;
  type: string;
  priority: number;
  status: ButlerTaskStatus;
  trigger?: string;
  payloadJson?: string;
  budgetClass: string;
  scheduledAt?: string;
  leaseUntil?: string;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey?: string;
  resultJson?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type ButlerTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface NewButlerTask {
  type: string;
  priority?: number;
  trigger?: string;
  payload?: unknown;
  budgetClass?: string;
  scheduledAt?: string;
  idempotencyKey?: string;
  maxAttempts?: number;
}

// Butler insights
export interface ButlerInsight {
  id: string;
  kind: InsightKind;
  scopeJson?: string;
  title: string;
  summary: string;
  confidence: number;
  importance: number;
  freshUntil?: string;
  sourceRefsJson?: string;
  modelUsed?: string;
  cycleTraceId?: string;
  surfacedCount: number;
  lastSurfacedAt?: string;
  createdAt: string;
}

export type InsightKind =
  | 'continuity'
  | 'theme'
  | 'commitment'
  | 'anomaly'
  | 'open_loop'
  | 'recommendation';

export interface NewButlerInsight {
  kind: InsightKind;
  scope?: Record<string, unknown>;
  title: string;
  summary: string;
  confidence?: number;
  importance?: number;
  freshUntil?: string;
  sourceRefs?: string[];
  modelUsed?: string;
  cycleTraceId?: string;
}

// LLM invocation audit
export interface LlmInvocation {
  id: string;
  taskType: string;
  traceId?: string;
  provider?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  cacheHit: boolean;
  success: boolean;
  createdAt: string;
}

// Cognitive engine
export interface CognitiveTask<T = unknown> {
  taskType: string;
  evidence: unknown;
  outputSchema?: Record<string, unknown>;
  latencyClass: 'foreground' | 'background';
  privacyClass: 'local_only' | 'cloud_allowed';
  budgetClass: 'cheap' | 'balanced' | 'strong';
}

export interface CognitiveResult<T = unknown> {
  output: T;
  confidence: number;
  evidenceIds: string[];
  usage?: LlmResponse['usage'];
  fallbackUsed: boolean;
}

// Butler trigger and cycle
export interface ButlerTrigger {
  type: 'session_started' | 'message_received' | 'session_ended' | 'agent_ended' | 'service_started';
  sessionId?: string;
  scope?: Record<string, unknown>;
  payload?: Record<string, unknown>;
}

export interface ButlerCycleTrace {
  cycleId: string;
  hook: string;
  observedAt: string;
  observationSummary: string;
  decisionsJson: string;
  actionsJson: string;
  llmInvoked: boolean;
  durationMs: number;
}

export interface DrainBudget {
  maxTasks: number;
  maxTimeMs: number;
  priorityFilter?: 'high_only' | 'high_and_medium' | 'all';
}

// Butler config
export interface ButlerConfig {
  enabled: boolean;
  mode: ButlerMode;
  cognition: {
    dailyTokenBudget: number;
    sessionTokenBudget: number;
    taskTimeoutMs: number;
    fallbackToHeuristics: boolean;
  };
  timeBudgets: {
    sessionStartMs: number;
    beforeAgentMs: number;
    agentEndMs: number;
  };
  attention: {
    maxInsightsPerBriefing: number;
    tokenBudgetPercent: number;
    minConfidence: number;
  };
  workers: {
    enabled: boolean;
    maxWorkers: number;
    taskTimeoutMs: number;
  };
}

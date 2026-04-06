import type { HostPort } from '../ports/host.js';
import type { ButlerStoragePort } from '../ports/storage.js';
import type { ClockPort } from '../ports/clock.js';
import type { ButlerConfig, ButlerLogger, LlmGateway } from '../types.js';
import { ButlerAgent } from '../agent.js';
import { CognitiveEngine } from '../cognition.js';
import { ButlerLlmClient } from '../llmClient.js';
import { ProtocolHandler } from '../protocol/handler.js';
import type { ButlerMessage } from '../protocol/types.js';
import { ButlerScheduler } from '../scheduler/service.js';
import { ButlerStateManager } from '../state.js';
import { TaskQueueService } from '../taskQueue.js';
import type { ButlerTransport } from '../transports/types.js';

export interface ButlerRuntimeConfig {
  storage: ButlerStoragePort;
  llm?: LlmGateway;
  clock: ClockPort;
  host?: HostPort;
  transport: ButlerTransport;
  scheduler?: {
    enabled?: boolean;
    tickIntervalMs?: number;
    idleThrottleMs?: number;
    maxTickBudgetMs?: number;
  };
  config?: Partial<ButlerConfig>;
  logger?: ButlerLogger;
}

const DEFAULT_BUTLER_CONFIG: ButlerConfig = {
  enabled: true,
  mode: 'reduced',
  cognition: {
    dailyTokenBudget: 50_000,
    sessionTokenBudget: 10_000,
    taskTimeoutMs: 15_000,
    fallbackToHeuristics: true,
  },
  timeBudgets: {
    sessionStartMs: 3_000,
    beforeAgentMs: 2_000,
    agentEndMs: 2_000,
  },
  attention: {
    maxInsightsPerBriefing: 3,
    tokenBudgetPercent: 0.2,
    minConfidence: 0.4,
  },
  workers: {
    enabled: false,
    maxWorkers: 2,
    taskTimeoutMs: 15_000,
  },
};

function mergeConfig(overrides: Partial<ButlerConfig> | undefined): ButlerConfig {
  return {
    ...DEFAULT_BUTLER_CONFIG,
    ...overrides,
    cognition: {
      ...DEFAULT_BUTLER_CONFIG.cognition,
      ...overrides?.cognition,
    },
    timeBudgets: {
      ...DEFAULT_BUTLER_CONFIG.timeBudgets,
      ...overrides?.timeBudgets,
    },
    attention: {
      ...DEFAULT_BUTLER_CONFIG.attention,
      ...overrides?.attention,
    },
    workers: {
      ...DEFAULT_BUTLER_CONFIG.workers,
      ...overrides?.workers,
    },
  };
}

export class ButlerRuntime {
  private readonly agent: ButlerAgent;
  private readonly scheduler: ButlerScheduler;
  private readonly handler: ProtocolHandler;
  private readonly transport: ButlerTransport;
  private running = false;

  constructor(private readonly runtimeConfig: ButlerRuntimeConfig) {
    const { storage, clock, logger } = runtimeConfig;
    const butlerConfig = mergeConfig(runtimeConfig.config);

    const stateManager = new ButlerStateManager({
      stateRepo: storage.state,
      clock,
      logger,
    });

    const taskQueue = new TaskQueueService({
      taskRepo: storage.tasks,
      logger,
    });

    const llmClient = new ButlerLlmClient({
      gateway: runtimeConfig.llm,
      logger,
    });

    const cognitiveEngine = new CognitiveEngine({
      llmClient,
      invocationRepo: storage.invocations,
      clock,
      config: butlerConfig.cognition,
      logger,
    });

    this.agent = new ButlerAgent({
      stateManager,
      taskQueue,
      cognitiveEngine,
      insightRepo: storage.insights,
      clock,
      logger,
    });

    this.scheduler = new ButlerScheduler(
      this.agent,
      {
        tasks: storage.tasks,
        goals: storage.goals,
        insights: storage.insights,
        narratives: storage.narrative,
        clock,
      },
      clock,
      logger,
      {
        enabled: runtimeConfig.scheduler?.enabled ?? true,
        tickIntervalMs: runtimeConfig.scheduler?.tickIntervalMs ?? 60_000,
        idleThrottleMs: runtimeConfig.scheduler?.idleThrottleMs ?? 300_000,
        maxTickBudgetMs: runtimeConfig.scheduler?.maxTickBudgetMs ?? 5_000,
      },
    );

    this.handler = new ProtocolHandler({
      agent: this.agent,
      scheduler: this.scheduler,
      storage,
      clock,
      logger,
    });

    this.transport = runtimeConfig.transport;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.transport.start((message: ButlerMessage) => this.handler.handle(message));
    this.scheduler.start();
    this.runtimeConfig.logger?.info('ButlerRuntime started');
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.scheduler.stop();
    this.transport.stop();
    this.runtimeConfig.logger?.info('ButlerRuntime stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getAgent(): ButlerAgent {
    return this.agent;
  }
}

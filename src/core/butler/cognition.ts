import { randomUUID } from 'node:crypto';
import type {
  ButlerConfig,
  ButlerLogger,
  CognitiveResult,
  CognitiveTask,
  LlmRequest,
} from '../butler/types.js';
import type { ClockPort } from './ports/clock.js';
import type { InvocationStore } from './ports/storage.js';
import type { ButlerLlmClient } from './llmClient.js';

interface CognitiveEngineOptions {
  llmClient: ButlerLlmClient;
  invocationRepo: InvocationStore;
  clock?: ClockPort;
  config: ButlerConfig['cognition'];
  logger?: ButlerLogger;
}

const TOKEN_ESTIMATES: Record<CognitiveTask['budgetClass'], number> = {
  cheap: 20,
  balanced: 25,
  strong: 40,
};

const DEFAULT_CLOCK: ClockPort = {
  now: () => Date.now(),
  isoNow: () => new Date().toISOString(),
};

function createFallbackResult<T>(): CognitiveResult<T> {
  return {
    output: {} as T,
    confidence: 0,
    evidenceIds: [],
    fallbackUsed: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function matchesSchemaType(value: unknown, type: unknown): boolean {
  if (typeof type !== 'string') {
    return true;
  }
  if (type === 'array') {
    return Array.isArray(value);
  }
  if (type === 'object') {
    return isRecord(value);
  }
  return typeof value === type;
}

function validateParsedOutput(
  parsed: unknown,
  schema: Record<string, unknown> | undefined,
): parsed is Record<string, unknown> {
  if (!isRecord(parsed)) {
    return false;
  }
  if (!schema) {
    return true;
  }

  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return required.every((key) => {
    if (typeof key !== 'string' || !(key in parsed)) {
      return false;
    }
    const propertySchema = properties[key];
    const expectedType = isRecord(propertySchema) ? propertySchema.type : undefined;
    return matchesSchemaType(parsed[key], expectedType);
  });
}

function buildRequest(task: CognitiveTask<unknown>, timeoutMs: number): LlmRequest {
  return {
    purpose: task.taskType,
    caller: { pluginId: 'evermemory', component: 'butler-cognition' },
    mode: task.latencyClass,
    priority: task.latencyClass === 'foreground' ? 'high' : 'normal',
    timeoutMs,
    messages: [
      {
        role: 'system',
        content: 'You are a cognitive analysis engine. Respond in JSON matching the provided schema.',
      },
      {
        role: 'user',
        content: JSON.stringify(task.evidence),
      },
    ],
    responseFormat: task.outputSchema
      ? {
          type: 'json_schema',
          schema: task.outputSchema,
        }
      : { type: 'json_object' },
    modelHint: { tier: task.budgetClass },
    privacy: { level: task.privacyClass },
    idempotencyKey: randomUUID(),
    traceId: randomUUID(),
  };
}

function getTotalTokens(totalTokens: number | undefined, inputTokens: number, outputTokens: number): number {
  if (typeof totalTokens === 'number') {
    return totalTokens;
  }
  return inputTokens + outputTokens;
}

export class CognitiveEngine {
  private sessionTokens = 0;
  private readonly llmClient: ButlerLlmClient;
  private readonly invocationRepo: InvocationStore;
  private readonly clock: ClockPort;
  private readonly config: ButlerConfig['cognition'];
  private readonly logger?: ButlerLogger;

  constructor(options: CognitiveEngineOptions) {
    this.llmClient = options.llmClient;
    this.invocationRepo = options.invocationRepo;
    this.clock = options.clock ?? DEFAULT_CLOCK;
    this.config = options.config;
    this.logger = options.logger;
  }

  canAfford(task: CognitiveTask<unknown>): boolean {
    const usage = this.getUsage();
    const estimatedTokens = TOKEN_ESTIMATES[task.budgetClass];
    return (
      usage.dailyTokens + estimatedTokens <= usage.dailyBudget &&
      usage.sessionTokens + estimatedTokens <= usage.sessionBudget
    );
  }

  getUsage(): {
    dailyTokens: number;
    sessionTokens: number;
    dailyBudget: number;
    sessionBudget: number;
  } {
    const dailyUsage = this.invocationRepo.getDailyUsage(this.clock.isoNow().slice(0, 10));
    return {
      dailyTokens: dailyUsage.totalTokens,
      sessionTokens: this.sessionTokens,
      dailyBudget: this.config.dailyTokenBudget,
      sessionBudget: this.config.sessionTokenBudget,
    };
  }

  async runTask<T>(task: CognitiveTask<T>): Promise<CognitiveResult<T>> {
    if (!this.canAfford(task) || !this.llmClient.isAvailable()) {
      return createFallbackResult<T>();
    }

    const request = buildRequest(task, this.config.taskTimeoutMs);
    const response = await this.llmClient.invoke(request);
    const parsed = this.parseResponse(response.content, task.outputSchema);
    const success = parsed !== null;

    this.recordInvocation(task.taskType, request.traceId, response, success);
    if (!success || !parsed) {
      return createFallbackResult<T>();
    }

    this.sessionTokens += getTotalTokens(
      response.usage?.totalTokens,
      response.usage?.inputTokens ?? 0,
      response.usage?.outputTokens ?? 0,
    );

    return {
      output: parsed as T,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
      evidenceIds: Array.isArray(parsed.evidenceIds)
        ? parsed.evidenceIds.filter((item): item is string => typeof item === 'string')
        : [],
      usage: response.usage,
      fallbackUsed: false,
    };
  }

  private parseResponse(
    content: string,
    schema: Record<string, unknown> | undefined,
  ): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(content) as unknown;
      return validateParsedOutput(parsed, schema) ? parsed : null;
    } catch (error) {
      this.logger?.warn('CognitiveEngine failed to parse LLM response', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  private recordInvocation(
    taskType: string,
    traceId: string | undefined,
    response: Awaited<ReturnType<ButlerLlmClient['invoke']>>,
    success: boolean,
  ): void {
    this.invocationRepo.insert({
      taskType,
      traceId,
      provider: response.provider,
      model: response.model,
      promptTokens: response.usage?.inputTokens ?? 0,
      completionTokens: response.usage?.outputTokens ?? 0,
      latencyMs: response.latencyMs,
      cacheHit: response.cacheHit ?? false,
      success,
      createdAt: this.clock.isoNow(),
    });
  }
}

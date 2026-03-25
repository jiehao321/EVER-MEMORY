/**
 * ProviderDirectLlmGateway — pi-ai-backed LLM gateway for the Butler plugin.
 * Uses the pi-ai SDK `complete()` function with auth resolved via OpenClaw modelAuth.
 * Supports Anthropic, OpenAI, and any pi-ai provider with proper auth headers.
 */

import type {
  ButlerLogger,
  LlmGateway,
  LlmRequest,
  LlmResponse,
} from '../core/butler/types.js';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ModelTierConfig {
  provider: string;
  model: string;
}

export interface ResolvedAuth {
  apiKey?: string;
  source?: string;
  mode?: string;
}

export interface ProviderDirectLlmGatewayOptions {
  resolveApiKey: (provider: string) => Promise<ResolvedAuth>;
  applyAuth: (model: PiAiModel, auth: ResolvedAuth) => PiAiModel;
  getModel: (provider: string, modelId: string) => PiAiModel | undefined;
  complete: (model: PiAiModel, context: PiAiContext, options?: Record<string, unknown>) => Promise<PiAiAssistantMessage>;
  defaultProvider: string;
  defaultModel: string;
  modelTiers?: {
    cheap?: ModelTierConfig;
    balanced?: ModelTierConfig;
    strong?: ModelTierConfig;
  };
  logger?: ButlerLogger;
}

// Minimal pi-ai types (avoid hard dependency on @mariozechner/pi-ai in Butler core)
export interface PiAiModel {
  id: string;
  name: string;
  api: string;
  provider: string;
  baseUrl: string;
  headers?: Record<string, string>;
  maxTokens: number;
  [key: string]: unknown;
}

export interface PiAiContext {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string | Array<{ type: string; text: string }> }>;
  system?: string;
}

export interface PiAiAssistantMessage {
  content: Array<{ type: string; text?: string }>;
  usage?: { inputTokens: number; outputTokens: number; totalTokens?: number; cost?: { input: number; output: number; total: number } };
  model?: string;
  stopReason?: string;
}

// ---------------------------------------------------------------------------
// Default model maps (fallback when modelTiers not configured)
// ---------------------------------------------------------------------------

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  cheap: 'claude-haiku-4-5-20251001',
  balanced: 'claude-sonnet-4-6',
  strong: 'claude-opus-4-6',
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  cheap: 'gpt-4o-mini',
  balanced: 'gpt-4o',
  strong: 'gpt-4o',
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function buildUnavailableResponse(_reason: string): LlmResponse {
  return {
    content: '',
    parsed: null,
    provider: 'unavailable',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function buildErrorResponse(_reason: string): LlmResponse {
  return {
    content: '',
    parsed: null,
    provider: 'error',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class ProviderDirectLlmGateway implements LlmGateway {
  private readonly options: ProviderDirectLlmGatewayOptions;
  private readonly logger: ButlerLogger;

  private _authFailed = false;
  private _authVerified = false;

  constructor(options: ProviderDirectLlmGatewayOptions) {
    this.options = options;
    this.logger = options.logger ?? {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    };
  }

  get authFailed(): boolean {
    return this._authFailed;
  }

  get authVerified(): boolean {
    return this._authVerified;
  }

  get defaultProvider(): string {
    return this.options.defaultProvider;
  }

  async invoke(request: LlmRequest): Promise<LlmResponse> {
    // 1. Privacy check — never make network calls for local_only requests
    if (request.privacy?.level === 'local_only') {
      return buildUnavailableResponse('local_only privacy level');
    }

    // 2. Resolve model tier
    const { provider, model: modelId } = this.resolveModelTier(request);

    // 3. Resolve auth first (may trigger lazy loading of pi-ai in resolveApiKey)
    let auth: ResolvedAuth;
    try {
      auth = await this.options.resolveApiKey(provider);
    } catch (err) {
      this.logger.warn(`ProviderDirectLlmGateway: resolveApiKey threw for ${provider}: ${err instanceof Error ? err.message : String(err)}`);
      this._authFailed = true;
      return buildUnavailableResponse('resolveApiKey threw');
    }

    if (!auth.apiKey) {
      this._authFailed = true;
      return buildUnavailableResponse('no api key');
    }

    // 4. Get pi-ai model object (after resolveApiKey ensures pi-ai is loaded)
    const piModel = this.options.getModel(provider, modelId);
    if (!piModel) {
      this.logger.warn(`ProviderDirectLlmGateway: model not found: ${provider}/${modelId}`);
      return buildUnavailableResponse(`model not found: ${provider}/${modelId}`);
    }

    const authedModel = this.options.applyAuth(piModel, auth);

    // 5. Build pi-ai context
    const systemMessages = request.messages.filter(m => m.role === 'system');
    const nonSystemMessages = request.messages.filter(m => m.role !== 'system');
    const systemContent = systemMessages.map(m => m.content).join('\n\n') || undefined;

    const piContext: PiAiContext = {
      messages: nonSystemMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      ...(systemContent ? { system: systemContent } : {}),
    };

    // 6. Call pi-ai complete() with timeout
    const timeoutMs = request.timeoutMs ?? 15000;
    const startTime = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);

    try {
      const result = await this.options.complete(authedModel, piContext, {
        maxTokens: request.budget?.maxOutputTokens ?? 1024,
        signal: abort.signal,
      });

      this._authVerified = true;

      const text = result.content
        .filter((c): c is { type: string; text: string } => c.type === 'text' && typeof c.text === 'string')
        .map(c => c.text)
        .join('');

      return {
        content: text,
        parsed: tryParseJson(text),
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
          totalTokens: result.usage?.totalTokens ?? (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
        },
        model: result.model ?? piModel.id,
        provider,
        latencyMs: Date.now() - startTime,
      };
    } catch (err) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('abort'));

      if (isAbort) {
        this.logger.warn(`ProviderDirectLlmGateway: request timed out (${provider}/${modelId}, ${timeoutMs}ms)`);
        return buildErrorResponse('timeout');
      }

      // Check for auth failures in the error
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('401') || errMsg.includes('authentication') || errMsg.includes('Unauthorized')) {
        this._authFailed = true;
      }

      this.logger.error(`ProviderDirectLlmGateway: ${provider} request error — ${errMsg}`);
      return buildErrorResponse(`request error: ${errMsg}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Model tier resolution
  // -------------------------------------------------------------------------

  private resolveModelTier(request: LlmRequest): { provider: string; model: string } {
    const tier = request.modelHint?.tier;

    if (tier && this.options.modelTiers?.[tier]) {
      return this.options.modelTiers[tier] as ModelTierConfig;
    }

    const defaultProvider = this.options.defaultProvider;
    const defaultModel = this.options.defaultModel;

    if (!tier) {
      return { provider: defaultProvider, model: defaultModel };
    }

    // Derive model from default provider's built-in tier map
    if (defaultProvider === 'anthropic') {
      return {
        provider: 'anthropic',
        model: ANTHROPIC_MODEL_MAP[tier] ?? defaultModel,
      };
    }

    if (defaultProvider === 'openai' || defaultProvider === 'azure-openai-responses') {
      return {
        provider: defaultProvider,
        model: OPENAI_MODEL_MAP[tier] ?? defaultModel,
      };
    }

    return { provider: defaultProvider, model: defaultModel };
  }
}

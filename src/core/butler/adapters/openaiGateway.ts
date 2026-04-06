import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import type { LlmGateway, LlmRequest, LlmResponse, ButlerLogger } from '../types.js';

export interface OpenAiGatewayConfig {
  authFile?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

interface AuthTokens {
  access_token?: string;
  refresh_token?: string;
}

interface AuthFile {
  auth_mode?: string;
  OPENAI_API_KEY?: string | null;
  tokens?: AuthTokens;
}

interface OpenAiChatCompletionResponse {
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function buildFailureResponse(provider: 'unavailable' | 'error', latencyMs: number): LlmResponse {
  return {
    content: '',
    parsed: null,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    provider,
    latencyMs,
    cacheHit: false,
  };
}

function safeJsonParse(content: string): unknown {
  if (!content.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function extractContent(
  content: string | Array<{ type?: string; text?: string }> | undefined,
): string {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .filter((item) => item.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}

function mapResponseFormat(
  responseFormat: LlmRequest['responseFormat'],
): Record<string, unknown> | undefined {
  if (!responseFormat || responseFormat.type === 'text') {
    return undefined;
  }
  if (responseFormat.type === 'json_object') {
    return { type: 'json_object' };
  }
  if (responseFormat.type === 'json_schema' && responseFormat.schema) {
    return {
      type: 'json_schema',
      json_schema: {
        name: 'butler_response',
        schema: responseFormat.schema,
      },
    };
  }
  return undefined;
}

export class OpenAiLlmGateway implements LlmGateway {
  private readiness: 'ready' | 'untested' | 'unavailable' = 'untested';
  private lastAuthError?: string;

  constructor(
    private readonly config: OpenAiGatewayConfig = {},
    private readonly logger?: ButlerLogger,
  ) {}

  getReadiness(): 'ready' | 'untested' | 'unavailable' {
    return this.readiness;
  }

  getProvider(): string | undefined {
    return 'openai';
  }

  getLastAuthError(): string | undefined {
    return this.lastAuthError;
  }

  async invoke(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const token = this.loadAuth();
    if (!token) {
      const error = this.lastAuthError ?? 'Missing OpenAI authentication token';
      return this.markUnavailable(error, startedAt);
    }

    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(
        `${this.getBaseUrl()}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.buildRequestBody(request)),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const error = `OpenAI request failed with status ${response.status}`;
        return this.markUnavailable(error, startedAt);
      }

      const payload = await response.json() as OpenAiChatCompletionResponse;
      const content = extractContent(payload.choices?.[0]?.message?.content);
      const parsed = request.responseFormat?.type && request.responseFormat.type !== 'text'
        ? safeJsonParse(content)
        : undefined;

      this.readiness = 'ready';
      this.lastAuthError = undefined;

      return {
        content,
        parsed,
        usage: {
          inputTokens: payload.usage?.prompt_tokens,
          outputTokens: payload.usage?.completion_tokens,
          totalTokens: payload.usage?.total_tokens,
        },
        model: payload.model ?? this.resolveModel(request),
        provider: 'openai',
        latencyMs: Date.now() - startedAt,
        cacheHit: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger?.error('OpenAiLlmGateway invoke failed', { error: message });
      this.readiness = 'unavailable';
      this.lastAuthError = message;
      return buildFailureResponse('error', Date.now() - startedAt);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildRequestBody(request: LlmRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.resolveModel(request),
      messages: request.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_tokens: request.budget?.maxOutputTokens ?? 1024,
    };

    const responseFormat = mapResponseFormat(request.responseFormat);
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    return body;
  }

  private resolveModel(request: LlmRequest): string {
    const tier = request.modelHint?.tier;
    if (tier === 'balanced' || tier === 'strong') {
      return 'gpt-4o';
    }
    if (tier === 'cheap') {
      return 'gpt-4o-mini';
    }
    return this.config.model ?? DEFAULT_MODEL;
  }

  private loadAuth(): string | undefined {
    const configuredKey = this.config.apiKey?.trim();
    if (configuredKey) {
      return configuredKey;
    }

    const envKey = process.env.OPENAI_API_KEY?.trim();
    if (envKey) {
      return envKey;
    }

    const authFile = this.readAuthFile();
    const accessToken = authFile?.tokens?.access_token?.trim();
    if (accessToken) {
      return accessToken;
    }

    const fileApiKey = authFile?.OPENAI_API_KEY?.trim();
    if (fileApiKey) {
      return fileApiKey;
    }

    return undefined;
  }

  private readAuthFile(): AuthFile | undefined {
    const authPath = resolve(this.config.authFile ?? joinDefaultAuthFile());
    try {
      const raw = readFileSync(authPath, 'utf8');
      return JSON.parse(raw) as AuthFile;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastAuthError = `Failed to read auth file at ${authPath}: ${message}`;
      this.logger?.warn('OpenAiLlmGateway failed to read auth file', { authPath, error: message });
      return undefined;
    }
  }

  private getBaseUrl(): string {
    return (this.config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  }

  private markUnavailable(error: string, startedAt: number): LlmResponse {
    this.readiness = 'unavailable';
    this.lastAuthError = error;
    this.logger?.warn('OpenAiLlmGateway unavailable', { error });
    return buildFailureResponse('unavailable', Date.now() - startedAt);
  }
}

function joinDefaultAuthFile(): string {
  return resolve(homedir(), '.codex', 'auth.json');
}

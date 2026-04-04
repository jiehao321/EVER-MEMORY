import type { ButlerLogger, LlmGateway, LlmMessage, LlmRequest, LlmResponse } from '../butler/types.js';

interface ButlerLlmClientOptions {
  gateway?: LlmGateway;
  llmBridge?: (messages: LlmMessage[]) => Promise<string>;
  logger?: ButlerLogger;
}

function buildUnavailableResponse(reason: 'unavailable' | 'error'): LlmResponse {
  return {
    content: '',
    parsed: null,
    provider: reason,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function toLegacyBridgeResponse(content: string): LlmResponse {
  return {
    content,
    provider: 'legacy_bridge',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

function getGatewayMetadata(gateway: LlmGateway | undefined): Record<string, unknown> | undefined {
  return gateway as Record<string, unknown> | undefined;
}

export class ButlerLlmClient {
  public readonly available: boolean;

  private readonly transport:
    | ((request: LlmRequest) => Promise<LlmResponse>)
    | undefined;

  private readonly gateway?: LlmGateway;
  private readonly logger?: ButlerLogger;

  constructor(options: ButlerLlmClientOptions) {
    this.logger = options.logger;
    this.gateway = options.gateway;
    this.available = Boolean(options.gateway || options.llmBridge);
    this.transport = this.createTransport(options);
  }

  isAvailable(): boolean {
    return this.available;
  }

  getReadiness(): 'ready' | 'untested' | 'unavailable' {
    if (!this.available) {
      return 'unavailable';
    }
    const gateway = getGatewayMetadata(this.gateway);
    if (gateway && 'authFailed' in gateway && 'authVerified' in gateway) {
      if (gateway.authFailed === true) return 'unavailable';
      if (gateway.authVerified === true) return 'ready';
      return 'untested';
    }
    return 'ready';
  }

  getProvider(): string | undefined {
    if (!this.available) return undefined;
    const gateway = getGatewayMetadata(this.gateway);
    if (gateway && 'defaultProvider' in gateway && typeof gateway.defaultProvider === 'string') {
      return gateway.defaultProvider;
    }
    return this.gateway ? 'unknown' : undefined;
  }

  getLastAuthError(): string | undefined {
    if (!this.available) return undefined;
    const gateway = getGatewayMetadata(this.gateway);
    if (gateway && 'lastAuthError' in gateway && typeof gateway.lastAuthError === 'string') {
      return gateway.lastAuthError;
    }
    return undefined;
  }

  async invoke(request: LlmRequest): Promise<LlmResponse> {
    if (!this.transport) {
      return buildUnavailableResponse('unavailable');
    }

    try {
      return await this.transport(request);
    } catch (error) {
      this.logger?.error('ButlerLlmClient invoke failed', { error: error instanceof Error ? error.message : String(error) });
      return buildUnavailableResponse('error');
    }
  }

  private createTransport(
    options: ButlerLlmClientOptions,
  ): ((request: LlmRequest) => Promise<LlmResponse>) | undefined {
    if (options.gateway) {
      return async (request) => options.gateway!.invoke(request);
    }

    if (options.llmBridge) {
      return async (request) => {
        const content = await options.llmBridge!(request.messages);
        return toLegacyBridgeResponse(content);
      };
    }

    return undefined;
  }
}

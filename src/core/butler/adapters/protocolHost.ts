import type { HostPort } from '../ports/host.js';
import type { ProtocolHandler } from '../protocol/handler.js';
import type { ButlerLogger } from '../types.js';

export interface ProtocolHostConfig {
  confirmTimeoutMs?: number;
  questionTimeoutMs?: number;
}

export class ProtocolHostAdapter implements HostPort {
  constructor(
    private readonly handler: ProtocolHandler,
    private readonly logger?: ButlerLogger,
    private readonly config: ProtocolHostConfig = {},
  ) {}

  injectContext(xml: string): void {
    this.logger?.debug?.('ProtocolHostAdapter: injectContext called', { length: xml.length });
  }

  async invokeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    const result = await this.handler.requestActionConfirmation(
      { type: toolName, params },
      { timeoutMs: this.config.confirmTimeoutMs ?? 15_000 },
    );
    if (!result.success) {
      throw new Error(result.error ?? 'Action was not approved');
    }
    return result.result;
  }

  async askUser(question: string, options?: { context?: string }): Promise<string | null> {
    return this.handler.askUser(question, {
      context: options?.context,
      timeoutMs: this.config.questionTimeoutMs ?? 30_000,
    });
  }

  async searchKnowledge(
    _query: string,
    _sources?: string[],
  ): Promise<Array<{ content: string; source: string; relevance: number }>> {
    return [];
  }
}

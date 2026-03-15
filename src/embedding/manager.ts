import type { EmbeddingProvider, EmbeddingProviderKind, EmbeddingVector } from './provider.js';
import { NoOpEmbeddingProvider } from './provider.js';
import { LocalEmbeddingProvider } from './local.js';
import { OpenAIEmbeddingProvider } from './openai.js';

export type EmbeddingConfig = {
  provider: 'local' | 'openai' | 'none';
  /** For 'local': model name override */
  localModel?: string;
  /** For 'openai': api key override (falls back to OPENAI_API_KEY env) */
  openaiApiKey?: string;
};

type QueueResolver = (value: EmbeddingVector | null) => void;
type InitializableEmbeddingProvider = EmbeddingProvider & {
  initialize?: () => Promise<void>;
};

export class EmbeddingManager {
  private _provider: EmbeddingProvider = new NoOpEmbeddingProvider();
  private _initialized = false;
  private _initializing: Promise<EmbeddingProvider> | null = null;
  private _config: EmbeddingConfig = { provider: 'none' };
  private _queueTexts: string[] = [];
  private _queueResolvers: QueueResolver[] = [];
  private _batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly _batchDelayMs = 50;

  configure(config: EmbeddingConfig): void {
    this._config = { ...config };
    this._initialized = false;
    this._initializing = null;
    this._clearBatchTimer();
    this._drainQueueWithNull();
    void this._provider.dispose();
    this._provider = new NoOpEmbeddingProvider();
  }

  async embedBatch(texts: string[]): Promise<(EmbeddingVector | null)[]> {
    if (texts.length === 0) {
      return [];
    }

    const pending = texts.map((text) => this._enqueue(text));
    return Promise.all(pending);
  }

  async embed(text: string): Promise<EmbeddingVector | null> {
    const [result] = await this.embedBatch([text]);
    return result ?? null;
  }

  isReady(): boolean {
    return this._initialized && this._provider.isReady();
  }

  get providerKind(): EmbeddingProviderKind {
    return this._provider.kind;
  }

  async dispose(): Promise<void> {
    this._clearBatchTimer();
    this._drainQueueWithNull();
    await this._provider.dispose();
    this._provider = new NoOpEmbeddingProvider();
    this._initialized = false;
    this._initializing = null;
  }

  private _enqueue(text: string): Promise<EmbeddingVector | null> {
    return new Promise<EmbeddingVector | null>((resolve) => {
      this._queueTexts.push(text);
      this._queueResolvers.push(resolve);
      this._scheduleFlush();
    });
  }

  private _scheduleFlush(): void {
    if (this._batchTimer) {
      return;
    }

    this._batchTimer = setTimeout(() => {
      this._batchTimer = null;
      void this._flushQueue();
    }, this._batchDelayMs);
  }

  private async _flushQueue(): Promise<void> {
    if (this._queueTexts.length === 0) {
      return;
    }

    const texts = this._queueTexts;
    const resolvers = this._queueResolvers;
    this._queueTexts = [];
    this._queueResolvers = [];

    let results: (EmbeddingVector | null)[];
    try {
      results = await this._embedDirect(texts);
    } catch (error) {
      this._logProviderError(error);
      results = texts.map(() => null);
    }

    for (let i = 0; i < resolvers.length; i += 1) {
      resolvers[i](results[i] ?? null);
    }
  }

  private async _embedDirect(
    texts: string[]
  ): Promise<(EmbeddingVector | null)[]> {
    if (texts.length === 0) {
      return [];
    }

    let provider: EmbeddingProvider;
    try {
      provider = await this._ensureProvider();
    } catch (error) {
      this._logProviderError(error);
      return texts.map(() => null);
    }

    if (!provider.isReady()) {
      return texts.map(() => null);
    }

    try {
      const vectors = await provider.embed(texts);
      return this._normalizeProviderOutput(texts.length, vectors);
    } catch (error) {
      this._logProviderError(error);
      await provider.dispose().catch(() => undefined);
      this._initialized = false;
      this._provider = new NoOpEmbeddingProvider();
      return texts.map(() => null);
    }
  }

  private _normalizeProviderOutput(
    expected: number,
    output: EmbeddingVector[]
  ): (EmbeddingVector | null)[] {
    const normalized: (EmbeddingVector | null)[] = [];
    for (let i = 0; i < expected; i += 1) {
      normalized.push(output[i] ?? null);
    }
    return normalized;
  }

  private async _ensureProvider(): Promise<EmbeddingProvider> {
    if (this._initialized) {
      return this._provider;
    }

    if (!this._initializing) {
      this._initializing = this._setup().then(
        (provider) => {
          this._provider = provider;
          this._initialized = true;
          this._initializing = null;
          return provider;
        },
        (error) => {
          this._initializing = null;
          throw error;
        }
      );
    }

    return this._initializing;
  }

  private async _setup(): Promise<EmbeddingProvider> {
    const provider = this._createProvider();
    try {
      await this._initializeProvider(provider);
      return provider;
    } catch (error) {
      if (provider.kind === 'local') {
        console.warn(
          '[EmbeddingManager] Local embedding provider failed to initialize. Falling back to NoOp provider.',
          error
        );
        await provider.dispose().catch(() => undefined);
        return new NoOpEmbeddingProvider();
      }
      throw error;
    }
  }

  private _createProvider(): EmbeddingProvider {
    switch (this._config.provider) {
      case 'local':
        return new LocalEmbeddingProvider(this._config.localModel);
      case 'openai':
        return new OpenAIEmbeddingProvider({
          apiKey: this._config.openaiApiKey,
        });
      default:
        return new NoOpEmbeddingProvider();
    }
  }

  private async _initializeProvider(provider: EmbeddingProvider): Promise<void> {
    const initializable = provider as InitializableEmbeddingProvider;
    if (typeof initializable.initialize === 'function') {
      await initializable.initialize();
    }
  }

  private _drainQueueWithNull(): void {
    if (this._queueResolvers.length === 0) {
      return;
    }

    const resolvers = this._queueResolvers;
    this._queueResolvers = [];
    this._queueTexts = [];
    for (const resolve of resolvers) {
      resolve(null);
    }
  }

  private _logProviderError(error: unknown): void {
    console.warn(
      `[EmbeddingManager] Provider error (${this._provider.kind}):`,
      error
    );
  }

  private _clearBatchTimer(): void {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
  }
}

export const embeddingManager = new EmbeddingManager();

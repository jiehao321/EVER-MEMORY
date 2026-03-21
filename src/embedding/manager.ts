import type { EmbeddingProvider, EmbeddingProviderKind, EmbeddingVector } from './provider.js';
import { NoOpEmbeddingProvider } from './provider.js';
import { LocalEmbeddingProvider } from './local.js';
import { OpenAIEmbeddingProvider } from './openai.js';

/** C3: Progress stages emitted during local embedding provider initialization */
export type EmbeddingInitStage = 'loading' | 'ready' | 'timeout' | 'error';
export const EMBEDDING_QUEUE_LIMIT = 1_000;

export type EmbeddingConfig = {
  provider: 'local' | 'openai' | 'none';
  /** For 'local': model name override */
  localModel?: string;
  /** For 'openai': api key override (falls back to OPENAI_API_KEY env) */
  openaiApiKey?: string;
  /** C3: Called at each initialization stage for cold-start feedback */
  onInitProgress?: (stage: EmbeddingInitStage, detail?: string) => void;
  /** Optional debug hook for non-fatal queue and lifecycle events */
  onDebugEvent?: (payload: Record<string, unknown>) => void;
  /** C3: Timeout in ms for local provider init (default 120s) */
  localInitTimeoutMs?: number;
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

  getQueueDepth(): number {
    return this._queueTexts.length;
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

  async warmup(): Promise<{ ready: boolean; provider: string; elapsedMs: number }> {
    const start = Date.now();
    try {
      await this.embed('');
      const elapsedMs = Date.now() - start;
      return {
        ready: this.isReady(),
        provider: this.providerKind,
        elapsedMs,
      };
    } catch {
      const elapsedMs = Date.now() - start;
      return {
        ready: false,
        provider: this.providerKind,
        elapsedMs,
      };
    }
  }

  private _enqueue(text: string): Promise<EmbeddingVector | null> {
    return new Promise<EmbeddingVector | null>((resolve) => {
      const nextTexts = [...this._queueTexts, text];
      const nextResolvers = [...this._queueResolvers, resolve];
      const overflow = Math.max(0, nextTexts.length - EMBEDDING_QUEUE_LIMIT);

      if (overflow > 0) {
        const droppedResolvers = nextResolvers.slice(0, overflow);
        this._queueTexts = nextTexts.slice(overflow);
        this._queueResolvers = nextResolvers.slice(overflow);
        this._emitDebugEvent({
          stage: 'queue_backpressure',
          dropped: overflow,
          limit: EMBEDDING_QUEUE_LIMIT,
          queueDepth: this._queueTexts.length,
        });
        for (const droppedResolve of droppedResolvers) {
          droppedResolve(null);
        }
      } else {
        this._queueTexts = nextTexts;
        this._queueResolvers = nextResolvers;
      }

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
    const onProgress = this._config.onInitProgress;
    try {
      if (provider.kind === 'local') {
        onProgress?.('loading', `Loading local model...`);
        const timeoutMs = this._config.localInitTimeoutMs ?? 120_000;
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            this._initializeProvider(provider),
            new Promise<never>((_, reject) => {
              timeoutHandle = setTimeout(
                () => reject(new Error(`Local embedding init timed out after ${timeoutMs}ms`)),
                timeoutMs,
              );
            }),
          ]);
        } finally {
          if (timeoutHandle) {
            clearTimeout(timeoutHandle);
          }
        }
        onProgress?.('ready', 'Local embedding model ready.');
      } else {
        await this._initializeProvider(provider);
      }
      return provider;
    } catch (error) {
      if (provider.kind === 'local') {
        const isTimeout = error instanceof Error && error.message.includes('timed out');
        onProgress?.(isTimeout ? 'timeout' : 'error', error instanceof Error ? error.message : String(error));
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

  private _emitDebugEvent(payload: Record<string, unknown>): void {
    this._config.onDebugEvent?.(payload);
  }

  private _clearBatchTimer(): void {
    if (this._batchTimer) {
      clearTimeout(this._batchTimer);
      this._batchTimer = null;
    }
  }
}

export const embeddingManager = new EmbeddingManager();

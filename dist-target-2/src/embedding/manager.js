import { NoOpEmbeddingProvider } from './provider.js';
import { LocalEmbeddingProvider } from './local.js';
import { OpenAIEmbeddingProvider } from './openai.js';
export const EMBEDDING_QUEUE_LIMIT = 1_000;
export class EmbeddingManager {
    _provider = new NoOpEmbeddingProvider();
    _initialized = false;
    _initializing = null;
    _config = { provider: 'none' };
    _queueTexts = [];
    _queueResolvers = [];
    _batchTimer = null;
    _batchDelayMs = 50;
    configure(config) {
        this._config = { ...config };
        this._initialized = false;
        this._initializing = null;
        this._clearBatchTimer();
        this._drainQueueWithNull();
        void this._provider.dispose();
        this._provider = new NoOpEmbeddingProvider();
    }
    async embedBatch(texts) {
        if (texts.length === 0) {
            return [];
        }
        const pending = texts.map((text) => this._enqueue(text));
        return Promise.all(pending);
    }
    async embed(text) {
        const [result] = await this.embedBatch([text]);
        return result ?? null;
    }
    isReady() {
        return this._initialized && this._provider.isReady();
    }
    getQueueDepth() {
        return this._queueTexts.length;
    }
    get providerKind() {
        return this._provider.kind;
    }
    async dispose() {
        this._clearBatchTimer();
        this._drainQueueWithNull();
        await this._provider.dispose();
        this._provider = new NoOpEmbeddingProvider();
        this._initialized = false;
        this._initializing = null;
    }
    async warmup() {
        const start = Date.now();
        try {
            await this.embed('');
            const elapsedMs = Date.now() - start;
            return {
                ready: this.isReady(),
                provider: this.providerKind,
                elapsedMs,
            };
        }
        catch {
            const elapsedMs = Date.now() - start;
            return {
                ready: false,
                provider: this.providerKind,
                elapsedMs,
            };
        }
    }
    _enqueue(text) {
        return new Promise((resolve) => {
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
            }
            else {
                this._queueTexts = nextTexts;
                this._queueResolvers = nextResolvers;
            }
            this._scheduleFlush();
        });
    }
    _scheduleFlush() {
        if (this._batchTimer) {
            return;
        }
        this._batchTimer = setTimeout(() => {
            this._batchTimer = null;
            void this._flushQueue();
        }, this._batchDelayMs);
    }
    async _flushQueue() {
        if (this._queueTexts.length === 0) {
            return;
        }
        const texts = this._queueTexts;
        const resolvers = this._queueResolvers;
        this._queueTexts = [];
        this._queueResolvers = [];
        let results;
        try {
            results = await this._embedDirect(texts);
        }
        catch (error) {
            this._logProviderError(error);
            results = texts.map(() => null);
        }
        for (let i = 0; i < resolvers.length; i += 1) {
            resolvers[i](results[i] ?? null);
        }
    }
    async _embedDirect(texts) {
        if (texts.length === 0) {
            return [];
        }
        let provider;
        try {
            provider = await this._ensureProvider();
        }
        catch (error) {
            this._logProviderError(error);
            return texts.map(() => null);
        }
        if (!provider.isReady()) {
            return texts.map(() => null);
        }
        try {
            const vectors = await provider.embed(texts);
            return this._normalizeProviderOutput(texts.length, vectors);
        }
        catch (error) {
            this._logProviderError(error);
            await provider.dispose().catch(() => undefined);
            this._initialized = false;
            this._provider = new NoOpEmbeddingProvider();
            return texts.map(() => null);
        }
    }
    _normalizeProviderOutput(expected, output) {
        const normalized = [];
        for (let i = 0; i < expected; i += 1) {
            normalized.push(output[i] ?? null);
        }
        return normalized;
    }
    async _ensureProvider() {
        if (this._initialized) {
            return this._provider;
        }
        if (!this._initializing) {
            this._initializing = this._setup().then((provider) => {
                this._provider = provider;
                this._initialized = true;
                this._initializing = null;
                return provider;
            }, (error) => {
                this._initializing = null;
                throw error;
            });
        }
        return this._initializing;
    }
    async _setup() {
        const provider = this._createProvider();
        const onProgress = this._config.onInitProgress;
        try {
            if (provider.kind === 'local') {
                onProgress?.('loading', `Loading local model...`);
                const timeoutMs = this._config.localInitTimeoutMs ?? 120_000;
                let timeoutHandle;
                try {
                    await Promise.race([
                        this._initializeProvider(provider),
                        new Promise((_, reject) => {
                            timeoutHandle = setTimeout(() => reject(new Error(`Local embedding init timed out after ${timeoutMs}ms`)), timeoutMs);
                        }),
                    ]);
                }
                finally {
                    if (timeoutHandle) {
                        clearTimeout(timeoutHandle);
                    }
                }
                onProgress?.('ready', 'Local embedding model ready.');
            }
            else {
                await this._initializeProvider(provider);
            }
            return provider;
        }
        catch (error) {
            if (provider.kind === 'local') {
                const isTimeout = error instanceof Error && error.message.includes('timed out');
                onProgress?.(isTimeout ? 'timeout' : 'error', error instanceof Error ? error.message : String(error));
                console.warn('[EmbeddingManager] Local embedding provider failed to initialize. Falling back to NoOp provider.', error);
                await provider.dispose().catch(() => undefined);
                return new NoOpEmbeddingProvider();
            }
            throw error;
        }
    }
    _createProvider() {
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
    async _initializeProvider(provider) {
        const initializable = provider;
        if (typeof initializable.initialize === 'function') {
            await initializable.initialize();
        }
    }
    _drainQueueWithNull() {
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
    _logProviderError(error) {
        console.warn(`[EmbeddingManager] Provider error (${this._provider.kind}):`, error);
    }
    _emitDebugEvent(payload) {
        this._config.onDebugEvent?.(payload);
    }
    _clearBatchTimer() {
        if (this._batchTimer) {
            clearTimeout(this._batchTimer);
            this._batchTimer = null;
        }
    }
}
export const embeddingManager = new EmbeddingManager();

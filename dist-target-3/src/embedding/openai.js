import { createRequire } from 'node:module';
const MAX_OPENAI_BATCH = 100;
const MAX_ERROR_BODY_LENGTH = 200;
export class OpenAIEmbeddingProvider {
    kind = 'openai';
    dimensions = 1536;
    _apiKey;
    _model;
    _client = null;
    _transport;
    constructor(options) {
        this._apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
        this._model =
            options?.model ??
                process.env.EVERMEMORY_OPENAI_MODEL ??
                'text-embedding-3-small';
        this._transport = OpenAIEmbeddingProvider._hasOpenAIDependency()
            ? 'sdk'
            : 'http';
    }
    static _hasOpenAIDependency() {
        try {
            const require = createRequire(import.meta.url);
            const pkg = require('../../package.json');
            return Boolean(pkg.dependencies?.openai || pkg.devDependencies?.openai);
        }
        catch {
            return false;
        }
    }
    isReady() {
        return Boolean(this._apiKey);
    }
    async embed(texts) {
        const apiKey = this._apiKey;
        if (!apiKey) {
            throw new Error('OpenAI API key is not configured');
        }
        if (texts.length === 0) {
            return [];
        }
        const vectors = [];
        for (let i = 0; i < texts.length; i += MAX_OPENAI_BATCH) {
            const chunk = texts.slice(i, i + MAX_OPENAI_BATCH);
            const chunkVectors = await this._generateChunkEmbeddings(chunk);
            vectors.push(...chunkVectors);
        }
        return vectors;
    }
    async dispose() {
        this._client = null;
    }
    async _generateChunkEmbeddings(inputs) {
        const payload = this._transport === 'sdk'
            ? await this._embedWithSdk(inputs).catch((error) => {
                this._transport = 'http';
                return this._embedWithHttp(inputs, error);
            })
            : await this._embedWithHttp(inputs);
        return payload.map((item) => {
            const values = this._toFloat32Array(item.embedding);
            return {
                values,
                dimensions: values.length,
            };
        });
    }
    async _embedWithSdk(inputs) {
        const client = await this._loadSdkClient();
        const response = await client.embeddings.create({
            model: this._model,
            input: inputs,
        });
        return response.data;
    }
    async _embedWithHttp(inputs, sdkError) {
        const apiKey = this._apiKey;
        if (!apiKey) {
            throw sdkError ?? new Error('OpenAI API key is not configured');
        }
        const response = await fetch('https://api.openai.com/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: this._model,
                input: inputs,
            }),
        });
        if (!response.ok) {
            const message = (await response.text()).slice(0, MAX_ERROR_BODY_LENGTH);
            throw new Error(`OpenAI HTTP API error: ${response.status} ${response.statusText} ${message}`);
        }
        const payload = (await response.json());
        return payload.data;
    }
    async _loadSdkClient() {
        if (this._client) {
            return this._client;
        }
        const apiKey = this._apiKey;
        if (!apiKey) {
            throw new Error('OpenAI API key is not configured');
        }
        const moduleName = 'openai';
        const imported = await import(moduleName);
        const OpenAIConstructor = imported.default ??
            imported.OpenAI;
        if (typeof OpenAIConstructor !== 'function') {
            throw new Error('OpenAI SDK is unavailable');
        }
        this._client = new OpenAIConstructor({ apiKey });
        return this._client;
    }
    _toFloat32Array(values) {
        if (values instanceof Float32Array) {
            return values;
        }
        const result = new Float32Array(values.length);
        for (let i = 0; i < values.length; i += 1) {
            const value = values[i];
            result[i] = typeof value === 'number' ? value : 0;
        }
        return result;
    }
}

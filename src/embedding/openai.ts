import { createRequire } from 'node:module';
import type { EmbeddingProvider, EmbeddingVector } from './provider.js';

const MAX_OPENAI_BATCH = 100;

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type OpenAIConstructor = new (config: { apiKey: string }) => OpenAIClientLike;

type OpenAIClientLike = {
  embeddings: {
    create(params: {
      model: string;
      input: string[];
    }): Promise<{ data: OpenAIEmbeddingData[] }>;
  };
};

type OpenAIEmbeddingData = {
  index: number;
  embedding: number[] | Float32Array;
};

type OpenAIEmbeddingsResponse = {
  data: OpenAIEmbeddingData[];
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'openai' as const;
  readonly dimensions = 1536;

  private readonly _apiKey?: string;
  private readonly _model: string;
  private _client: OpenAIClientLike | null = null;
  private _transport: 'sdk' | 'http';

  constructor(options?: { apiKey?: string; model?: string }) {
    this._apiKey = options?.apiKey ?? process.env.OPENAI_API_KEY;
    this._model =
      options?.model ??
      process.env.EVERMEMORY_OPENAI_MODEL ??
      'text-embedding-3-small';
    this._transport = OpenAIEmbeddingProvider._hasOpenAIDependency()
      ? 'sdk'
      : 'http';
  }

  private static _hasOpenAIDependency(): boolean {
    try {
      const require = createRequire(import.meta.url);
      const pkg = require('../../package.json') as PackageManifest;
      return Boolean(pkg.dependencies?.openai || pkg.devDependencies?.openai);
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return Boolean(this._apiKey);
  }

  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    const apiKey = this._apiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    if (texts.length === 0) {
      return [];
    }

    const vectors: EmbeddingVector[] = [];
    for (let i = 0; i < texts.length; i += MAX_OPENAI_BATCH) {
      const chunk = texts.slice(i, i + MAX_OPENAI_BATCH);
      const chunkVectors = await this._generateChunkEmbeddings(chunk);
      vectors.push(...chunkVectors);
    }
    return vectors;
  }

  async dispose(): Promise<void> {
    this._client = null;
  }

  private async _generateChunkEmbeddings(
    inputs: string[]
  ): Promise<EmbeddingVector[]> {
    const payload =
      this._transport === 'sdk'
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

  private async _embedWithSdk(
    inputs: string[]
  ): Promise<OpenAIEmbeddingData[]> {
    const client = await this._loadSdkClient();
    const response = await client.embeddings.create({
      model: this._model,
      input: inputs,
    });
    return response.data;
  }

  private async _embedWithHttp(
    inputs: string[],
    sdkError?: unknown
  ): Promise<OpenAIEmbeddingData[]> {
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
      const message = await response.text();
      throw new Error(
        `OpenAI HTTP API error: ${response.status} ${response.statusText} ${message}`
      );
    }

    const payload = (await response.json()) as OpenAIEmbeddingsResponse;
    return payload.data;
  }

  private async _loadSdkClient(): Promise<OpenAIClientLike> {
    if (this._client) {
      return this._client;
    }

    const apiKey = this._apiKey;
    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const moduleName: string = 'openai';
    const imported = await import(moduleName);
    const OpenAIConstructor: OpenAIConstructor | undefined =
      (imported as { default?: OpenAIConstructor }).default ??
      (imported as { OpenAI?: OpenAIConstructor }).OpenAI;

    if (typeof OpenAIConstructor !== 'function') {
      throw new Error('OpenAI SDK is unavailable');
    }

    this._client = new OpenAIConstructor({ apiKey });
    return this._client;
  }

  private _toFloat32Array(values: ArrayLike<number>): Float32Array {
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

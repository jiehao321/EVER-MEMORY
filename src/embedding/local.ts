import type { EmbeddingProvider, EmbeddingVector } from './provider.js';

type ArrayLikeNumber = ArrayLike<number>;

type TensorLike = {
  data: ArrayLikeNumber;
  dims?: number[];
};

type FeatureExtractionResultObject = {
  data?: ArrayLikeNumber;
  dims?: number[];
  tensor?: TensorLike;
};

type FeatureExtractionPipeline = (
  input: string,
  options?: Record<string, unknown>
) => Promise<FeatureExtractionResult>;

type FeatureExtractionResult =
  | TensorLike
  | ArrayLikeNumber
  | ArrayLikeNumber[]
  | TensorLike[]
  | FeatureExtractionResultObject;

type TransformersModule = {
  pipeline: (
    task: string,
    model?: string,
    options?: Record<string, unknown>
  ) => Promise<FeatureExtractionPipeline>;
};

export const LOCAL_EMBEDDING_DEPENDENCY_ERROR_CODE =
  'EVERMEMORY_LOCAL_EMBEDDING_DEPENDENCY_MISSING';

export class LocalEmbeddingDependencyError extends Error {
  readonly code = LOCAL_EMBEDDING_DEPENDENCY_ERROR_CODE;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'LocalEmbeddingDependencyError';
    if (options && 'cause' in options) {
      Object.defineProperty(this, 'cause', {
        configurable: true,
        enumerable: false,
        value: options.cause,
        writable: true,
      });
    }
  }
}

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly kind = 'local' as const;
  readonly dimensions = 384;

  private _pipeline: FeatureExtractionPipeline | null = null;
  private readonly _modelName: string;

  constructor(modelName?: string) {
    this._modelName =
      modelName ?? process.env.EVERMEMORY_LOCAL_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
  }

  isReady(): boolean {
    return this._pipeline !== null;
  }

  async initialize(): Promise<void> {
    await this._loadPipeline();
  }

  async embed(texts: string[]): Promise<EmbeddingVector[]> {
    if (texts.length === 0) {
      return [];
    }

    const pipeline = await this._loadPipeline();
    const vectors: EmbeddingVector[] = [];
    for (const text of texts) {
      const output = await pipeline(text);
      const tensor = this._tensorFromResult(output);
      const pooled = this._meanPool(tensor);
      const normalized = this._l2Normalize(pooled);
      vectors.push({
        values: normalized,
        dimensions: normalized.length,
      });
    }

    return vectors;
  }

  async dispose(): Promise<void> {
    this._pipeline = null;
  }

  private async _loadPipeline(): Promise<FeatureExtractionPipeline> {
    if (this._pipeline) {
      return this._pipeline;
    }

    this._pipeline = await this._initialize();
    return this._pipeline;
  }

  private async _initialize(): Promise<FeatureExtractionPipeline> {
    const moduleName: string = '@xenova/transformers';
    let transformersModule: TransformersModule;
    try {
      transformersModule = (await import(moduleName)) as TransformersModule;
    } catch (error) {
      const message =
        'LocalEmbeddingProvider: @xenova/transformers not installed. Run: npm install @xenova/transformers';
      console.error(message);
      throw new LocalEmbeddingDependencyError(message, { cause: error });
    }

    if (typeof transformersModule.pipeline !== 'function') {
      throw new Error('Invalid transformers pipeline module');
    }

    return transformersModule.pipeline(
      'feature-extraction',
      this._modelName
    );
  }

  private _tensorFromResult(result: FeatureExtractionResult): TensorLike {
    if (this._isTensorLike(result)) {
      return {
        data: this._toFloat32Array(result.data),
        dims: result.dims,
      };
    }

    if (this._isArrayLikeNumber(result)) {
      const data = this._toFloat32Array(result);
      return { data, dims: [1, data.length] };
    }

    if (Array.isArray(result)) {
      if (result.length === 0) {
        throw new Error('Received empty feature extraction result');
      }

      const first = result[0];
      if (this._isTensorLike(first)) {
        return this._tensorFromResult(first);
      }

      if (this._isArrayLikeNumberMatrix(result)) {
        const rows = result;
        const tokens = rows.length;
        const features = rows[0]?.length ?? 0;
        const data = new Float32Array(tokens * features);
        let offset = 0;
        for (const row of rows) {
          for (let i = 0; i < features; i += 1) {
            data[offset] = Number(row[i] ?? 0);
            offset += 1;
          }
        }
        return { data, dims: [tokens, features] };
      }

      if (this._isNumberArray(result)) {
        const data = this._toFloat32Array(result);
        return { data, dims: [1, data.length] };
      }
    }

    if (this._isFeatureExtractionResultObject(result)) {
      if (result.tensor) {
        return this._tensorFromResult(result.tensor as FeatureExtractionResult);
      }

      const { data, dims } = result;
      if (this._isArrayLikeNumber(data)) {
        return {
          data: this._toFloat32Array(data),
          dims: Array.isArray(dims)
            ? dims.map((value) => Number(value))
            : undefined,
        };
      }
    }

    throw new Error('Unsupported feature extraction result format');
  }

  private _meanPool(tensor: TensorLike): Float32Array {
    const data = this._toFloat32Array(tensor.data);
    const dims = tensor.dims ?? [];
    let featureCount =
      dims.length >= 2 && Number.isFinite(dims[dims.length - 1])
        ? Number(dims[dims.length - 1])
        : data.length;
    const tokenCount =
      dims.length >= 2 && Number.isFinite(dims[dims.length - 2])
        ? Math.max(1, Number(dims[dims.length - 2]))
        : 1;

    if (tokenCount <= 1) {
      return data.slice(0);
    }

    if (tokenCount * featureCount !== data.length && tokenCount > 0) {
      featureCount = Math.max(1, Math.floor(data.length / tokenCount));
    }

    const pooled = new Float32Array(featureCount);
    for (let token = 0; token < tokenCount; token += 1) {
      const baseIndex = token * featureCount;
      for (let i = 0; i < featureCount; i += 1) {
        pooled[i] += data[baseIndex + i] ?? 0;
      }
    }

    const scale = 1 / tokenCount;
    for (let i = 0; i < featureCount; i += 1) {
      pooled[i] *= scale;
    }

    return pooled;
  }

  private _l2Normalize(vector: Float32Array): Float32Array {
    let sum = 0;
    for (let i = 0; i < vector.length; i += 1) {
      const value = vector[i];
      sum += value * value;
    }

    if (sum === 0) {
      return vector.slice(0);
    }

    const norm = Math.sqrt(sum);
    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i += 1) {
      normalized[i] = vector[i] / norm;
    }

    return normalized;
  }

  private _toFloat32Array(source: ArrayLikeNumber): Float32Array {
    if (source instanceof Float32Array) {
      return source;
    }

    const target = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 1) {
      const value = source[i];
      target[i] = typeof value === 'number' ? value : 0;
    }
    return target;
  }

  private _isTensorLike(value: unknown): value is TensorLike {
    return (
      typeof value === 'object' &&
      value !== null &&
      'data' in value &&
      this._isArrayLikeNumber((value as { data?: unknown }).data)
    );
  }

  private _isArrayLikeNumber(value: unknown): value is ArrayLikeNumber {
    return (
      typeof value === 'object' &&
      value !== null &&
      'length' in value &&
      typeof (value as { length: unknown }).length === 'number'
    );
  }

  private _isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'number');
  }

  private _isArrayLikeNumberMatrix(value: unknown): value is ArrayLikeNumber[] {
    return Array.isArray(value) && value.every((item) => this._isArrayLikeNumber(item));
  }

  private _isFeatureExtractionResultObject(value: unknown): value is FeatureExtractionResultObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

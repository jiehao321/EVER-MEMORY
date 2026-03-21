export const LOCAL_EMBEDDING_DEPENDENCY_ERROR_CODE = 'EVERMEMORY_LOCAL_EMBEDDING_DEPENDENCY_MISSING';
export class LocalEmbeddingDependencyError extends Error {
    code = LOCAL_EMBEDDING_DEPENDENCY_ERROR_CODE;
    constructor(message, options) {
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
export class LocalEmbeddingProvider {
    kind = 'local';
    dimensions = 384;
    _pipeline = null;
    _modelName;
    constructor(modelName) {
        this._modelName =
            modelName ?? process.env.EVERMEMORY_LOCAL_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
    }
    isReady() {
        return this._pipeline !== null;
    }
    async initialize() {
        await this._loadPipeline();
    }
    async embed(texts) {
        if (texts.length === 0) {
            return [];
        }
        const pipeline = await this._loadPipeline();
        const vectors = [];
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
    async dispose() {
        this._pipeline = null;
    }
    async _loadPipeline() {
        if (this._pipeline) {
            return this._pipeline;
        }
        this._pipeline = await this._initialize();
        return this._pipeline;
    }
    async _initialize() {
        const moduleName = '@xenova/transformers';
        let transformersModule;
        try {
            transformersModule = (await import(moduleName));
        }
        catch (error) {
            // This fallback is retained for broken/manual installs; the package is a normal dependency.
            const message = 'LocalEmbeddingProvider: @xenova/transformers not installed. Run: npm install @xenova/transformers';
            console.error(message);
            throw new LocalEmbeddingDependencyError(message, { cause: error });
        }
        if (typeof transformersModule.pipeline !== 'function') {
            throw new Error('Invalid transformers pipeline module');
        }
        return transformersModule.pipeline('feature-extraction', this._modelName);
    }
    _tensorFromResult(result) {
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
                return this._tensorFromResult(result.tensor);
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
    _meanPool(tensor) {
        const data = this._toFloat32Array(tensor.data);
        const dims = tensor.dims ?? [];
        let featureCount = dims.length >= 2 && Number.isFinite(dims[dims.length - 1])
            ? Number(dims[dims.length - 1])
            : data.length;
        const tokenCount = dims.length >= 2 && Number.isFinite(dims[dims.length - 2])
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
    _l2Normalize(vector) {
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
    _toFloat32Array(source) {
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
    _isTensorLike(value) {
        return (typeof value === 'object' &&
            value !== null &&
            'data' in value &&
            this._isArrayLikeNumber(value.data));
    }
    _isArrayLikeNumber(value) {
        return (typeof value === 'object' &&
            value !== null &&
            'length' in value &&
            typeof value.length === 'number');
    }
    _isNumberArray(value) {
        return Array.isArray(value) && value.every((item) => typeof item === 'number');
    }
    _isArrayLikeNumberMatrix(value) {
        return Array.isArray(value) && value.every((item) => this._isArrayLikeNumber(item));
    }
    _isFeatureExtractionResultObject(value) {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }
}

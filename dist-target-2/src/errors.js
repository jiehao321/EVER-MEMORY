export class EverMemoryError extends Error {
    code;
    context;
    constructor(message, options = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = new.target.name;
        this.code = options.code ?? 'EVERMEMORY_ERROR';
        this.context = options.context;
    }
}
export class StorageError extends EverMemoryError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code ?? 'STORAGE_ERROR',
        });
    }
}
export class RetrievalError extends EverMemoryError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code ?? 'RETRIEVAL_ERROR',
        });
    }
}
export class PolicyError extends EverMemoryError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code ?? 'POLICY_ERROR',
        });
    }
}
export class ProfileError extends EverMemoryError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code ?? 'PROFILE_ERROR',
        });
    }
}
export class BriefingError extends EverMemoryError {
    constructor(message, options = {}) {
        super(message, {
            ...options,
            code: options.code ?? 'BRIEFING_ERROR',
        });
    }
}

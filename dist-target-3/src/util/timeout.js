/**
 * A4: withTimeout wraps a promise and rejects after `ms` milliseconds.
 * Use for non-critical async steps in session lifecycle hooks so that
 * a slow operation never blocks session teardown indefinitely.
 */
export function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`[evermemory] ${label} timed out after ${ms}ms`));
        }, ms);
        promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
}

/**
 * A4: withTimeout wraps a promise and rejects after `ms` milliseconds.
 * Use for non-critical async steps in session lifecycle hooks so that
 * a slow operation never blocks session teardown indefinitely.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[evermemory] ${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

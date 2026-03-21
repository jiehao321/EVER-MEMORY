/**
 * Safely parse JSON with fallback value on error
 */
export function safeJsonParse(raw, fallback) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
/**
 * Safely parse JSON or return null on error
 */
export function safeJsonParseOrNull(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}

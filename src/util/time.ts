/**
 * Centralized time utility — replaces 26+ local nowIso() definitions.
 */
export function nowIso(): string {
  return new Date().toISOString();
}

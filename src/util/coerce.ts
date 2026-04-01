/**
 * Type coercion helpers for tool input parsing.
 */
export function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function toString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function toBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

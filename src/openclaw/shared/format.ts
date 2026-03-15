export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function truncate(text: string, max = 220): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, max - 1))}…`;
}

export function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

export function asOptionalInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

export function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function asOptionalEnum<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  const normalized = asOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return (values as readonly string[]).includes(normalized) ? (normalized as T[number]) : undefined;
}

export function parseScope(
  value: unknown,
): { userId?: string; chatId?: string; project?: string; global?: boolean } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const userId = asOptionalString(value.userId);
  const chatId = asOptionalString(value.chatId);
  const project = asOptionalString(value.project);
  const global = asOptionalBoolean(value.global);
  if (!userId && !chatId && !project && global === undefined) {
    return undefined;
  }
  return { userId, chatId, project, global };
}

export function mergeScope(
  base: { userId?: string; chatId?: string; project?: string; global?: boolean },
  override?: { userId?: string; chatId?: string; project?: string; global?: boolean },
): { userId?: string; chatId?: string; project?: string; global?: boolean } {
  if (!override) {
    return base;
  }
  return {
    userId: override.userId ?? base.userId,
    chatId: override.chatId ?? base.chatId,
    project: override.project ?? base.project,
    global: override.global ?? base.global,
  };
}

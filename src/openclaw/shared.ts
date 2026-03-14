import { Type } from '@sinclair/typebox';
import {
  CONSOLIDATION_MODES,
  INTENT_TYPES,
  MEMORY_LIFECYCLES,
  MEMORY_TYPES,
  PLUGIN_NAME,
  RETRIEVAL_MODES,
} from '../constants.js';
import { EverMemoryError } from '../errors.js';
import { getDefaultConfig, initializeEverMemory } from '../index.js';
import { ARCHIVE_MAX_REVIEW_LIMIT, TRANSFER_MAX_EXPORT_LIMIT } from '../tuning.js';

export type UnknownRecord = Record<string, unknown>;
export type EverMemoryRuntime = ReturnType<typeof initializeEverMemory>;
export type HookHandler = (event: unknown, context: unknown) => Promise<unknown> | unknown;

export interface SessionScopeState {
  scope: {
    userId?: string;
    chatId?: string;
    project?: string;
  };
  channel?: string;
  sessionKey?: string;
  sessionStartBindingKey?: string;
}

export interface HostBinding {
  userId?: string;
  chatId?: string;
  channel?: string;
  sessionKey?: string;
}

export interface OpenClawLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

export interface ToolRegistrationOptions {
  name?: string;
  names?: string[];
}

export interface OpenClawService {
  id: string;
  start: () => void | Promise<void>;
  stop?: () => void | Promise<void>;
}

export interface OpenClawApi {
  pluginConfig?: UnknownRecord;
  resolvePath: (input: string) => string;
  logger: OpenClawLogger;
  on: (name: string, handler: HookHandler) => void;
  registerTool: (tool: unknown, opts?: ToolRegistrationOptions) => void;
  registerService: (service: OpenClawService) => void;
}

export interface OpenClawRegistrationContext {
  api: OpenClawApi;
  evermemory: EverMemoryRuntime;
  sessionScopes: Map<string, SessionScopeState>;
}

function toPluginError(error: unknown, code: string): EverMemoryError {
  if (error instanceof EverMemoryError) {
    return error;
  }
  return new EverMemoryError(toErrorMessage(error), {
    code,
    cause: error,
  });
}

export function createRegistrationContext(api: OpenClawApi): OpenClawRegistrationContext {
  const runtimeConfig = buildRuntimeConfig(api);
  return {
    api,
    evermemory: initializeEverMemory(runtimeConfig),
    sessionScopes: new Map<string, SessionScopeState>(),
  };
}

export function registerHook(api: OpenClawApi, hookName: string, handler: HookHandler): void {
  api.on(hookName, async (event: unknown, context: unknown) => {
    try {
      return await handler(event, context);
    } catch (error) {
      const pluginError = toPluginError(error, 'OPENCLAW_HOOK_ERROR');
      api.logger.warn(`${PLUGIN_NAME}: hook "${hookName}" failed: ${toErrorMessage(pluginError)}`);
      return undefined;
    }
  });
}

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

function readPath(source: unknown, path: readonly string[]): unknown {
  let current: unknown = source;
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function pickFirstString(source: unknown, paths: readonly (readonly string[])[]): string | undefined {
  for (const path of paths) {
    const value = asOptionalString(readPath(source, path));
    if (value) {
      return value;
    }
  }
  return undefined;
}

function inferChannelFromSessionKey(sessionKey: string | undefined): string | undefined {
  if (!sessionKey) {
    return undefined;
  }
  const normalized = sessionKey.toLowerCase();
  const knownChannels = ['feishu', 'discord', 'slack', 'telegram', 'wechat', 'web', 'cli'];
  return knownChannels.find((channel) => (
    normalized.startsWith(`${channel}:`) || normalized.includes(`:${channel}:`) || normalized.includes(`/${channel}/`)
  ));
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

const MEMORY_SOURCE_KINDS = [
  'message',
  'tool',
  'manual',
  'summary',
  'inference',
  'test',
  'runtime_user',
  'runtime_project',
  'reflection_derived',
  'imported',
] as const;

const MEMORY_SOURCE_ACTORS = ['user', 'assistant', 'system'] as const;

export function parseMemorySource(
  value: unknown,
): {
    kind: (typeof MEMORY_SOURCE_KINDS)[number];
    actor?: (typeof MEMORY_SOURCE_ACTORS)[number];
    sessionId?: string;
    messageId?: string;
    channel?: string;
  } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = asOptionalEnum(value.kind, MEMORY_SOURCE_KINDS);
  if (!kind) {
    return undefined;
  }
  return {
    kind,
    actor: asOptionalEnum(value.actor, MEMORY_SOURCE_ACTORS),
    sessionId: asOptionalString(value.sessionId),
    messageId: asOptionalString(value.messageId),
    channel: asOptionalString(value.channel),
  };
}

function buildRuntimeConfig(api: { pluginConfig?: UnknownRecord; resolvePath: (input: string) => string }) {
  const config = isRecord(api.pluginConfig) ? { ...api.pluginConfig } : {};
  const defaultPath = getDefaultConfig().databasePath;
  const configuredPath = asOptionalString(config.databasePath) ?? defaultPath;
  config.databasePath = api.resolvePath(configuredPath);
  return config;
}

function extractMessageText(message: unknown): string {
  if (!isRecord(message)) {
    return '';
  }

  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => {
        if (!isRecord(block)) {
          return '';
        }
        return typeof block.text === 'string' ? block.text : '';
      })
      .filter((value) => value.length > 0);
    return parts.join('\n');
  }

  return '';
}

export function extractLastExchange(messages: unknown[]): { userText?: string; assistantText?: string } {
  let userText: string | undefined;
  let assistantText: string | undefined;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message)) {
      continue;
    }
    const role = asOptionalString(message.role);
    if (!role) {
      continue;
    }
    const text = asOptionalString(extractMessageText(message));
    if (!text) {
      continue;
    }

    if (!assistantText && role === 'assistant') {
      assistantText = text;
      continue;
    }
    if (!userText && role === 'user') {
      userText = text;
      if (assistantText) {
        break;
      }
    }
  }

  return { userText, assistantText };
}

export function buildInjectedContext(
  recallItems: Array<{ type: string; lifecycle: string; content: string; tags?: string[] }>,
  behaviorRules: Array<{ statement: string; priority?: number }> | undefined,
): {
    prependContext?: string;
    stats: {
      recalledInput: number;
      memorySelected: number;
      memoryDeduped: number;
      rulesInput: number;
      rulesSelected: number;
      rulesDeduped: number;
      approxTokens: number;
    };
  } {
  const normalizeKey = (value: string): string => value
    .toLowerCase()
    .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：|项目连续性摘要（[^）]+）：)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  const typePriority = (item: { type: string; tags?: string[] }): number => {
    if (item.type === 'summary' && (item.tags?.includes('active_project_summary') || item.tags?.includes('project_continuity'))) {
      return 100;
    }
    if (item.type === 'project') {
      return 90;
    }
    if (item.type === 'decision') {
      return 80;
    }
    if (item.type === 'constraint') {
      return 70;
    }
    if (item.type === 'commitment') {
      return 60;
    }
    return 20;
  };

  const dedupedRecallItems = [...recallItems]
    .sort((left, right) => typePriority(right) - typePriority(left))
    .reduce<Array<{ type: string; lifecycle: string; content: string; tags?: string[] }>>((acc, item) => {
      if (acc.length >= 5) {
        return acc;
      }
      const key = normalizeKey(item.content);
      if (!key) {
        return acc;
      }
      if (acc.some((existing) => normalizeKey(existing.content) === key)) {
        return acc;
      }
      acc.push(item);
      return acc;
    }, []);

  const memoryLines = dedupedRecallItems
    .map((item, index) => `${index + 1}. [${item.type}/${item.lifecycle}] ${truncate(item.content, 200)}`);

  const seenText = new Set(memoryLines.map((line) => normalizeKey(line)));
  const ruleInputs = (behaviorRules ?? [])
    .filter((rule) => typeof rule.statement === 'string' && rule.statement.trim().length > 0);
  const ruleLines = ruleInputs
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
    .reduce<string[]>((acc, rule) => {
      if (acc.length >= 3) {
        return acc;
      }
      const key = normalizeKey(rule.statement);
      if (!key || seenText.has(key) || acc.some((line) => normalizeKey(line) === key)) {
        return acc;
      }
      seenText.add(key);
      acc.push(rule.statement);
      return acc;
    }, [])
    .map((statement, index) => `${index + 1}. ${truncate(statement, 160)}`);

  if (memoryLines.length === 0 && ruleLines.length === 0) {
    return {
      prependContext: undefined,
      stats: {
        recalledInput: recallItems.length,
        memorySelected: 0,
        memoryDeduped: recallItems.length,
        rulesInput: ruleInputs.length,
        rulesSelected: 0,
        rulesDeduped: ruleInputs.length,
        approxTokens: 0,
      },
    };
  }

  const sections: string[] = ['<evermemory-context>'];
  if (memoryLines.length > 0) {
    sections.push('Relevant memory:');
    sections.push(...memoryLines.map((line) => `- ${line}`));
  }
  if (ruleLines.length > 0) {
    sections.push('Applicable behavior rules:');
    sections.push(...ruleLines.map((line) => `- ${line}`));
  }
  sections.push('</evermemory-context>');
  const prependContext = sections.join('\n');
  return {
    prependContext,
    stats: {
      recalledInput: recallItems.length,
      memorySelected: memoryLines.length,
      memoryDeduped: Math.max(0, recallItems.length - memoryLines.length),
      rulesInput: ruleInputs.length,
      rulesSelected: ruleLines.length,
      rulesDeduped: Math.max(0, ruleInputs.length - ruleLines.length),
      approxTokens: Math.ceil(prependContext.length / 4),
    },
  };
}

function resolveHostBinding(event: unknown, context: unknown): HostBinding {
  const sources = [context, event];
  const sessionKey = sources
    .map((source) => pickFirstString(source, [
      ['sessionKey'],
      ['session_key'],
      ['session', 'key'],
    ]))
    .find((value) => Boolean(value));
  const userId = sources
    .map((source) => pickFirstString(source, [
      ['requesterSenderId'],
      ['requester_sender_id'],
      ['userId'],
      ['user_id'],
      ['requesterUserId'],
      ['requester_user_id'],
      ['senderId'],
      ['sender_id'],
      ['fromUserId'],
      ['from_user_id'],
      ['openId'],
      ['open_id'],
      ['requester', 'senderId'],
      ['requester', 'sender_id'],
      ['requester', 'userId'],
      ['requester', 'user_id'],
      ['requester', 'id'],
      ['sender', 'id'],
      ['sender', 'senderId'],
      ['sender', 'userId'],
      ['message', 'senderId'],
      ['message', 'sender_id'],
      ['message', 'userId'],
      ['message', 'user_id'],
      ['message', 'sender', 'id'],
    ]))
    .find((value) => Boolean(value));
  const chatId = sources
    .map((source) => pickFirstString(source, [
      ['chatId'],
      ['chat_id'],
      ['conversationId'],
      ['conversation_id'],
      ['threadId'],
      ['thread_id'],
      ['roomId'],
      ['room_id'],
      ['chat', 'id'],
      ['chat', 'chatId'],
      ['chat', 'chat_id'],
      ['conversation', 'id'],
      ['conversation', 'chatId'],
      ['conversation', 'chat_id'],
      ['message', 'chatId'],
      ['message', 'chat_id'],
      ['message', 'conversationId'],
      ['message', 'conversation_id'],
    ]))
    .find((value) => Boolean(value))
    ?? sessionKey;
  const channel = (
    sources
      .map((source) => pickFirstString(source, [
        ['channelId'],
        ['channel_id'],
        ['channel'],
        ['messageChannel'],
        ['message_channel'],
        ['platform'],
        ['message', 'channel'],
        ['message', 'channelId'],
        ['message', 'channel_id'],
        ['meta', 'channel'],
      ]))
      .find((value) => Boolean(value))
    ?? inferChannelFromSessionKey(sessionKey)
  );
  return {
    userId,
    chatId,
    channel,
    sessionKey,
  };
}

function createScopeState(sessionId: string, binding: HostBinding = {}): SessionScopeState {
  const chatId = binding.chatId ?? binding.sessionKey ?? sessionId;
  return {
    sessionKey: binding.sessionKey,
    channel: binding.channel,
    scope: {
      userId: binding.userId,
      chatId,
      project: PLUGIN_NAME,
    },
  };
}

function mergeScopeState(
  current: SessionScopeState,
  sessionId: string,
  binding: HostBinding,
): SessionScopeState {
  const nextSessionKey = binding.sessionKey ?? current.sessionKey;
  return {
    ...current,
    sessionKey: nextSessionKey,
    channel: binding.channel ?? current.channel,
    scope: {
      userId: binding.userId ?? current.scope.userId,
      chatId: binding.chatId ?? current.scope.chatId ?? nextSessionKey ?? sessionId,
      project: current.scope.project ?? PLUGIN_NAME,
    },
  };
}

function buildScopeBindingKey(state: SessionScopeState): string {
  return [
    state.scope.userId ?? '',
    state.scope.chatId ?? '',
    state.scope.project ?? '',
    state.channel ?? '',
  ].join('|');
}

export function upsertScopeState(
  sessionScopes: Map<string, SessionScopeState>,
  sessionId: string,
  event: unknown,
  context: unknown,
): SessionScopeState {
  const binding = resolveHostBinding(event, context);
  const current = sessionScopes.get(sessionId);
  const next = current
    ? mergeScopeState(current, sessionId, binding)
    : createScopeState(sessionId, binding);
  sessionScopes.set(sessionId, next);
  return next;
}

export function syncSessionStartScope(
  evermemory: EverMemoryRuntime,
  sessionId: string,
  scopeState: SessionScopeState,
): boolean {
  const bindingKey = buildScopeBindingKey(scopeState);
  if (scopeState.sessionStartBindingKey === bindingKey) {
    return false;
  }
  evermemory.sessionStart({
    sessionId,
    userId: scopeState.scope.userId,
    chatId: scopeState.scope.chatId,
    project: scopeState.scope.project,
    channel: scopeState.channel,
  });
  scopeState.sessionStartBindingKey = bindingKey;
  return true;
}

export function resolveToolScope(
  sessionScopes: Map<string, SessionScopeState>,
  toolContext: UnknownRecord,
): { userId?: string; chatId?: string; project?: string; global?: boolean } {
  const sessionId = asOptionalString(toolContext.sessionId);
  const scopeState = sessionId
    ? upsertScopeState(sessionScopes, sessionId, undefined, toolContext)
    : undefined;
  const toolBinding = resolveHostBinding(undefined, toolContext);
  return {
    userId: toolBinding.userId ?? scopeState?.scope.userId,
    chatId: toolBinding.chatId ?? scopeState?.scope.chatId ?? toolBinding.sessionKey,
    project: scopeState?.scope.project ?? PLUGIN_NAME,
  };
}

export const memoryTypeSchema = Type.Optional(Type.Union(MEMORY_TYPES.map((value) => Type.Literal(value))));
export const memoryLifecycleSchema = Type.Optional(
  Type.Union(MEMORY_LIFECYCLES.map((value) => Type.Literal(value))),
);
export const retrievalModeSchema = Type.Optional(Type.Union(RETRIEVAL_MODES.map((value) => Type.Literal(value))));
export const intentTypeSchema = Type.Optional(Type.Union(INTENT_TYPES.map((value) => Type.Literal(value))));
export const consolidationModeSchema = Type.Optional(
  Type.Union(CONSOLIDATION_MODES.map((value) => Type.Literal(value))),
);
export const reflectModeSchema = Type.Optional(Type.Union([
  Type.Literal('light'),
  Type.Literal('full'),
]));
export const explainTopicSchema = Type.Optional(Type.Union([
  Type.Literal('write'),
  Type.Literal('retrieval'),
  Type.Literal('rule'),
]));
export const rulesActionSchema = Type.Optional(Type.Union([
  Type.Literal('freeze'),
  Type.Literal('deprecate'),
  Type.Literal('rollback'),
]));
export const importModeSchema = Type.Optional(Type.Union([
  Type.Literal('review'),
  Type.Literal('apply'),
]));
export const restoreModeSchema = Type.Optional(Type.Union([
  Type.Literal('review'),
  Type.Literal('apply'),
]));
export const restoreLifecycleSchema = Type.Optional(Type.Union([
  Type.Literal('working'),
  Type.Literal('episodic'),
  Type.Literal('semantic'),
]));
export const REFLECT_MODES = ['light', 'full'] as const;
export const RULE_MUTATION_ACTIONS = ['freeze', 'deprecate', 'rollback'] as const;
export const EXPLAIN_TOPICS = ['write', 'retrieval', 'rule'] as const;
export const IMPORT_MODES = ['review', 'apply'] as const;
export const RESTORE_MODES = ['review', 'apply'] as const;
export const RESTORE_TARGET_LIFECYCLES = ['working', 'episodic', 'semantic'] as const;
export const sourceSchema = Type.Optional(
  Type.Object(
    {
      kind: Type.Optional(Type.String()),
      actor: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
      messageId: Type.Optional(Type.String()),
      channel: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
);
export const scopeSchema = Type.Optional(
  Type.Object(
    {
      userId: Type.Optional(Type.String()),
      chatId: Type.Optional(Type.String()),
      project: Type.Optional(Type.String()),
      global: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
);

const OPENCLAW_EXPORT_LIMIT_MAX = Math.min(1000, TRANSFER_MAX_EXPORT_LIMIT);
const OPENCLAW_REVIEW_LIMIT_MAX = Math.min(100, ARCHIVE_MAX_REVIEW_LIMIT);

export const toolLimits = {
  explain: 20,
  export: OPENCLAW_EXPORT_LIMIT_MAX,
  recall: 20,
  restore: 100,
  review: OPENCLAW_REVIEW_LIMIT_MAX,
  rules: 50,
} as const;

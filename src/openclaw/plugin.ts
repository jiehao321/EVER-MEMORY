import { Type } from '@sinclair/typebox';
import {
  CONSOLIDATION_MODES,
  INTENT_TYPES,
  MEMORY_LIFECYCLES,
  MEMORY_TYPES,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  RETRIEVAL_MODES,
} from '../constants.js';
import { getDefaultConfig, initializeEverMemory } from '../index.js';

type UnknownRecord = Record<string, unknown>;
type EverMemoryRuntime = ReturnType<typeof initializeEverMemory>;

interface SessionScopeState {
  scope: {
    userId?: string;
    chatId?: string;
    project?: string;
  };
  channel?: string;
  sessionKey?: string;
  sessionStartBindingKey?: string;
}

interface HostBinding {
  userId?: string;
  chatId?: string;
  channel?: string;
  sessionKey?: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function truncate(text: string, max = 220): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(1, max - 1))}…`;
}

function asOptionalString(value: unknown): string | undefined {
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

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

function asOptionalInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asOptionalEnum<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  const normalized = asOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return (values as readonly string[]).includes(normalized) ? (normalized as T[number]) : undefined;
}

function parseScope(value: unknown): { userId?: string; chatId?: string; project?: string; global?: boolean } | undefined {
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

function mergeScope(
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

function parseMemorySource(
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

function buildRuntimeConfig(api: {
  pluginConfig?: UnknownRecord;
  resolvePath: (input: string) => string;
}) {
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

function extractLastExchange(messages: unknown[]): { userText?: string; assistantText?: string } {
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

function buildInjectedContext(
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

function upsertScopeState(
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

function syncSessionStartScope(
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

function resolveToolScope(
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

const memoryTypeSchema = Type.Optional(Type.Union(MEMORY_TYPES.map((value) => Type.Literal(value))));
const memoryLifecycleSchema = Type.Optional(
  Type.Union(MEMORY_LIFECYCLES.map((value) => Type.Literal(value))),
);
const retrievalModeSchema = Type.Optional(Type.Union(RETRIEVAL_MODES.map((value) => Type.Literal(value))));
const intentTypeSchema = Type.Optional(Type.Union(INTENT_TYPES.map((value) => Type.Literal(value))));
const consolidationModeSchema = Type.Optional(
  Type.Union(CONSOLIDATION_MODES.map((value) => Type.Literal(value))),
);
const reflectModeSchema = Type.Optional(Type.Union([
  Type.Literal('light'),
  Type.Literal('full'),
]));
const explainTopicSchema = Type.Optional(Type.Union([
  Type.Literal('write'),
  Type.Literal('retrieval'),
  Type.Literal('rule'),
]));
const rulesActionSchema = Type.Optional(Type.Union([
  Type.Literal('freeze'),
  Type.Literal('deprecate'),
  Type.Literal('rollback'),
]));
const importModeSchema = Type.Optional(Type.Union([
  Type.Literal('review'),
  Type.Literal('apply'),
]));
const restoreModeSchema = Type.Optional(Type.Union([
  Type.Literal('review'),
  Type.Literal('apply'),
]));
const restoreLifecycleSchema = Type.Optional(Type.Union([
  Type.Literal('working'),
  Type.Literal('episodic'),
  Type.Literal('semantic'),
]));
const REFLECT_MODES = ['light', 'full'] as const;
const RULE_MUTATION_ACTIONS = ['freeze', 'deprecate', 'rollback'] as const;
const EXPLAIN_TOPICS = ['write', 'retrieval', 'rule'] as const;
const IMPORT_MODES = ['review', 'apply'] as const;
const RESTORE_MODES = ['review', 'apply'] as const;
const RESTORE_TARGET_LIFECYCLES = ['working', 'episodic', 'semantic'] as const;
const sourceSchema = Type.Optional(
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

const scopeSchema = Type.Optional(
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

const memoryPlugin = {
  id: PLUGIN_NAME,
  name: 'EverMemory',
  description: 'Deterministic memory plugin for OpenClaw',
  version: PLUGIN_VERSION,
  kind: 'memory' as const,
  register(api: any) {
    const runtimeConfig = buildRuntimeConfig(api);
    const evermemory = initializeEverMemory(runtimeConfig);
    const sessionScopes = new Map<string, SessionScopeState>();

    const registerHook = (
      hookName: string,
      handler: (event: unknown, context: unknown) => Promise<unknown> | unknown,
    ) => {
      api.on(hookName, async (event: unknown, context: unknown) => {
        try {
          return await handler(event, context);
        } catch (error) {
          api.logger.warn(`${PLUGIN_NAME}: hook "${hookName}" failed: ${toErrorMessage(error)}`);
          return undefined;
        }
      });
    };

    registerHook('session_start', (event: unknown, context: unknown) => {
      const sessionId = (
        (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
        ?? (isRecord(context) ? asOptionalString(context.sessionId) : undefined)
      );
      if (!sessionId) {
        return;
      }

      const scopeState = upsertScopeState(sessionScopes, sessionId, event, context);
      syncSessionStartScope(evermemory, sessionId, scopeState);
    });

    registerHook('before_agent_start', (event: unknown, context: unknown) => {
      if (!isRecord(context)) {
        return undefined;
      }
      const prompt = isRecord(event) ? asOptionalString(event.prompt) : undefined;
      const sessionId = asOptionalString(context.sessionId)
        ?? (isRecord(event) ? asOptionalString(event.sessionId) : undefined);
      if (!prompt || !sessionId) {
        return undefined;
      }

      const scopeState = upsertScopeState(sessionScopes, sessionId, event, context);
      const scopeRebound = syncSessionStartScope(evermemory, sessionId, scopeState);
      const runId = asOptionalString(context.runId);

      const result = evermemory.messageReceived({
        sessionId,
        messageId: runId,
        text: prompt,
        scope: scopeState.scope,
        channel: scopeState.channel,
      });

      const injected = buildInjectedContext(result.recall.items, result.behaviorRules);
      evermemory.debugRepo.log('interaction_processed', runId, {
        sessionId,
        source: 'before_agent_start_injection',
        scopeUserId: scopeState.scope.userId,
        scopeChatId: scopeState.scope.chatId,
        scopeProject: scopeState.scope.project,
        scopeChannel: scopeState.channel,
        scopeSessionKey: scopeState.sessionKey,
        scopeSessionStartRebound: scopeRebound,
        routeIntentType: result.intent.intent.type,
        recalled: result.recall.total,
        ...injected.stats,
      });
      return injected.prependContext ? { prependContext: injected.prependContext } : undefined;
    });

    registerHook('agent_end', (event: unknown, context: unknown) => {
      const sessionId = (
        (isRecord(context) ? asOptionalString(context.sessionId) : undefined)
        ?? (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
      );
      if (!sessionId) {
        return;
      }
      const scopeState = upsertScopeState(sessionScopes, sessionId, event, context);
      syncSessionStartScope(evermemory, sessionId, scopeState);

      const messages = isRecord(event) && Array.isArray(event.messages) ? event.messages : [];
      const exchange = extractLastExchange(messages);

      evermemory.sessionEnd({
        sessionId,
        messageId: isRecord(context) ? asOptionalString(context.runId) : undefined,
        scope: scopeState.scope,
        channel: scopeState.channel,
        inputText: exchange.userText,
        actionSummary: exchange.assistantText,
        outcomeSummary: isRecord(event) && event.success === true ? 'run_success' : 'run_failed',
      });
    });

    registerHook('session_end', (event: unknown, context: unknown) => {
      const sessionId = (
        (isRecord(event) ? asOptionalString(event.sessionId) : undefined)
        ?? (isRecord(context) ? asOptionalString(context.sessionId) : undefined)
      );
      if (!sessionId) {
        return;
      }
      sessionScopes.delete(sessionId);
    });

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_store',
        label: 'EverMemory Store',
        description: 'Store durable memory content in EverMemory.',
        parameters: Type.Object(
          {
            content: Type.String({ description: 'Text to store as memory.' }),
            type: memoryTypeSchema,
            lifecycle: memoryLifecycleSchema,
            scope: scopeSchema,
            source: sourceSchema,
            tags: Type.Optional(Type.Array(Type.String())),
            relatedEntities: Type.Optional(Type.Array(Type.String())),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const content = asOptionalString(params.content);
          if (!content) {
            return {
              content: [{ type: 'text', text: 'Missing required field: content' }],
              details: { accepted: false, reason: 'missing_content' },
            };
          }

          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const result = evermemory.evermemoryStore({
            content,
            type: asOptionalEnum(params.type, MEMORY_TYPES),
            lifecycle: asOptionalEnum(params.lifecycle, MEMORY_LIFECYCLES),
            scope: mergeScope(baseScope, parseScope(params.scope)),
            source: parseMemorySource(params.source),
            tags: asOptionalStringArray(params.tags),
            relatedEntities: asOptionalStringArray(params.relatedEntities),
          });

          return {
            content: [{
              type: 'text',
              text: result.accepted
                ? `Stored memory: ${truncate(result.memory?.content ?? content, 100)}`
                : `Memory rejected: ${result.reason}`,
            }],
            details: result,
          };
        },
      }),
      { names: ['evermemory_store', 'memory_store'] },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_recall',
        label: 'EverMemory Recall',
        description: 'Recall relevant memory content from EverMemory.',
        parameters: Type.Object(
          {
            query: Type.String({ description: 'Recall query text.' }),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
            mode: retrievalModeSchema,
            scope: scopeSchema,
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const query = asOptionalString(params.query);
          if (!query) {
            return {
              content: [{ type: 'text', text: 'Missing required field: query' }],
              details: { count: 0, reason: 'missing_query' },
            };
          }

          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const recall = evermemory.evermemoryRecall({
            query,
            limit: asOptionalInteger(params.limit),
            mode: asOptionalEnum(params.mode, RETRIEVAL_MODES),
            scope: mergeScope(baseScope, parseScope(params.scope)),
          });

          if (recall.total === 0) {
            return {
              content: [{ type: 'text', text: 'No relevant memories found.' }],
              details: recall,
            };
          }

          const lines = recall.items
            .slice(0, 6)
            .map((item, index) => `${index + 1}. [${item.type}/${item.lifecycle}] ${truncate(item.content, 140)}`);

          return {
            content: [{
              type: 'text',
              text: `Found ${recall.total} memory item(s):\n${lines.join('\n')}`,
            }],
            details: recall,
          };
        },
      }),
      { names: ['evermemory_recall', 'memory_recall'] },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_status',
        label: 'EverMemory Status',
        description: 'Return current EverMemory system status summary.',
        parameters: Type.Object(
          {
            userId: Type.Optional(Type.String()),
            sessionId: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const runtimeSessionId = asOptionalString(toolContext.sessionId);
          const status = evermemory.evermemoryStatus({
            userId: asOptionalString(params.userId),
            sessionId: asOptionalString(params.sessionId) ?? runtimeSessionId,
          });
          return {
            content: [{
              type: 'text',
              text: `memoryCount=${status.memoryCount}, active=${status.activeMemoryCount ?? 0}, archived=${status.archivedMemoryCount ?? 0}`,
            }],
            details: status,
          };
        },
      }),
      { name: 'evermemory_status' },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_briefing',
        label: 'EverMemory Briefing',
        description: 'Build current memory briefing sections for the active scope.',
        parameters: Type.Object(
          {
            sessionId: Type.Optional(Type.String()),
            scope: scopeSchema,
            tokenTarget: Type.Optional(Type.Number({ minimum: 1 })),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const briefing = evermemory.evermemoryBriefing({
            sessionId: asOptionalString(params.sessionId) ?? asOptionalString(toolContext.sessionId),
            scope: mergeScope(baseScope, parseScope(params.scope)),
            tokenTarget: asOptionalInteger(params.tokenTarget),
          });
          return {
            content: [{
              type: 'text',
              text: `Briefing generated: sections(identity=${briefing.sections.identity.length}, constraints=${briefing.sections.constraints.length}, continuity=${briefing.sections.recentContinuity.length}, projects=${briefing.sections.activeProjects.length})`,
            }],
            details: briefing,
          };
        },
      }),
      { name: 'evermemory_briefing' },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_intent',
        label: 'EverMemory Intent',
        description: 'Analyze a message intent and persist deterministic intent record.',
        parameters: Type.Object(
          {
            message: Type.String(),
            sessionId: Type.Optional(Type.String()),
            messageId: Type.Optional(Type.String()),
            scope: scopeSchema,
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const message = asOptionalString(params.message);
          if (!message) {
            return {
              content: [{ type: 'text', text: 'Missing required field: message' }],
              details: { reason: 'missing_message' },
            };
          }
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const intent = evermemory.evermemoryIntent({
            message,
            sessionId: asOptionalString(params.sessionId) ?? asOptionalString(toolContext.sessionId),
            messageId: asOptionalString(params.messageId),
            scope: mergeScope(baseScope, parseScope(params.scope)),
          });
          return {
            content: [{
              type: 'text',
              text: `Intent analyzed: type=${intent.intent.type}, urgency=${intent.signals.urgency}, memoryNeed=${intent.signals.memoryNeed}`,
            }],
            details: intent,
          };
        },
      }),
      { name: 'evermemory_intent' },
    );

    api.registerTool(
      () => ({
        name: 'evermemory_reflect',
        label: 'EverMemory Reflect',
        description: 'Generate reflection records and candidate behavior rules.',
        parameters: Type.Object(
          {
            sessionId: Type.Optional(Type.String()),
            mode: reflectModeSchema,
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const result = evermemory.evermemoryReflect({
            sessionId: asOptionalString(params.sessionId),
            mode: asOptionalEnum(params.mode, REFLECT_MODES),
          });
          return {
            content: [{
              type: 'text',
              text: `Reflection completed: created=${result.summary.createdReflections}, candidates=${result.candidateRules.length}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_reflect' },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_rules',
        label: 'EverMemory Rules',
        description: 'Load active behavior rules or mutate a specific rule lifecycle state.',
        parameters: Type.Object(
          {
            scope: scopeSchema,
            intentType: intentTypeSchema,
            channel: Type.Optional(Type.String()),
            contexts: Type.Optional(Type.Array(Type.String())),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50 })),
            includeInactive: Type.Optional(Type.Boolean()),
            includeDeprecated: Type.Optional(Type.Boolean()),
            includeFrozen: Type.Optional(Type.Boolean()),
            action: rulesActionSchema,
            ruleId: Type.Optional(Type.String()),
            reason: Type.Optional(Type.String()),
            reflectionId: Type.Optional(Type.String()),
            replacementRuleId: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const action = asOptionalEnum(params.action, RULE_MUTATION_ACTIONS);
          const ruleId = asOptionalString(params.ruleId);
          if (action && !ruleId) {
            return {
              content: [{ type: 'text', text: 'Missing required field: ruleId (when action is provided)' }],
              details: { reason: 'missing_rule_id_for_action', action },
            };
          }
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const result = evermemory.evermemoryRules({
            scope: mergeScope(baseScope, parseScope(params.scope)),
            intentType: asOptionalEnum(params.intentType, INTENT_TYPES),
            channel: asOptionalString(params.channel),
            contexts: asOptionalStringArray(params.contexts),
            limit: asOptionalInteger(params.limit),
            includeInactive: asOptionalBoolean(params.includeInactive),
            includeDeprecated: asOptionalBoolean(params.includeDeprecated),
            includeFrozen: asOptionalBoolean(params.includeFrozen),
            action,
            ruleId,
            reason: asOptionalString(params.reason),
            reflectionId: asOptionalString(params.reflectionId),
            replacementRuleId: asOptionalString(params.replacementRuleId),
          });
          return {
            content: [{
              type: 'text',
              text: result.mutation
                ? `Rule mutation: action=${result.mutation.action}, changed=${result.mutation.changed}, reason=${result.mutation.reason}`
                : `Loaded ${result.total} active rule(s).`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_rules' },
    );

    api.registerTool(
      () => ({
        name: 'evermemory_profile',
        label: 'EverMemory Profile',
        description: 'Read or recompute projected user profile.',
        parameters: Type.Object(
          {
            userId: Type.Optional(Type.String()),
            recompute: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const result = evermemory.evermemoryProfile({
            userId: asOptionalString(params.userId),
            recompute: asOptionalBoolean(params.recompute),
          });
          return {
            content: [{
              type: 'text',
              text: `Profile source=${result.source}, exists=${result.profile ? 'yes' : 'no'}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_profile' },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_consolidate',
        label: 'EverMemory Consolidate',
        description: 'Run manual lifecycle maintenance and consolidation pass.',
        parameters: Type.Object(
          {
            mode: consolidationModeSchema,
            scope: scopeSchema,
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const result = evermemory.evermemoryConsolidate({
            mode: asOptionalEnum(params.mode, CONSOLIDATION_MODES),
            scope: mergeScope(baseScope, parseScope(params.scope)),
          });
          return {
            content: [{
              type: 'text',
              text: `Consolidation done: mode=${result.mode}, processed=${result.processed}, merged=${result.merged}, archivedStale=${result.archivedStale}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_consolidate' },
    );

    api.registerTool(
      () => ({
        name: 'evermemory_explain',
        label: 'EverMemory Explain',
        description: 'Explain write/retrieval/rule decisions from debug evidence.',
        parameters: Type.Object(
          {
            topic: explainTopicSchema,
            entityId: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const result = evermemory.evermemoryExplain({
            topic: asOptionalEnum(params.topic, EXPLAIN_TOPICS),
            entityId: asOptionalString(params.entityId),
            limit: asOptionalInteger(params.limit),
          });
          return {
            content: [{
              type: 'text',
              text: `Explain topic=${result.topic}, items=${result.total}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_explain' },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_export',
        label: 'EverMemory Export',
        description: 'Export memory snapshot for review or migration.',
        parameters: Type.Object(
          {
            scope: scopeSchema,
            includeArchived: Type.Optional(Type.Boolean()),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const result = evermemory.evermemoryExport({
            scope: mergeScope(baseScope, parseScope(params.scope)),
            includeArchived: asOptionalBoolean(params.includeArchived),
            limit: asOptionalInteger(params.limit),
          });
          return {
            content: [{
              type: 'text',
              text: `Snapshot exported: total=${result.summary.exported}, includeArchived=${result.summary.includeArchived}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_export' },
    );

    api.registerTool(
      () => ({
        name: 'evermemory_import',
        label: 'EverMemory Import',
        description: 'Review/apply memory snapshot import with safety checks.',
        parameters: Type.Object(
          {
            snapshot: Type.Any(),
            mode: importModeSchema,
            approved: Type.Optional(Type.Boolean()),
            allowOverwrite: Type.Optional(Type.Boolean()),
            scopeOverride: scopeSchema,
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          if (!isRecord(params.snapshot)) {
            return {
              content: [{ type: 'text', text: 'Missing required field: snapshot' }],
              details: { reason: 'missing_snapshot' },
            };
          }
          const result = evermemory.evermemoryImport({
            snapshot: params.snapshot as any,
            mode: asOptionalEnum(params.mode, IMPORT_MODES),
            approved: asOptionalBoolean(params.approved),
            allowOverwrite: asOptionalBoolean(params.allowOverwrite),
            scopeOverride: parseScope(params.scopeOverride),
          });
          return {
            content: [{
              type: 'text',
              text: `Import ${result.mode}: applied=${result.applied}, total=${result.total}, imported=${result.imported}, updated=${result.updated}, rejected=${result.rejected.length}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_import' },
    );

    api.registerTool(
      (toolContext: UnknownRecord) => ({
        name: 'evermemory_review',
        label: 'EverMemory Review',
        description: 'Review archived memory candidates and optional rule provenance.',
        parameters: Type.Object(
          {
            scope: scopeSchema,
            query: Type.Optional(Type.String()),
            limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
            includeSuperseded: Type.Optional(Type.Boolean()),
            ruleId: Type.Optional(Type.String()),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const result = evermemory.evermemoryReview({
            scope: mergeScope(baseScope, parseScope(params.scope)),
            query: asOptionalString(params.query),
            limit: asOptionalInteger(params.limit),
            includeSuperseded: asOptionalBoolean(params.includeSuperseded),
            ruleId: asOptionalString(params.ruleId),
          });
          return {
            content: [{
              type: 'text',
              text: `Review completed: candidates=${result.total}${result.ruleReview ? ', ruleReview=present' : ''}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_review' },
    );

    api.registerTool(
      () => ({
        name: 'evermemory_restore',
        label: 'EverMemory Restore',
        description: 'Review/apply restore plan for archived memories.',
        parameters: Type.Object(
          {
            ids: Type.Array(Type.String()),
            mode: restoreModeSchema,
            approved: Type.Optional(Type.Boolean()),
            targetLifecycle: restoreLifecycleSchema,
            allowSuperseded: Type.Optional(Type.Boolean()),
          },
          { additionalProperties: false },
        ),
        async execute(_toolCallId: string, params: UnknownRecord) {
          const ids = asOptionalStringArray(params.ids);
          if (!ids || ids.length === 0) {
            return {
              content: [{ type: 'text', text: 'Missing required field: ids' }],
              details: { reason: 'missing_ids' },
            };
          }
          const result = evermemory.evermemoryRestore({
            ids,
            mode: asOptionalEnum(params.mode, RESTORE_MODES),
            approved: asOptionalBoolean(params.approved),
            targetLifecycle: asOptionalEnum(params.targetLifecycle, RESTORE_TARGET_LIFECYCLES),
            allowSuperseded: asOptionalBoolean(params.allowSuperseded),
          });
          return {
            content: [{
              type: 'text',
              text: `Restore ${result.mode}: applied=${result.applied}, restorable=${result.restorable}, restored=${result.restored}, rejected=${result.rejected.length}`,
            }],
            details: result,
          };
        },
      }),
      { name: 'evermemory_restore' },
    );

    api.registerService({
      id: PLUGIN_NAME,
      start: () => {
        const status = evermemory.evermemoryStatus();
        api.logger.info(
          `${PLUGIN_NAME}@${PLUGIN_VERSION}: initialized (db=${status.databasePath}, memory=${status.memoryCount})`,
        );
      },
      stop: () => {
        try {
          evermemory.database.connection.close();
          api.logger.info(`${PLUGIN_NAME}: stopped`);
        } catch (error) {
          api.logger.warn(`${PLUGIN_NAME}: failed to close database on stop: ${toErrorMessage(error)}`);
        }
      },
    });
  },
};

export default memoryPlugin;

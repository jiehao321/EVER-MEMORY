import { Type } from '@sinclair/typebox';
import {
  MEMORY_LIFECYCLES,
  MEMORY_TYPES,
  PLUGIN_NAME,
  PLUGIN_VERSION,
  RETRIEVAL_MODES,
} from '../constants.js';
import { getDefaultConfig, initializeEverMemory } from '../index.js';

type UnknownRecord = Record<string, unknown>;

interface SessionScopeState {
  scope: {
    userId?: string;
    chatId?: string;
    project?: string;
  };
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

function asOptionalEnum<T extends readonly string[]>(value: unknown, values: T): T[number] | undefined {
  const normalized = asOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return (values as readonly string[]).includes(normalized) ? (normalized as T[number]) : undefined;
}

function parseScope(value: unknown): { userId?: string; chatId?: string; project?: string } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const userId = asOptionalString(value.userId);
  const chatId = asOptionalString(value.chatId);
  const project = asOptionalString(value.project);
  if (!userId && !chatId && !project) {
    return undefined;
  }
  return { userId, chatId, project };
}

function mergeScope(
  base: { userId?: string; chatId?: string; project?: string },
  override?: { userId?: string; chatId?: string; project?: string },
): { userId?: string; chatId?: string; project?: string } {
  if (!override) {
    return base;
  }
  return {
    userId: override.userId ?? base.userId,
    chatId: override.chatId ?? base.chatId,
    project: override.project ?? base.project,
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

function createScopeState(sessionId: string, sessionKey?: string): SessionScopeState {
  return {
    sessionKey,
    scope: {
      chatId: sessionKey ?? sessionId,
      project: PLUGIN_NAME,
    },
  };
}

function resolveToolScope(
  sessionScopes: Map<string, SessionScopeState>,
  toolContext: UnknownRecord,
): { userId?: string; chatId?: string; project?: string } {
  const sessionId = asOptionalString(toolContext.sessionId);
  const requesterSenderId = asOptionalString(toolContext.requesterSenderId);
  const sessionScope = sessionId ? sessionScopes.get(sessionId)?.scope : undefined;
  return {
    userId: requesterSenderId ?? sessionScope?.userId,
    chatId: sessionScope?.chatId ?? asOptionalString(toolContext.sessionKey),
    project: sessionScope?.project ?? PLUGIN_NAME,
  };
}

const memoryTypeSchema = Type.Optional(Type.Union(MEMORY_TYPES.map((value) => Type.Literal(value))));
const memoryLifecycleSchema = Type.Optional(
  Type.Union(MEMORY_LIFECYCLES.map((value) => Type.Literal(value))),
);
const retrievalModeSchema = Type.Optional(Type.Union(RETRIEVAL_MODES.map((value) => Type.Literal(value))));

const scopeSchema = Type.Optional(
  Type.Object(
    {
      userId: Type.Optional(Type.String()),
      chatId: Type.Optional(Type.String()),
      project: Type.Optional(Type.String()),
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

    registerHook('session_start', (event: unknown) => {
      if (!isRecord(event)) {
        return;
      }
      const sessionId = asOptionalString(event.sessionId);
      const sessionKey = asOptionalString(event.sessionKey);
      if (!sessionId) {
        return;
      }

      sessionScopes.set(sessionId, createScopeState(sessionId, sessionKey));
      const scopeState = sessionScopes.get(sessionId)!;

      evermemory.sessionStart({
        sessionId,
        chatId: scopeState.scope.chatId,
      });
    });

    registerHook('before_agent_start', (event: unknown, context: unknown) => {
      if (!isRecord(event) || !isRecord(context)) {
        return undefined;
      }
      const prompt = asOptionalString(event.prompt);
      const sessionId = asOptionalString(context.sessionId);
      if (!prompt || !sessionId) {
        return undefined;
      }

      if (!sessionScopes.has(sessionId)) {
        sessionScopes.set(sessionId, createScopeState(sessionId, asOptionalString(context.sessionKey)));
      }
      const scopeState = sessionScopes.get(sessionId)!;

      const result = evermemory.messageReceived({
        sessionId,
        messageId: asOptionalString(context.runId),
        text: prompt,
        scope: scopeState.scope,
        channel: asOptionalString(context.channelId),
      });

      const injected = buildInjectedContext(result.recall.items, result.behaviorRules);
      evermemory.debugRepo.log('interaction_processed', asOptionalString(context.runId), {
        sessionId,
        source: 'before_agent_start_injection',
        routeIntentType: result.intent.intent.type,
        recalled: result.recall.total,
        ...injected.stats,
      });
      return injected.prependContext ? { prependContext: injected.prependContext } : undefined;
    });

    registerHook('agent_end', (event: unknown, context: unknown) => {
      if (!isRecord(context)) {
        return;
      }
      const sessionId = asOptionalString(context.sessionId);
      if (!sessionId) {
        return;
      }
      const scopeState = sessionScopes.get(sessionId) ?? createScopeState(
        sessionId,
        asOptionalString(context.sessionKey),
      );

      const messages = isRecord(event) && Array.isArray(event.messages) ? event.messages : [];
      const exchange = extractLastExchange(messages);

      evermemory.sessionEnd({
        sessionId,
        messageId: asOptionalString(context.runId),
        scope: scopeState.scope,
        inputText: exchange.userText,
        actionSummary: exchange.assistantText,
        outcomeSummary: isRecord(event) && event.success === true ? 'run_success' : 'run_failed',
      });
    });

    registerHook('session_end', (event: unknown) => {
      if (!isRecord(event)) {
        return;
      }
      const sessionId = asOptionalString(event.sessionId);
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

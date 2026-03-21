import { PLUGIN_NAME } from '../constants.js';
import { EverMemoryError } from '../errors.js';
import { getDefaultConfig, initializeEverMemory } from '../index.js';
import {
  asOptionalString,
  isRecord,
  toErrorMessage,
  type UnknownRecord,
} from './shared/format.js';

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
  project?: string;
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

export * from './shared/format.js';
export * from './shared/convert.js';

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

function basename(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '');
  if (!normalized) {
    return undefined;
  }
  const parts = normalized.split('/');
  const last = parts[parts.length - 1]?.trim();
  return last || undefined;
}

function buildRuntimeConfig(api: { pluginConfig?: UnknownRecord; resolvePath: (input: string) => string }) {
  const config = isRecord(api.pluginConfig) ? { ...api.pluginConfig } : {};
  const defaultPath = getDefaultConfig().databasePath;
  const configuredPath = asOptionalString(config.databasePath) ?? defaultPath;
  config.databasePath = api.resolvePath(configuredPath);
  return config;
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
      ['openChatId'],
      ['open_chat_id'],
      ['conversationId'],
      ['conversation_id'],
      ['threadId'],
      ['thread_id'],
      ['roomId'],
      ['room_id'],
      ['chat', 'id'],
      ['chat', 'chatId'],
      ['chat', 'chat_id'],
      ['chat', 'openChatId'],
      ['chat', 'open_chat_id'],
      ['conversation', 'id'],
      ['conversation', 'chatId'],
      ['conversation', 'chat_id'],
      ['conversation', 'openChatId'],
      ['conversation', 'open_chat_id'],
      ['message', 'chatId'],
      ['message', 'chat_id'],
      ['message', 'openChatId'],
      ['message', 'open_chat_id'],
      ['message', 'conversationId'],
      ['message', 'conversation_id'],
      ['message', 'chat', 'id'],
      ['message', 'chat', 'chatId'],
      ['message', 'chat', 'chat_id'],
      ['message', 'chat', 'openChatId'],
      ['message', 'chat', 'open_chat_id'],
    ]))
    .find((value) => Boolean(value));
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
  const project = sources
    .map((source) => pickFirstString(source, [
      ['project'],
      ['projectId'],
      ['project_id'],
      ['projectName'],
      ['project_name'],
      ['workspace'],
      ['workspaceId'],
      ['workspace_id'],
      ['workspaceName'],
      ['workspace_name'],
      ['repo'],
      ['repoName'],
      ['repo_name'],
      ['repository'],
      ['repository', 'name'],
      ['repository', 'fullName'],
      ['meta', 'project'],
      ['meta', 'projectId'],
      ['meta', 'projectName'],
      ['context', 'project'],
      ['context', 'projectId'],
      ['context', 'projectName'],
    ]))
    .find((value) => Boolean(value))
    ?? sources
      .map((source) => pickFirstString(source, [
        ['cwd'],
        ['workspacePath'],
        ['workspace_path'],
        ['repoPath'],
        ['repo_path'],
      ]))
      .map((value) => basename(value))
      .find((value) => Boolean(value));
  return {
    userId,
    chatId,
    channel,
    sessionKey,
    project,
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
      project: binding.project,
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
      project: binding.project ?? current.scope.project,
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
    project: toolBinding.project ?? scopeState?.scope.project,
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import Database from 'better-sqlite3';
import memoryPlugin from '../src/openclaw/plugin.js';
import { createTempDbPath } from './helpers.js';

type HookHandler = (event: unknown, context: unknown) => unknown | Promise<unknown>;

function createMockApi(databasePath: string) {
  const hooks = new Map<string, HookHandler[]>();
  const toolRegistrations: Array<{ tool: unknown; opts?: { name?: string; names?: string[] } }> = [];
  const services: Array<{ id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }> =
    [];
  const infoLogs: string[] = [];

  const logger = {
    info(...args: unknown[]) {
      infoLogs.push(args.map((arg) => String(arg)).join(' '));
    },
    warn() {},
    error() {},
    debug() {},
  };

  const api = {
    pluginConfig: { databasePath, debugEnabled: true },
    resolvePath(input: string) {
      return input;
    },
    logger,
    on(name: string, handler: HookHandler) {
      const handlers = hooks.get(name) ?? [];
      handlers.push(handler);
      hooks.set(name, handlers);
    },
    registerTool(tool: unknown, opts?: { name?: string; names?: string[] }) {
      toolRegistrations.push({ tool, opts });
    },
    registerService(service: { id: string; start: () => void | Promise<void>; stop?: () => void | Promise<void> }) {
      services.push(service);
    },
    registerHook() {},
    registerHttpRoute() {},
    registerChannel() {},
    registerGatewayMethod() {},
    registerCli() {},
    registerProvider() {},
    registerCommand() {},
    registerContextEngine() {},
  };

  return { api, hooks, infoLogs, toolRegistrations, services };
}

async function runHook(
  hooks: Map<string, HookHandler[]>,
  name: string,
  event: unknown,
  context: unknown,
): Promise<unknown> {
  let lastResult: unknown = undefined;
  for (const handler of hooks.get(name) ?? []) {
    const result = await handler(event, context);
    if (result !== undefined) {
      lastResult = result;
    }
  }
  return lastResult;
}

function resolveTools(
  toolRegistrations: Array<{ tool: unknown; opts?: { name?: string; names?: string[] } }>,
  context: Record<string, unknown>,
) {
  const tools = new Map<string, any>();

  for (const registration of toolRegistrations) {
    const produced = typeof registration.tool === 'function'
      ? (registration.tool as (ctx: Record<string, unknown>) => unknown)(context)
      : registration.tool;
    const list = Array.isArray(produced) ? produced : [produced];

    for (const tool of list) {
      if (!tool || typeof tool !== 'object') {
        continue;
      }

      const names = new Set<string>();
      const toolName = typeof (tool as { name?: unknown }).name === 'string'
        ? (tool as { name: string }).name
        : undefined;
      if (toolName) {
        names.add(toolName);
      }
      if (registration.opts?.name) {
        names.add(registration.opts.name);
      }
      for (const alias of registration.opts?.names ?? []) {
        names.add(alias);
      }

      for (const name of names) {
        tools.set(name, tool);
      }
    }
  }

  return tools;
}

test('OpenClaw adapter registers services/tools/hooks and injects recall context', async () => {
  const databasePath = createTempDbPath('openclaw-plugin');
  const { api, hooks, toolRegistrations, services } = createMockApi(databasePath);

  await memoryPlugin.register(api);
  assert.equal(services.length, 1);
  await services[0].start();

  await runHook(
    hooks,
    'session_start',
    { sessionId: 'session-openclaw-1', sessionKey: 'chat-openclaw-1' },
    { sessionId: 'session-openclaw-1', sessionKey: 'chat-openclaw-1' },
  );

  const runtimeContext = {
    sessionId: 'session-openclaw-1',
    sessionKey: 'chat-openclaw-1',
    requesterSenderId: 'user-openclaw-1',
    messageChannel: 'test',
  };

  const tools = resolveTools(toolRegistrations, runtimeContext);
  const storeTool = tools.get('memory_store');
  const recallTool = tools.get('memory_recall');
  const statusTool = tools.get('evermemory_status');
  const briefingTool = tools.get('evermemory_briefing');
  const intentTool = tools.get('evermemory_intent');
  const reflectTool = tools.get('evermemory_reflect');
  const rulesTool = tools.get('evermemory_rules');
  const profileTool = tools.get('evermemory_profile');
  const onboardTool = tools.get('profile_onboard');
  const consolidateTool = tools.get('evermemory_consolidate');
  const explainTool = tools.get('evermemory_explain');
  const exportTool = tools.get('evermemory_export');
  const importTool = tools.get('evermemory_import');
  const memoryExportTool = tools.get('memory_export');
  const memoryImportTool = tools.get('memory_import');
  const reviewTool = tools.get('evermemory_review');
  const restoreTool = tools.get('evermemory_restore');

  assert.ok(storeTool);
  assert.ok(recallTool);
  assert.ok(statusTool);
  assert.ok(briefingTool);
  assert.ok(intentTool);
  assert.ok(reflectTool);
  assert.ok(rulesTool);
  assert.ok(profileTool);
  assert.ok(onboardTool);
  assert.ok(consolidateTool);
  assert.ok(explainTool);
  assert.ok(exportTool);
  assert.ok(importTool);
  assert.ok(memoryExportTool);
  assert.ok(memoryImportTool);
  assert.ok(reviewTool);
  assert.ok(restoreTool);

  const storeResult = await storeTool.execute('tc-1', {
    content: '项目计划：先做质量审查，再推进开发实现。',
    type: 'project',
    tags: ['plan', 'quality'],
  });
  assert.equal(storeResult.details.accepted, true);

  const recallResult = await recallTool.execute('tc-2', {
    query: '项目计划',
    limit: 3,
  });
  assert.ok(recallResult.details.total >= 1);

  const hookResult = await runHook(
    hooks,
    'before_agent_start',
    {
      prompt: '结合之前项目计划，给我今天的推进建议。',
      messages: [],
    },
    {
      sessionId: 'session-openclaw-1',
      sessionKey: 'chat-openclaw-1',
      channelId: 'test',
      runId: 'run-openclaw-1',
    },
  );

  assert.ok(hookResult && typeof hookResult === 'object');
  const prependContext = (hookResult as { prependContext?: unknown }).prependContext;
  assert.equal(typeof prependContext, 'string');
  assert.match(String(prependContext), /evermemory-context/i);

  const statusResult = await statusTool.execute('tc-3', {});
  assert.ok(statusResult.details.memoryCount >= 1);

  const briefingResult = await briefingTool.execute('tc-briefing', {});
  assert.ok(briefingResult.details.sections);

  const intentResult = await intentTool.execute('tc-intent', {
    message: '请先确认范围，再执行变更。',
  });
  assert.equal(typeof intentResult.details.intent.type, 'string');

  const reflectResult = await reflectTool.execute('tc-reflect', {
    mode: 'light',
  });
  assert.ok(reflectResult.details.summary.processedExperiences >= 0);

  const rulesResult = await rulesTool.execute('tc-rules', {
    limit: 5,
  });
  assert.ok(Array.isArray(rulesResult.details.rules));

  const markdownExport = await memoryExportTool.execute('tc-export-md', {
    format: 'markdown',
  });
  assert.match(String(markdownExport.content[0]?.text ?? ''), /^## \[/m);

  const markdownImport = await memoryImportTool.execute('tc-import-md', {
    format: 'markdown',
    content: '## [fact] 记住这个导入块\n- 标签: imported\n- 创建时间: 2026-03-15\n- 重要性: 0.7',
  });
  assert.equal(markdownImport.details.imported, 1);

  const profileResult = await profileTool.execute('tc-profile', {
    userId: 'user-openclaw-1',
    recompute: true,
  });
  assert.ok(['recomputed', 'stored', 'none', 'latest'].includes(profileResult.details.source));

  const onboardResult = await onboardTool.execute('tc-onboard', {
    userId: 'user-openclaw-1',
  });
  assert.equal(typeof onboardResult.details.needsOnboarding, 'boolean');
  assert.ok(Array.isArray(onboardResult.details.questions));

  const consolidateResult = await consolidateTool.execute('tc-consolidate', {
    mode: 'light',
  });
  assert.equal(typeof consolidateResult.details.processed, 'number');

  const explainResult = await explainTool.execute('tc-explain', {
    topic: 'write',
    limit: 3,
  });
  assert.ok(Array.isArray(explainResult.details.items));

  const exportResult = await exportTool.execute('tc-export', {
    limit: 10,
  });
  assert.equal(exportResult.details.snapshot.format, 'evermemory.snapshot.v1');

  const importReviewResult = await importTool.execute('tc-import', {
    snapshot: exportResult.details.snapshot,
    mode: 'review',
  });
  assert.equal(importReviewResult.details.mode, 'review');
  assert.equal(importReviewResult.details.applied, false);

  const reviewResult = await reviewTool.execute('tc-review', {
    limit: 5,
  });
  assert.equal(typeof reviewResult.details.total, 'number');

  const restoreResult = await restoreTool.execute('tc-restore', {
    ids: ['missing-memory-id'],
    mode: 'review',
  });
  assert.equal(restoreResult.details.mode, 'review');

  await runHook(
    hooks,
    'agent_end',
    {
      success: true,
      messages: [
        { role: 'user', content: '请继续推进' },
        { role: 'assistant', content: '我会先执行质量检查' },
      ],
    },
    {
      sessionId: 'session-openclaw-1',
      sessionKey: 'chat-openclaw-1',
      runId: 'run-openclaw-1',
    },
  );

  await runHook(
    hooks,
    'session_end',
    { sessionId: 'session-openclaw-1', messageCount: 2 },
    { sessionId: 'session-openclaw-1', sessionKey: 'chat-openclaw-1' },
  );

  await services[0].stop?.();
  rmSync(databasePath, { force: true });
});

test('OpenClaw adapter rebinds host user/chat/channel scope for main-session persistence', async () => {
  const databasePath = createTempDbPath('openclaw-plugin-scope-binding');
  const { api, hooks, services } = createMockApi(databasePath);

  await memoryPlugin.register(api);
  assert.equal(services.length, 1);
  await services[0].start();

  await runHook(
    hooks,
    'session_start',
    { sessionId: 'session-feishu-main-1', sessionKey: 'agent:main:session:internal-1' },
    { sessionId: 'session-feishu-main-1', sessionKey: 'agent:main:session:internal-1' },
  );

  await runHook(
    hooks,
    'before_agent_start',
    {
      prompt: '项目 Apollo 当前阶段是 Batch 1，下一步修复 Feishu scope 绑定。',
      messages: [],
    },
    {
      sessionId: 'session-feishu-main-1',
      sessionKey: 'agent:main:session:internal-1',
      runId: 'run-feishu-main-1',
      requester: { senderId: 'ou_real_host_user_1' },
      conversationId: 'oc_real_host_chat_1',
      messageChannel: 'feishu',
    },
  );

  await runHook(
    hooks,
    'agent_end',
    {
      success: true,
      messages: [
        { role: 'user', content: '项目 Apollo 需要优先修复主会话 scope 透传。' },
        { role: 'assistant', content: '已确认，先绑定真实 user/chat/channel 再回归验证。' },
      ],
    },
    {
      sessionId: 'session-feishu-main-1',
      runId: 'run-feishu-main-1',
      requesterSenderId: 'ou_real_host_user_1',
      conversation: { id: 'oc_real_host_chat_1' },
      channel: 'feishu',
    },
  );

  const secondHook = await runHook(
    hooks,
    'before_agent_start',
    {
      prompt: '继续汇总 Apollo 项目的当前进展和下一步。',
      messages: [],
    },
    {
      sessionId: 'session-feishu-main-1',
      runId: 'run-feishu-main-2',
      requesterSenderId: 'ou_real_host_user_1',
      conversationId: 'oc_real_host_chat_1',
      messageChannel: 'feishu',
    },
  );

  assert.ok(secondHook && typeof secondHook === 'object');
  assert.match(String((secondHook as { prependContext?: unknown }).prependContext ?? ''), /evermemory-context/i);

  const db = new Database(databasePath, { readonly: true });
  try {
    const memoryRows = db.prepare(`
      SELECT scope_user_id, scope_chat_id, channel
      FROM memory_items
      WHERE session_id = ?
      ORDER BY created_at DESC
    `).all('session-feishu-main-1') as Array<{
      scope_user_id: string | null;
      scope_chat_id: string | null;
      channel: string | null;
    }>;

    assert.ok(memoryRows.length >= 1);
    assert.ok(memoryRows.some((row) => row.scope_user_id === 'ou_real_host_user_1'));
    assert.ok(memoryRows.some((row) => row.scope_chat_id === 'oc_real_host_chat_1'));
    assert.ok(memoryRows.some((row) => row.channel === 'feishu'));

    const latestBriefing = db.prepare(`
      SELECT session_id, user_id
      FROM boot_briefings
      WHERE session_id = ?
      ORDER BY generated_at DESC
      LIMIT 1
    `).get('session-feishu-main-1') as { session_id: string; user_id: string | null } | undefined;
    assert.ok(latestBriefing);
    assert.equal(latestBriefing?.user_id, 'ou_real_host_user_1');

    const intentRow = db.prepare(`
      SELECT session_id, message_id
      FROM intent_records
      WHERE session_id = ? AND message_id = ?
      LIMIT 1
    `).get('session-feishu-main-1', 'run-feishu-main-1') as { session_id: string; message_id: string } | undefined;
    assert.equal(intentRow?.session_id, 'session-feishu-main-1');
    assert.equal(intentRow?.message_id, 'run-feishu-main-1');

    const experienceRow = db.prepare(`
      SELECT session_id, message_id
      FROM experience_logs
      WHERE session_id = ? AND message_id = ?
      LIMIT 1
    `).get('session-feishu-main-1', 'run-feishu-main-1') as { session_id: string; message_id: string } | undefined;
    assert.equal(experienceRow?.session_id, 'session-feishu-main-1');
    assert.equal(experienceRow?.message_id, 'run-feishu-main-1');

    const interactionRows = db.prepare(`
      SELECT payload_json
      FROM debug_events
      WHERE kind = 'interaction_processed'
      ORDER BY created_at DESC
      LIMIT 20
    `).all() as Array<{ payload_json: string }>;
    const scopedInteraction = interactionRows
      .map((row) => JSON.parse(row.payload_json) as Record<string, unknown>)
      .find((payload) => (
        payload.source === 'before_agent_start_injection'
        && payload.scopeUserId === 'ou_real_host_user_1'
        && payload.scopeChatId === 'oc_real_host_chat_1'
      ));
    assert.ok(scopedInteraction);
    assert.equal(scopedInteraction?.scopeChannel, 'feishu');
    assert.equal(scopedInteraction?.scopeSessionStartRebound, true);

    const sessionEndPayload = db.prepare(`
      SELECT payload_json
      FROM debug_events
      WHERE kind = 'session_end_processed' AND entity_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get('session-feishu-main-1') as { payload_json: string } | undefined;
    assert.ok(sessionEndPayload);
    const parsedSessionEnd = JSON.parse(String(sessionEndPayload?.payload_json)) as Record<string, unknown>;
    assert.equal(parsedSessionEnd.scopeUserId, 'ou_real_host_user_1');
    assert.equal(parsedSessionEnd.scopeChatId, 'oc_real_host_chat_1');
    assert.equal(parsedSessionEnd.channel, 'feishu');
    assert.equal(typeof parsedSessionEnd.experienceId, 'string');
  } finally {
    db.close();
  }

  await runHook(
    hooks,
    'session_end',
    { sessionId: 'session-feishu-main-1' },
    { sessionId: 'session-feishu-main-1' },
  );

  await services[0].stop?.();
  rmSync(databasePath, { force: true });
});

test('OpenClaw adapter logs onboarding guidance on first start when no profile exists', async () => {
  const databasePath = createTempDbPath('openclaw-plugin-onboarding-log');
  const warnLogs: string[] = [];
  const { api, infoLogs, services } = createMockApi(databasePath);
  api.logger.warn = (...args: unknown[]) => {
    warnLogs.push(args.map((arg) => String(arg)).join(' '));
  };

  await memoryPlugin.register(api);
  assert.equal(services.length, 1);

  await services[0].start();

  assert.ok(
    infoLogs.some((message) => message.includes('Run profile_onboard to initialize the first user profile.')),
  );
  assert.ok(
    infoLogs.some((message) => message.includes("[EverMemory] First run detected. Run 'profile_onboard' to get started.")),
  );
  assert.ok(
    infoLogs.some((message) => message.includes('[EverMemory] Ready. memories=0, embedding=noop')),
  );
  assert.ok(warnLogs.some((message) => message.includes('Embedding provider not ready: noop')));

  await services[0].stop?.();
  rmSync(databasePath, { force: true });
});

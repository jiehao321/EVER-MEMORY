import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeEverMemory } from '../src/index.js';
import type { BehaviorRule, ReflectionRecord } from '../src/types.js';
import { createTempDbPath } from './helpers.js';

function nowIso(): string {
  return new Date().toISOString();
}

function cleanup(databasePath: string, app: ReturnType<typeof initializeEverMemory>) {
  app.database.connection.close();
  rmSync(databasePath, { force: true });
}

function makeRule(input: {
  statement: string;
  category: BehaviorRule['category'];
  priority: number;
  userId?: string;
  channel?: string;
  intentTypes?: BehaviorRule['appliesTo']['intentTypes'];
  contexts?: string[];
  confidence?: number;
  recurrenceCount?: number;
}): BehaviorRule {
  const timestamp = nowIso();
  return {
    id: randomUUID(),
    statement: input.statement,
    createdAt: timestamp,
    updatedAt: timestamp,
    appliesTo: {
      userId: input.userId,
      channel: input.channel,
      intentTypes: input.intentTypes ?? [],
      contexts: input.contexts ?? [],
    },
    category: input.category,
    priority: input.priority,
    evidence: {
      reflectionIds: ['runtime-validation'],
      memoryIds: [],
      confidence: input.confidence ?? 0.9,
      recurrenceCount: input.recurrenceCount ?? 2,
    },
    lifecycle: {
      level: 'baseline',
      maturity: 'emerging',
      applyCount: 0,
      contradictionCount: 0,
      stale: false,
      staleness: 'fresh',
      decayScore: 0,
    },
    state: {
      active: true,
      deprecated: false,
      frozen: false,
    },
  };
}

test('runtime validation: preference memory is written and remains isolated within the same user scope', () => {
  const databasePath = createTempDbPath('runtime-validation-preference');
  const app = initializeEverMemory({ databasePath });

  const stored = app.evermemoryStore({
    content: '我偏好先给结论，再给细节。',
    scope: { userId: 'u-pref-1' },
    source: { kind: 'manual', actor: 'user' },
  });

  assert.equal(stored.accepted, true);
  assert.equal(stored.memory?.type, 'preference');

  const sameUser = app.memoryService.listRecent({ userId: 'u-pref-1' }, 10);
  const otherUser = app.memoryService.listRecent({ userId: 'u-pref-2' }, 10);

  assert.ok(sameUser.some((item) => item.content.includes('先给结论')));
  assert.ok(!otherUser.some((item) => item.content.includes('先给结论')));

  cleanup(databasePath, app);
});

test('runtime validation: project continuity uses prior project memories during message replay', () => {
  const databasePath = createTempDbPath('runtime-validation-project');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '项目约束：发布前先完成质量门禁。',
    scope: { userId: 'u-proj-1', project: 'evermemory' },
    type: 'constraint',
    source: { kind: 'manual', actor: 'user' },
  });
  app.evermemoryStore({
    content: '项目计划：Phase 2 完成后再推进 Phase 3。',
    scope: { userId: 'u-proj-1', project: 'evermemory' },
    type: 'project',
    source: { kind: 'manual', actor: 'user' },
  });

  const replay = app.messageReceived({
    sessionId: 'session-proj-1',
    messageId: 'msg-proj-1',
    text: '结合之前项目计划，继续推进下一阶段。',
    scope: { userId: 'u-proj-1', project: 'evermemory' },
  });

  assert.equal(replay.intent.intent.type, 'planning');
  assert.ok(replay.recall.total >= 1);
  assert.ok(replay.recall.items.some((item) => item.scope.project === 'evermemory'));
  assert.ok(replay.recall.items.some((item) => /Phase 2|质量门禁/.test(item.content)));

  cleanup(databasePath, app);
});

test('runtime validation: correction replay produces reflection and promotes confirmation rule', () => {
  const databasePath = createTempDbPath('runtime-validation-correction-reflection');
  const app = initializeEverMemory({ databasePath });

  const exp1 = app.experienceService.log({
    sessionId: 'session-correction-1',
    messageId: 'msg-correction-1',
    inputText: '更正一下，不是直接执行，要先确认。',
    actionSummary: '直接推进外部动作',
    outcomeSummary: '用户要求先确认',
    evidenceRefs: ['msg-correction-1'],
  });
  const exp2 = app.experienceService.log({
    sessionId: 'session-correction-1',
    messageId: 'msg-correction-2',
    inputText: '再更正一次，先复述修正点再继续。',
    actionSummary: '未先复述修正点',
    outcomeSummary: '用户再次纠正',
    evidenceRefs: ['msg-correction-2'],
  });

  const reflection = app.reflectionService.reflect({
    triggerKind: 'correction',
    sessionId: 'session-correction-1',
    experienceIds: [exp1.id, exp2.id],
    mode: 'light',
  });

  assert.ok(reflection.reflection);
  assert.ok(
    reflection.reflection?.candidateRules.some((rule) =>
      rule.includes('先复述修正点并确认'),
    ),
  );

  const promoted = app.behaviorService.promoteFromReflection({
    reflectionId: reflection.reflection!.id,
    appliesTo: {
      userId: 'u-correction-1',
      intentTypes: ['correction'],
    },
  });

  assert.ok(promoted.promotedRules.length >= 1);
  assert.ok(
    promoted.promotedRules.some((rule) => rule.statement.includes('先复述修正点并确认')),
  );

  const loaded = app.evermemoryRules({
    scope: { userId: 'u-correction-1' },
    intentType: 'correction',
    limit: 5,
  });
  assert.ok(loaded.rules.some((rule) => rule.statement.includes('先复述修正点并确认')));

  cleanup(databasePath, app);
});

test('runtime validation: false rule suppression rejects vague promotion candidates', () => {
  const databasePath = createTempDbPath('runtime-validation-false-rule');
  const app = initializeEverMemory({ databasePath });
  const timestamp = nowIso();

  const reflection: ReflectionRecord = {
    id: randomUUID(),
    createdAt: timestamp,
    trigger: {
      kind: 'manual-review',
      experienceIds: ['exp-false-1', 'exp-false-2'],
    },
    analysis: {
      category: 'general-review',
      summary: 'Over-generalized rule candidate should be suppressed.',
      nextTimeRecommendation: '所有场景都要直接执行，不要提问。',
    },
    evidence: {
      refs: ['msg-false-1'],
      confidence: 0.91,
      recurrenceCount: 2,
    },
    candidateRules: ['所有场景都要直接执行，不要提问。'],
    state: {
      promoted: false,
      rejected: false,
    },
  };

  app.reflectionRepo.insert(reflection);

  const result = app.behaviorService.promoteFromReflection({
    reflectionId: reflection.id,
    appliesTo: { userId: 'u-false-rule-1' },
  });

  assert.equal(result.promotedRules.length, 0);
  assert.ok(result.rejected.some((item) => item.reason === 'statement_too_vague'));
  assert.ok(app.debugRepo.listRecent('rule_rejected', 10).length >= 1);

  cleanup(databasePath, app);
});

test('runtime validation: scope isolation prevents cross-user and cross-project leakage', () => {
  const databasePath = createTempDbPath('runtime-validation-scope-isolation');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '用户A偏好：回答用中文。',
    scope: { userId: 'u-scope-a' },
    type: 'preference',
    source: { kind: 'manual', actor: 'user' },
  });
  app.evermemoryStore({
    content: '项目alpha约束：回滚窗口为10分钟。',
    scope: { userId: 'u-scope-a', project: 'alpha' },
    type: 'constraint',
    source: { kind: 'manual', actor: 'user' },
  });
  app.evermemoryStore({
    content: '项目beta约束：回滚窗口为30分钟。',
    scope: { userId: 'u-scope-a', project: 'beta' },
    type: 'constraint',
    source: { kind: 'manual', actor: 'user' },
  });
  app.evermemoryStore({
    content: '用户B偏好：回答用英文。',
    scope: { userId: 'u-scope-b' },
    type: 'preference',
    source: { kind: 'manual', actor: 'user' },
  });

  const userAMemories = app.memoryService.listRecent({ userId: 'u-scope-a' }, 10);
  assert.ok(userAMemories.some((item) => item.content.includes('中文')));
  assert.ok(!userAMemories.some((item) => item.content.includes('英文')));

  const alpha = app.evermemoryRecall({
    query: '回滚窗口',
    scope: { userId: 'u-scope-a', project: 'alpha' },
    limit: 10,
  });
  assert.equal(alpha.total, 1);
  assert.equal(alpha.items[0]?.scope.project, 'alpha');
  assert.ok(!alpha.items.some((item) => item.content.includes('30分钟')));

  cleanup(databasePath, app);
});

test('runtime validation: channel-neutral memories replay consistently while channel-scoped rules stay isolated', () => {
  const databasePath = createTempDbPath('runtime-validation-channel-neutrality');
  const app = initializeEverMemory({ databasePath });

  app.evermemoryStore({
    content: '稳定偏好：回答尽量简洁直接。',
    scope: { userId: 'u-channel-1' },
    type: 'preference',
    source: { kind: 'manual', actor: 'user', channel: 'feishu' },
  });

  const feishuRule = makeRule({
    statement: '在 Feishu 渠道回复时，先给简短结论再展开。',
    category: 'style',
    priority: 78,
    userId: 'u-channel-1',
    channel: 'feishu',
    recurrenceCount: 3,
  });
  app.behaviorRepo.insert(feishuRule);

  const feishuReplay = app.messageReceived({
    sessionId: 'session-channel-feishu',
    messageId: 'msg-channel-feishu',
    text: '请记住我的回答偏好，保持简洁直接。',
    scope: { userId: 'u-channel-1' },
    channel: 'feishu',
  });
  const discordReplay = app.messageReceived({
    sessionId: 'session-channel-discord',
    messageId: 'msg-channel-discord',
    text: '请记住我的回答偏好，保持简洁直接。',
    scope: { userId: 'u-channel-1' },
    channel: 'discord',
  });

  const allUserMemories = app.memoryService.listRecent({ userId: 'u-channel-1' }, 10);
  assert.ok(allUserMemories.some((item) => item.content.includes('简洁直接')));
  assert.ok((feishuReplay.behaviorRules ?? []).some((rule) => rule.id === feishuRule.id));
  assert.ok(!(discordReplay.behaviorRules ?? []).some((rule) => rule.id === feishuRule.id));

  cleanup(databasePath, app);
});

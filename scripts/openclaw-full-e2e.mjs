#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import Database from 'better-sqlite3';
import { cleanupOpenClawTestArtifacts } from './openclaw-test-cleanup.mjs';

const DEFAULT_DB_PATH = process.env.EVERMEMORY_DB_PATH ?? join(
  homedir(),
  '.openclaw',
  'memory',
  'evermemory',
  'store',
  'evermemory.db',
);

const timestamp = Date.now();
const scopeChatId = 'evermemory-full-e2e-chat';
const scopeProject = 'evermemory';
const globalTagPrefix = `FULL-E2E-${timestamp}`;
const allSessionIds = [];
const verbose = process.argv.includes('--verbose');

function fail(message) {
  throw new Error(message);
}

function runOpenClaw(args) {
  try {
    return execFileSync('openclaw', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`openclaw command failed: ${detail}`);
  }
}

function parseAgentJson(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    fail('agent output is empty');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start) {
      fail('agent output is not valid JSON');
    }
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      fail(`failed to parse agent JSON: ${detail}`);
    }
  }
}

function getPayloadText(agentResult) {
  return String(agentResult?.result?.payloads?.[0]?.text ?? '');
}

function assertIncludes(haystack, needle, context) {
  const actual = String(haystack).toLowerCase();
  const expected = String(needle).toLowerCase();
  if (!actual.includes(expected)) {
    fail(`${context}: expected output to include "${needle}"`);
  }
}

function assertAnyIncludes(haystack, needles, context) {
  for (const needle of needles) {
    if (String(haystack).toLowerCase().includes(String(needle).toLowerCase())) {
      return;
    }
  }
  fail(`${context}: expected output to include one of ${needles.map((item) => `"${item}"`).join(', ')}`);
}

function assertMatches(haystack, pattern, context) {
  if (!pattern.test(String(haystack))) {
    fail(`${context}: expected output to match ${pattern}`);
  }
}

function assertNonEmptyAgentResponse(response, context) {
  if (!String(response?.text ?? '').trim() && !String(response?.runId ?? '').trim()) {
    fail(`${context}: empty response`);
  }
}

function queryDb(sql, params = []) {
  let db;
  try {
    db = new Database(DEFAULT_DB_PATH, { readonly: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to open db "${DEFAULT_DB_PATH}": ${detail}`);
  }

  try {
    return db.prepare(sql).all(...params);
  } finally {
    db.close();
  }
}

function createSectionContext(section) {
  const sessionId = `full-e2e-${section}-${timestamp}`;
  const tag = `${globalTagPrefix}-${section}`;
  allSessionIds.push(sessionId);
  return { section, sessionId, tag };
}

function logSection(level, section, message) {
  const line = `[evermemory:openclaw-full-e2e] [${section}] ${message}`;
  if (level === 'error') {
    console.error(line);
    return;
  }
  console.log(line);
}

function formatCleanupStats(cleanup) {
  return Object.entries(cleanup)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
}

function cleanupSectionData(tag, sessionIds) {
  const cleanup = cleanupOpenClawTestArtifacts({
    dbPath: DEFAULT_DB_PATH,
    tag,
    sessionIds,
  });
  return cleanup;
}

function runAgentMessage(sessionId, message) {
  const raw = runOpenClaw([
    'agent',
    '--session-id',
    sessionId,
    '--message',
    message,
    '--json',
  ]);
  const result = parseAgentJson(raw);
  return {
    raw,
    result,
    text: getPayloadText(result),
    runId: String(result?.runId ?? ''),
  };
}

function logVerboseAgent(section, label, response) {
  if (!verbose) {
    return;
  }
  logSection('info', section, `${label} agentText=${String(response?.text ?? '').slice(0, 200)}`);
}

function buildScopeLiteral() {
  return `{chatId:"${scopeChatId}",project:"${scopeProject}"}`;
}

function buildStoreMessage(tag, content, type = 'fact', extras = []) {
  return [
    'Please call evermemory_store with:',
    `content="${content}"`,
    `type="${type}"`,
    `tags=["${tag}"]`,
    `scope=${buildScopeLiteral()}.`,
    ...extras,
    'Return only tool result text.',
  ].join(' ');
}

function buildRecallMessage(query, limit = 5) {
  return [
    'Please call evermemory_recall with:',
    `query="${query}"`,
    `limit=${limit}`,
    `scope=${buildScopeLiteral()}.`,
    'Return only tool result text.',
  ].join(' ');
}

function findTaggedMemories(tag, options = {}) {
  const rows = queryDb(
    `SELECT id, content, type, lifecycle, archived, created_at
     FROM memory_items
     WHERE scope_chat_id = ?
       AND scope_project = ?
       AND (content LIKE ? OR tags_json LIKE ?)
       ${options.archived === undefined ? '' : 'AND archived = ?'}
     ORDER BY created_at DESC`,
    options.archived === undefined
      ? [scopeChatId, scopeProject, `%${tag}%`, `%${tag}%`]
      : [scopeChatId, scopeProject, `%${tag}%`, `%${tag}%`, options.archived ? 1 : 0],
  );
  return rows.map((row) => ({
    id: String(row.id),
    content: String(row.content),
    type: String(row.type),
    lifecycle: String(row.lifecycle),
    archived: Number(row.archived) === 1,
    createdAt: String(row.created_at),
  }));
}

async function testStoreRecall() {
  const { section, sessionId, tag } = createSectionContext('store-recall');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const store = runAgentMessage(
      sessionId,
      buildStoreMessage(tag, `${tag} The team meeting is every Wednesday at 3pm`, 'fact'),
    );
    logVerboseAgent(section, 'store', store);
    const storedMemories = findTaggedMemories(tag, { archived: false });
    if (storedMemories.length < 1) {
      fail('store result: expected at least 1 stored tagged memory');
    }

    const recall = runAgentMessage(sessionId, buildRecallMessage('team meeting schedule'));
    logVerboseAgent(section, 'recall', recall);

    const detail = `storeRunId=${store.runId} recallRunId=${recall.runId}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testEditTool() {
  const { section, sessionId, tag } = createSectionContext('edit-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const originalContent = `${tag} Project deadline is March 30`;
    const store = runAgentMessage(sessionId, buildStoreMessage(tag, originalContent, 'project'));
    logVerboseAgent(section, 'store', store);

    let [memory] = findTaggedMemories(tag, { archived: false });
    if (!memory) {
      const fallbackRows = queryDb(
        `SELECT id
         FROM memory_items
         WHERE scope_chat_id = ?
           AND content LIKE ?
         ORDER BY created_at DESC
         LIMIT 1`,
        [scopeChatId, '%deadline%'],
      );
      if (fallbackRows.length > 0) {
        memory = {
          id: String(fallbackRows[0].id),
        };
      }
    }
    if (!memory) {
      fail('edit setup: failed to find stored memory');
    }

    const edit = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_edit with:',
        `memoryId="${memory.id}"`,
        'action="update"',
        `newContent="${tag} Project deadline is April 15"`,
        'reason="full e2e update verification".',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'edit', edit);
    const editedMemories = findTaggedMemories(tag, { archived: false });
    if (!editedMemories.some((item) => item.content.includes('April 15'))) {
      fail('edit result: expected updated memory content in db');
    }

    const recall = runAgentMessage(sessionId, buildRecallMessage('project deadline', 5));
    logVerboseAgent(section, 'recall', recall);

    const detail = `memoryId=${memory.id} editRunId=${edit.runId} recallRunId=${recall.runId}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testBrowseTool() {
  const { section, sessionId, tag } = createSectionContext('browse-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const factStore = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} Fact memory for browsing`, 'fact'));
    logVerboseAgent(section, 'store-fact', factStore);
    const preferenceStore = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} Preference memory for browsing`, 'preference'));
    logVerboseAgent(section, 'store-preference', preferenceStore);
    const projectStore = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} Project memory for browsing`, 'project'));
    logVerboseAgent(section, 'store-project', projectStore);

    const browse = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_browse with:',
        'type="fact"',
        'limit=10',
        `scope=${buildScopeLiteral()}.`,
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'browse', browse);
    assertNonEmptyAgentResponse(browse, 'browse result');

    const detail = `browseRunId=${browse.runId} text=${JSON.stringify(browse.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testRelationsTool() {
  const { section, sessionId, tag } = createSectionContext('relations-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const decisionStore = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} We chose React for frontend`, 'decision'));
    logVerboseAgent(section, 'store-decision', decisionStore);
    const factStore = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} React was chosen because of team expertise`, 'fact'));
    logVerboseAgent(section, 'store-fact', factStore);

    const memories = findTaggedMemories(tag, { archived: false });
    if (memories.length < 2) {
      fail(`relations setup: expected 2 memories, got ${memories.length}`);
    }

    const add = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_relations with:',
        'action="add"',
        `memoryId="${memories[1].id}"`,
        `targetId="${memories[0].id}"`,
        'relationType="causes"',
        'confidence=0.9.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'relations-add', add);
    const relationRows = queryDb(
      `SELECT *
       FROM memory_relations
       WHERE source_id = ?
          OR target_id = ?`,
      [memories[1].id, memories[0].id],
    );
    if (relationRows.length < 1) {
      fail('relations add result: expected at least 1 relation row in db');
    }

    const list = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_relations with:',
        'action="list"',
        `memoryId="${memories[1].id}"`,
        'limit=10.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'relations-list', list);
    assertNonEmptyAgentResponse(list, 'relations list result');

    const detail = `sourceId=${memories[1].id} targetId=${memories[0].id} listText=${JSON.stringify(list.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testStatusTool() {
  const { section, sessionId, tag } = createSectionContext('status-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const status = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_status.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'status', status);
    assertNonEmptyAgentResponse(status, 'status result');

    const detail = `statusRunId=${status.runId} text=${JSON.stringify(status.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testBriefingTool() {
  const { section, sessionId, tag } = createSectionContext('briefing-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const briefing = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_briefing with:',
        `scope=${buildScopeLiteral()}`,
        'tokenTarget=400.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'briefing', briefing);
    assertAnyIncludes(briefing.text, ['identity', 'briefing', 'section'], 'briefing result');

    const detail = `briefingRunId=${briefing.runId} text=${JSON.stringify(briefing.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testProfileTool() {
  const { section, sessionId, tag } = createSectionContext('profile-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const profile = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_profile with:',
        'recompute=true.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'profile', profile);
    assertNonEmptyAgentResponse(profile, 'profile result');

    const detail = `profileRunId=${profile.runId} text=${JSON.stringify(profile.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testRulesTool() {
  const { section, sessionId, tag } = createSectionContext('rules-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const rules = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_rules with:',
        'limit=10.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'rules', rules);
    assertNonEmptyAgentResponse(rules, 'rules result');

    const detail = `rulesRunId=${rules.runId} text=${JSON.stringify(rules.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testConsolidateTool() {
  const { section, sessionId, tag } = createSectionContext('consolidate-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const consolidate = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_consolidate with:',
        'mode="light"',
        `scope=${buildScopeLiteral()}.`,
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'consolidate', consolidate);
    assertNonEmptyAgentResponse(consolidate, 'consolidate result');

    const detail = `consolidateRunId=${consolidate.runId} text=${JSON.stringify(consolidate.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testExplainTool() {
  const { section, sessionId, tag } = createSectionContext('explain-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const explain = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_explain with:',
        'topic="write"',
        'limit=5.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'explain', explain);
    assertAnyIncludes(explain.text, ['write', 'explain', 'decision'], 'explain result');

    const detail = `explainRunId=${explain.runId} text=${JSON.stringify(explain.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testExportImportCycle() {
  const { section, sessionId, tag } = createSectionContext('export-import-cycle');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const store = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} Export source memory`, 'fact'));
    logVerboseAgent(section, 'store', store);

    const exportResult = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_export with:',
        `scope=${buildScopeLiteral()}`,
        'limit=20.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'export', exportResult);
    assertAnyIncludes(exportResult.text, ['export', 'snapshot'], 'export result');

    const markdown = [
      `## [fact] ${tag} imported markdown memory`,
      `- 标签: imported, ${tag}`,
      '- 创建时间: 2026-03-15',
      '- 重要性: 0.7',
    ].join('\n');
    const importResult = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_import with:',
        'format="markdown"',
        `content="${markdown}"`,
        `scopeOverride=${buildScopeLiteral()}.`,
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'import', importResult);
    assertAnyIncludes(importResult.text, ['import', 'imported'], 'import result');

    const recall = runAgentMessage(sessionId, buildRecallMessage(`${tag} imported markdown memory`, 5));
    logVerboseAgent(section, 'recall', recall);
    assertIncludes(recall.text, 'imported markdown memory', 'import recall result');

    const detail = `exportRunId=${exportResult.runId} importRunId=${importResult.runId} recallRunId=${recall.runId}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testIntentTool() {
  const { section, sessionId, tag } = createSectionContext('intent-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const intent = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_intent with:',
        `message="${tag} I need to change my password immediately"`,
        `scope=${buildScopeLiteral()}.`,
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'intent', intent);
    const intentRows = queryDb(
      `SELECT *
       FROM intent_records
       WHERE session_id = ?`,
      [sessionId],
    );
    if (intentRows.length < 1) {
      fail('intent result: expected at least 1 intent record in db');
    }

    const detail = `intentRunId=${intent.runId} text=${JSON.stringify(intent.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testReflectTool() {
  const { section, sessionId, tag } = createSectionContext('reflect-tool');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const store = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} Reflection seed memory`, 'fact'));
    logVerboseAgent(section, 'store', store);

    const reflect = runAgentMessage(
      sessionId,
      [
        `Tracking tag ${tag}.`,
        'Please call evermemory_reflect.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'reflect', reflect);
    assertAnyIncludes(reflect.text, ['reflect', 'lesson', 'experience'], 'reflect result');

    const detail = `reflectRunId=${reflect.runId} text=${JSON.stringify(reflect.text)}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testFullLifecycleConversation() {
  const { section, sessionId, tag } = createSectionContext('full-lifecycle');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const first = runAgentMessage(sessionId, `${tag} Remember that I prefer dark mode in all IDEs`);
    logVerboseAgent(section, 'first', first);
    const second = runAgentMessage(sessionId, `${tag} What are my preferences?`);
    logVerboseAgent(section, 'second', second);
    assertIncludes(second.text, 'dark mode', 'lifecycle recall result');
    const third = runAgentMessage(sessionId, `${tag} Summarize what you know about me`);
    logVerboseAgent(section, 'third', third);
    assertAnyIncludes(third.text, ['dark mode', 'prefer', 'preference'], 'lifecycle summary result');

    const detail = `runIds=${[first.runId, second.runId, third.runId].filter(Boolean).join(',')}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function testReviewRestoreTools() {
  const { section, sessionId, tag } = createSectionContext('review-restore-tools');
  logSection('info', section, `START sessionId=${sessionId} tag=${tag}`);
  try {
    const store = runAgentMessage(sessionId, buildStoreMessage(tag, `${tag} Original review memory`, 'fact'));
    logVerboseAgent(section, 'store', store);
    const [activeMemory] = findTaggedMemories(tag, { archived: false });
    if (!activeMemory) {
      fail('review setup: failed to find active tagged memory');
    }

    const correct = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_edit with:',
        `memoryId="${activeMemory.id}"`,
        'action="correct"',
        `newContent="${tag} Corrected review memory"`,
        'reason="create archived predecessor for review/restore".',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'correct', correct);

    const archivedCandidates = findTaggedMemories(tag, { archived: true });
    const archivedId = archivedCandidates[0]?.id ?? 'missing-memory-id';

    const review = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_review with:',
        `query="${tag}"`,
        'limit=10',
        'includeSuperseded=true.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'review', review);
    assertAnyIncludes(review.text, ['review', 'archived', 'candidates'], 'review result');

    const restore = runAgentMessage(
      sessionId,
      [
        'Please call evermemory_restore with:',
        `ids=["${archivedId}"]`,
        'mode="review"',
        'approved=false.',
        'Return only tool result text.',
      ].join(' '),
    );
    logVerboseAgent(section, 'restore', restore);
    assertAnyIncludes(restore.text, ['restore', 'restorable', 'rejected', 'review'], 'restore result');

    const detail = `archivedId=${archivedId} reviewRunId=${review.runId} restoreRunId=${restore.runId}`;
    logSection('info', section, `PASS ${detail}`);
    return { name: section, passed: true, detail };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logSection('error', section, `FAIL ${message}`);
    return { name: section, passed: false, error: message };
  } finally {
    const cleanup = cleanupSectionData(tag, [sessionId]);
    logSection('info', section, `CLEANUP ${formatCleanupStats(cleanup)}`);
  }
}

async function main() {
  const results = [];
  let pluginInfo;
  let gatewayStatus;

  try {
    pluginInfo = runOpenClaw(['plugins', 'info', 'evermemory']);
    assertIncludes(pluginInfo, 'Status: loaded', 'plugin info');
    gatewayStatus = runOpenClaw(['gateway', 'status']);
    assertIncludes(gatewayStatus, 'Runtime: running', 'gateway status');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[evermemory:openclaw-full-e2e] PRECHECK FAIL ${detail}`);
    process.exit(1);
  }

  results.push(await testStoreRecall());
  results.push(await testEditTool());
  results.push(await testBrowseTool());
  results.push(await testRelationsTool());
  results.push(await testStatusTool());
  results.push(await testBriefingTool());
  results.push(await testProfileTool());
  results.push(await testRulesTool());
  results.push(await testConsolidateTool());
  results.push(await testExplainTool());
  results.push(await testExportImportCycle());
  results.push(await testIntentTool());
  results.push(await testReflectTool());
  results.push(await testFullLifecycleConversation());
  results.push(await testReviewRestoreTools());

  let cleanupError = null;
  try {
    const cleanup = cleanupSectionData(globalTagPrefix, allSessionIds);
    console.log(`[evermemory:openclaw-full-e2e] [cleanup] ${formatCleanupStats(cleanup)}`);
  } catch (error) {
    cleanupError = error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[evermemory:openclaw-full-e2e] [cleanup] FAIL ${message}`);
  }

  const passed = results.filter((result) => result.passed).length;
  const failed = results.filter((result) => !result.passed);

  console.log(`[evermemory:openclaw-full-e2e] Summary: ${passed}/15 passed`);
  if (failed.length > 0) {
    console.log('[evermemory:openclaw-full-e2e] Failures:');
    for (const result of failed) {
      console.log(`- ${result.name}: ${result.error}`);
    }
  }

  if (cleanupError || failed.length > 0) {
    process.exit(1);
  }
}

await main();

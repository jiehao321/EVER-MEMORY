#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import Database from 'better-sqlite3';

const DEFAULT_DB_PATH = '/root/.openclaw/memory/evermemory/store/evermemory.db';

function fail(message) {
  console.error(`[evermemory:openclaw-smoke] ${message}`);
  process.exit(1);
}

function runOpenClaw(args) {
  try {
    return execFileSync('openclaw', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
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
  if (!haystack.includes(needle)) {
    fail(`${context}: expected output to include "${needle}"`);
  }
}

function queryDbEvidence(tag, scopeChatId, dbPath) {
  let db;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`failed to open db "${dbPath}": ${detail}`);
  }

  try {
    const memoryRow = db
      .prepare(
        `SELECT id, content, scope_chat_id, scope_project, tags_json
         FROM memory_items
         WHERE scope_chat_id = ?
           AND scope_project = 'evermemory'
           AND (content LIKE ? OR tags_json LIKE ?)
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(scopeChatId, `%${tag}%`, `%${tag}%`);

    if (!memoryRow) {
      fail(`db verification failed: no memory row found for tag ${tag}`);
    }

    const retrievalEvent = db
      .prepare(
        `SELECT id, kind, payload_json
         FROM debug_events
         WHERE kind = 'retrieval_executed'
           AND payload_json LIKE ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(`%${tag}%`);

    if (!retrievalEvent) {
      fail(`db verification failed: no retrieval_executed event found for tag ${tag}`);
    }

    return {
      memoryId: String(memoryRow.id),
      content: String(memoryRow.content),
      scopeChatId: String(memoryRow.scope_chat_id),
      retrievalEventId: String(retrievalEvent.id),
    };
  } finally {
    db.close();
  }
}

const dbPath = process.env.EVERMEMORY_DB_PATH ?? DEFAULT_DB_PATH;
const tag = `E2E-${Date.now()}-openclaw-smoke`;
const scopeChatId = 'evermemory-openclaw-smoke-chat';

const pluginInfo = runOpenClaw(['plugins', 'info', 'evermemory']);
assertIncludes(pluginInfo, 'Status: loaded', 'plugin info');
assertIncludes(pluginInfo, 'evermemory_store', 'plugin info');
assertIncludes(pluginInfo, 'evermemory_recall', 'plugin info');

const gatewayStatus = runOpenClaw(['gateway', 'status']);
assertIncludes(gatewayStatus, 'Runtime: running', 'gateway status');
assertIncludes(gatewayStatus, 'RPC probe: ok', 'gateway status');

const storeMessage = [
  'Please call evermemory_store with:',
  `content="${tag} smoke memory"`,
  'type="fact"',
  'lifecycle="episodic"',
  `tags=["${tag}"]`,
  `scope={chatId:"${scopeChatId}",project:"evermemory"}.`,
  'Return only tool result text.',
].join(' ');

const storeRaw = runOpenClaw([
  'agent',
  '--session-id',
  'evermemory-openclaw-smoke-store',
  '--message',
  storeMessage,
  '--json',
]);
const storeResult = parseAgentJson(storeRaw);
const storeText = getPayloadText(storeResult);
assertIncludes(storeText, 'Stored memory:', 'store result');
assertIncludes(storeText, tag, 'store result');

const recallMessage = [
  'Please call evermemory_recall with:',
  `query="${tag}"`,
  'limit=5',
  `scope={chatId:"${scopeChatId}",project:"evermemory"}.`,
  'Return only tool result text.',
].join(' ');

const recallRaw = runOpenClaw([
  'agent',
  '--session-id',
  'evermemory-openclaw-smoke-recall',
  '--message',
  recallMessage,
  '--json',
]);
const recallResult = parseAgentJson(recallRaw);
const recallText = getPayloadText(recallResult);
assertIncludes(recallText, 'Found', 'recall result');
assertIncludes(recallText, tag, 'recall result');

const evidence = queryDbEvidence(tag, scopeChatId, dbPath);

console.log('[evermemory:openclaw-smoke] PASS');
console.log(`[evermemory:openclaw-smoke] tag=${tag}`);
console.log(`[evermemory:openclaw-smoke] storeRunId=${storeResult.runId}`);
console.log(`[evermemory:openclaw-smoke] recallRunId=${recallResult.runId}`);
console.log(`[evermemory:openclaw-smoke] dbMemoryId=${evidence.memoryId}`);
console.log(`[evermemory:openclaw-smoke] dbRetrievalEventId=${evidence.retrievalEventId}`);

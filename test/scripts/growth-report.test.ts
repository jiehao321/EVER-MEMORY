import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { createTempDbPath } from '../helpers.js';
import { runMigrations } from '../../src/storage/migrations.js';

function openTempDb(name: string) {
  const dbPath = createTempDbPath(name);
  const db = new Database(dbPath);
  runMigrations(db);
  return { dbPath, db };
}

async function runReport(dbPath: string, args: string[] = []): Promise<string> {
  const daysArgIndex = args.indexOf('--days');
  const days = daysArgIndex >= 0 ? Number(args[daysArgIndex + 1]) : 30;
  const scriptUrl = pathToFileURL(resolve(process.cwd(), 'scripts/growth-report.mjs')).href;
  const module = await import(scriptUrl);
  return module.generateGrowthReport({
    dbPath,
    days,
    now: new Date('2026-03-15T00:00:00.000Z'),
  });
}

function insertMemory(
  db: Database.Database,
  input: {
    id: string;
    type: string;
    tags?: string[];
    confidence?: number;
    sessionId?: string;
    createdAt?: string;
    embedding?: Buffer | null;
    embeddingModel?: string;
  },
): void {
  const createdAt = input.createdAt ?? '2026-03-15T00:00:00.000Z';
  db.prepare(
    `INSERT INTO memory_items (
      id, content, type, lifecycle, source_kind, source_actor, session_id, message_id, channel,
      scope_user_id, scope_chat_id, scope_project, scope_global, confidence, importance, explicitness,
      created_at, updated_at, last_accessed_at, active, archived, superseded_by, evidence_excerpt,
      evidence_references_json, tags_json, related_entities_json, access_count, retrieval_count,
      embedding_blob, embedding_dim, embedding_model
    ) VALUES (
      @id, @content, @type, 'working', 'test', 'tester', @sessionId, NULL, 'test',
      'user-1', 'chat-1', 'evermemory', 0, @confidence, 0.5, 0.5,
      @createdAt, @createdAt, NULL, 1, 0, NULL, NULL, '[]', @tagsJson, '[]', 0, 0,
      @embeddingBlob, @embeddingDim, @embeddingModel
    )`,
  ).run({
    id: input.id,
    content: `${input.type} memory ${input.id}`,
    type: input.type,
    sessionId: input.sessionId ?? null,
    confidence: input.confidence ?? 0.5,
    createdAt,
    tagsJson: JSON.stringify(input.tags ?? []),
    embeddingBlob: input.embedding ?? null,
    embeddingDim: input.embedding ? 3 : 0,
    embeddingModel: input.embeddingModel ?? '',
  });
}

function insertRulesLoaded(
  db: Database.Database,
  input: { id: string; createdAt: string; rules: number },
): void {
  db.prepare(
    `INSERT INTO debug_events (id, created_at, kind, entity_id, payload_json)
     VALUES (?, ?, 'rules_loaded', 'entity-1', ?)`,
  ).run(input.id, input.createdAt, JSON.stringify({ rules: input.rules }));
}

function insertSessionEnd(
  db: Database.Database,
  input: {
    id: string;
    createdAt: string;
    generated: number;
    accepted: number;
    rejectedReasons?: string[];
  },
): void {
  db.prepare(
    `INSERT INTO debug_events (id, created_at, kind, entity_id, payload_json)
     VALUES (?, ?, 'session_end_processed', 'session-1', ?)`,
  ).run(
    input.id,
    input.createdAt,
    JSON.stringify({
      autoMemoryGenerated: input.generated,
      autoMemoryAccepted: input.accepted,
      autoMemoryRejected: Math.max(input.generated - input.accepted, 0),
      autoMemoryRejectedReasons: input.rejectedReasons ?? [],
    }),
  );
}

test('growth report returns zero metrics for an empty database', async () => {
  const { dbPath, db } = openTempDb('growth-report-empty');

  try {
    db.close();
    const output = await runReport(dbPath);
    assert.match(output, /总计:\s+0 条记忆/);
    assert.match(output, /近 7 天 accept rate:\s+0\.00/);
    assert.match(output, /嵌入覆盖率:\s+0% \(0\/0 条记忆\)/);
    assert.match(output, /状态:\s+未启用/);
    assert.match(output, /智能度评分：0\/100/);
  } finally {
    try {
      db.close();
    } catch {}
    rmSync(dbPath, { force: true });
  }
});

test('growth report groups memory counts by kind and shows recent additions', async () => {
  const { dbPath, db } = openTempDb('growth-report-kinds');

  try {
    insertMemory(db, { id: 'm1', type: 'project_state', confidence: 0.9, createdAt: '2026-03-14T00:00:00.000Z' });
    insertMemory(db, { id: 'm2', type: 'project_state', confidence: 0.7, createdAt: '2026-03-10T00:00:00.000Z' });
    insertMemory(db, { id: 'm3', type: 'decision', confidence: 0.6, createdAt: '2026-02-20T00:00:00.000Z' });
    insertMemory(db, { id: 'm4', type: 'user_preference', confidence: 0.8, createdAt: '2026-03-01T00:00:00.000Z' });
    insertRulesLoaded(db, { id: 'r1', createdAt: '2026-03-14T00:00:00.000Z', rules: 4 });
    db.close();
    const output = await runReport(dbPath, ['--days', '30']);

    assert.match(output, /总计:\s+4 条记忆/);
    assert.match(output, /project_state\s+2 条 \(50\.0%\)/);
    assert.match(output, /decision\s+1 条 \(25\.0%\)/);
    assert.match(output, /最近 7 天新增:\s+2 条/);
    assert.match(output, /最近 30 天新增:\s+4 条/);
    assert.match(output, /平均记忆质量:\s+0\.75/);
    assert.match(output, /智能度评分：/);
    assert.match(output, /行为规则成熟度：40分 \(4条活跃规则\)/);
  } finally {
    try {
      db.close();
    } catch {}
    rmSync(dbPath, { force: true });
  }
});

test('growth report computes accept rate trend and rejected reasons from debug events', async () => {
  const { dbPath, db } = openTempDb('growth-report-accept');

  try {
    insertSessionEnd(db, {
      id: 'd1',
      createdAt: '2026-03-14T00:00:00.000Z',
      generated: 5,
      accepted: 4,
      rejectedReasons: ['duplicate'],
    });
    insertSessionEnd(db, {
      id: 'd2',
      createdAt: '2026-03-12T00:00:00.000Z',
      generated: 3,
      accepted: 3,
    });
    insertSessionEnd(db, {
      id: 'd3',
      createdAt: '2026-02-25T00:00:00.000Z',
      generated: 4,
      accepted: 2,
      rejectedReasons: ['duplicate', 'quality'],
    });
    insertMemory(db, {
      id: 'm1',
      type: 'project_state',
      tags: ['project_state'],
      sessionId: 'session-a',
      embedding: Buffer.from(new Float32Array([0.1, 0.2, 0.3]).buffer),
      embeddingModel: 'local-bge-small',
    });
    insertMemory(db, { id: 'm2', type: 'decision', sessionId: 'session-a', tags: ['decision', 'lesson'] });
    insertMemory(db, { id: 'm3', type: 'decision', sessionId: 'session-b', tags: ['warning', 'explicit_constraint', 'user_preference'] });
    insertRulesLoaded(db, { id: 'r1', createdAt: '2026-03-14T00:00:00.000Z', rules: 8 });
    db.close();

    const output = await runReport(dbPath, ['--days', '30']);

    assert.match(output, /近 7 天 accept rate:\s+0\.88 \(↑ 较上月 \+0\.13\)/);
    assert.match(output, /近 30 天 accept rate:\s+0\.75/);
    assert.match(output, /主要拒绝原因:\s+duplicate \(66\.7%\), quality \(33\.3%\)/);
    assert.match(output, /嵌入覆盖率:\s+33% \(1\/3 条记忆\)/);
    assert.match(output, /状态:\s+已启用 \(local provider\)/);
    assert.match(output, /最活跃 session:\s+session-a \(2 条\)/);
    assert.match(output, /智能度评分：/);
    assert.match(output, /记忆多样性：\s+86分 \(6\/7 种类型覆盖\)/);
  } finally {
    try {
      db.close();
    } catch {}
    rmSync(dbPath, { force: true });
  }
});

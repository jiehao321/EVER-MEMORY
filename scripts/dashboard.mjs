#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';

const DEFAULT_DB_PATH = '.openclaw/memory/evermemory/store/evermemory.db';
const SMART_KINDS = ['project_state', 'decision', 'explicit_constraint', 'user_preference', 'next_step', 'lesson', 'warning'];
const TYPE_ALIASES = new Map([['user_preference', 'preference'], ['project', 'project_state'], ['constraint', 'other']]);

function fail(message) {
  process.stderr.write(`[evermemory:dashboard] ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = { dbPath: resolve(process.cwd(), DEFAULT_DB_PATH) };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--db') {
      parsed.dbPath = resolve(argv[i + 1] ?? '');
      i += 1;
    } else {
      fail(`unsupported argument: ${argv[i]}`);
    }
  }
  return parsed;
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function score(value) {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

function bar(count, total, width = 12) {
  const filled = total > 0 ? Math.max(1, Math.round((count / total) * width)) : 0;
  return `${'█'.repeat(filled)}${' '.repeat(Math.max(width - filled, 0))}`;
}

function padLine(text = '') {
  return `║ ${text.padEnd(57)} ║`;
}

function getVersion() {
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
  return String(pkg.version ?? '1.0.0');
}

function hasTable(db, table) {
  return Boolean(db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table));
}

function getSmartness(memoryRows, activeRules, nowIso) {
  const recentStart = new Date(Date.parse(nowIso) - 7 * 86400000).toISOString();
  const previousStart = new Date(Date.parse(nowIso) - 14 * 86400000).toISOString();
  const hasKind = (row, kind) => row.type === kind || row.tags.includes(kind);
  const countWindow = (rows) => rows.reduce((acc, row) => {
    if (row.createdAt >= recentStart) acc.recent += 1;
    else if (row.createdAt >= previousStart) acc.previous += 1;
    return acc;
  }, { recent: 0, previous: 0 });
  const total = memoryRows.length;
  const preferenceRows = memoryRows.filter((row) => hasKind(row, 'user_preference'));
  const constraintRows = memoryRows.filter((row) => hasKind(row, 'explicit_constraint'));
  const learningRows = memoryRows.filter((row) => hasKind(row, 'lesson') || hasKind(row, 'warning'));
  const uniqueKinds = SMART_KINDS.filter((kind) => memoryRows.some((row) => hasKind(row, kind))).length;
  return {
    overall: score(((Math.min(total / 100, 1)
      + Math.min((total > 0 ? preferenceRows.length / total : 0) * 3 + (constraintRows.length > 0 ? 0.1 : 0), 1)
      + Math.min(total > 0 ? learningRows.length / total : 0, 1)
      + Math.min(activeRules / 10, 1)
      + Math.min(uniqueKinds / SMART_KINDS.length, 1)) / 5)),
    depth: score(Math.min(total / 100, 1)),
    preference: score(Math.min((total > 0 ? preferenceRows.length / total : 0) * 3 + (constraintRows.length > 0 ? 0.1 : 0), 1)),
    learning: score(Math.min(total > 0 ? learningRows.length / total : 0, 1)),
    rules: score(Math.min(activeRules / 10, 1)),
    diversity: score(Math.min(uniqueKinds / SMART_KINDS.length, 1)),
    addedWeek: countWindow(memoryRows).recent,
  };
}

function getPerf() {
  const result = spawnSync('node', ['scripts/perf-benchmark.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const text = `${result.stdout}\n${result.stderr}`;
  const read = (label) => Number(new RegExp(`${label}\\s+([0-9.]+)ms`).exec(text)?.[1] ?? 0);
  const readBulk = (label) => Number(new RegExp(`${label}.*?\\(([0-9.]+)ms/op\\)`).exec(text)?.[1] ?? 0);
  return {
    sessionStart: read('sessionStart:'),
    messageReceived: read('messageReceived:'),
    sessionEnd: read('sessionEnd:'),
    store: readBulk('store \\(x100\\):'),
  };
}

function formatMs(value, suffix = 'ms') {
  return value > 0 ? `${value.toFixed(1)}${suffix}` : 'n/a';
}

function generateDashboard({ dbPath, now = new Date() }) {
  if (!existsSync(dbPath)) fail(`database not found: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });
  try {
    const hasMemory = hasTable(db, 'memory_items');
    const hasRules = hasTable(db, 'behavior_rules');
    const totalRow = hasMemory
      ? db.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) added7, SUM(CASE WHEN embedding_blob IS NOT NULL THEN 1 ELSE 0 END) embedded FROM memory_items`).get(new Date(now.getTime() - 7 * 86400000).toISOString())
      : { total: 0, added7: 0, embedded: 0 };
    const memoryRows = hasMemory
      ? db.prepare(`SELECT type, created_at, tags_json FROM memory_items`).all().map((row) => ({ type: String(row.type ?? ''), createdAt: String(row.created_at ?? ''), tags: parseJson(row.tags_json, []) }))
      : [];
    const kindRows = hasMemory
      ? db.prepare(`SELECT type, COUNT(*) count FROM memory_items GROUP BY type ORDER BY count DESC, type ASC`).all()
      : [];
    const providerRow = hasMemory
      ? db.prepare(`SELECT embedding_model FROM memory_items WHERE embedding_blob IS NOT NULL AND TRIM(COALESCE(embedding_model, '')) != '' ORDER BY updated_at DESC LIMIT 1`).get()
      : null;
    const activeRules = hasRules ? Number((db.prepare(`SELECT COUNT(*) count FROM behavior_rules WHERE active = 1 AND deprecated = 0 AND COALESCE(frozen, 0) = 0 AND (expires_at IS NULL OR expires_at >= ?)`).get(now.toISOString()) ?? {}).count) || 0 : 0;
    const conflicts = hasRules ? Number((db.prepare(`SELECT COUNT(*) count FROM behavior_rules WHERE freeze_reason = 'conflict'`).get() ?? {}).count) || 0 : 0;
    const expired = hasRules ? Number((db.prepare(`SELECT COUNT(*) count FROM behavior_rules WHERE expires_at IS NOT NULL AND expires_at < ?`).get(now.toISOString()) ?? {}).count) || 0 : 0;
    const total = Number(totalRow.total) || 0;
    const embedded = Number(totalRow.embedded) || 0;
    const byType = new Map();
    for (const row of kindRows) {
      const key = TYPE_ALIASES.get(String(row.type)) ?? String(row.type);
      byType.set(key, (byType.get(key) ?? 0) + Number(row.count));
    }
    const preferred = ['project_state', 'decision', 'preference', 'lesson', 'warning'];
    const dist = preferred.map((type) => [type, byType.get(type) ?? 0]).filter(([, count]) => count > 0);
    const other = [...byType.entries()].filter(([type]) => !preferred.includes(type)).reduce((sum, [, count]) => sum + count, 0);
    if (other > 0 || dist.length === 0) dist.push(['other', other]);
    const smart = getSmartness(memoryRows, activeRules, now.toISOString());
    const perf = getPerf();
    const provider = String(providerRow?.embedding_model ?? '').toLowerCase();
    const embeddingStatus = embedded === 0 ? 'off' : provider.includes('openai') ? 'openai' : 'local';
    const health = conflicts === 0 && expired === 0 ? '良好' : '关注';
    const lines = [
      '╔═══════════════════════════════════════════════════════════╗',
      `║         EverMemory Dashboard  ·  v${getVersion().padEnd(20)}║`,
      '╠═══════════════════════════════════════════════════════════╣',
      padLine(),
      padLine('📊 记忆概览'),
      padLine(`总计: ${total} 条  |  本周新增: ${smart.addedWeek} 条  |  语义覆盖: ${pct(embedded, total)}%`),
      padLine(),
      padLine('📈 类型分布'),
      ...dist.slice(0, 6).map(([type, count]) => padLine(`${String(type).padEnd(13)} ${bar(count, total)} ${String(count).padStart(3)} (${pct(count, total)}%)`)),
      padLine(),
      padLine(`🧠 智能度: ${smart.overall}/100`),
      padLine(`记忆深度: ${smart.depth}  偏好精准度: ${smart.preference}  主动学习: ${smart.learning}`),
      padLine(`规则成熟度: ${smart.rules}  多样性: ${smart.diversity}`),
      padLine(),
      padLine('⚡ 性能'),
      padLine(`sessionStart: ${formatMs(perf.sessionStart)}  messageReceived: ${formatMs(perf.messageReceived)}`),
      padLine(`sessionEnd: ${formatMs(perf.sessionEnd)}  store: ${formatMs(perf.store, 'ms/op')}`),
      padLine(),
      padLine(`✅ 健康状态: ${health}`),
      padLine(`嵌入: ${embeddingStatus} ${embedded > 0 ? '✓' : '·'}  冲突: ${conflicts}  过期: ${expired}  规则: ${activeRules} 条活跃`),
      '╚═══════════════════════════════════════════════════════════╝',
    ];
    return lines.join('\n');
  } finally {
    db.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.stdout.write(`${generateDashboard({ ...parseArgs(process.argv.slice(2)) })}\n`);
}

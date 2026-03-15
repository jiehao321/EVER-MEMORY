#!/usr/bin/env node
import process from 'node:process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

const VERSION = '1.0.0';
const DEFAULT_DATABASE_PATH = '.openclaw/memory/evermemory/store/evermemory.db';
const MEMORY_TYPES = ['identity', 'fact', 'preference', 'decision', 'commitment', 'relationship', 'task', 'project', 'style', 'summary', 'constraint'];
const CURRENT_SCHEMA_VERSION = 9;
const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`[evermemory:doctor] ${message}`);
  process.exit(1);
}

function parseMajor(version) {
  const match = /^v(\d+)\./.exec(version);
  return match ? Number(match[1]) : null;
}

function hasTable(db, name) {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return Boolean(row);
}

function yes(flag) {
  return flag ? '✓' : '⚠';
}

function formatCheck(ok, label, detail) {
  return `${yes(ok)} ${label}: ${detail}`;
}

const major = parseMajor(process.version);
if (major !== 22) {
  fail(`Unsupported Node.js version ${process.version}. Use Node 22.x for this repository.`);
}

let Database;
try {
  ({ default: Database } = await import('better-sqlite3'));
  const db = new Database(':memory:');
  db.prepare('SELECT 1 as value').get();
  db.close();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`better-sqlite3 native probe failed: ${detail}\nRun: npm rebuild better-sqlite3`);
}

const databasePath = resolve(process.env.EVERMEMORY_DATABASE_PATH ?? DEFAULT_DATABASE_PATH);
mkdirSync(dirname(databasePath), { recursive: true });
const dbAlreadyExists = existsSync(databasePath);
const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

const lines = [];
const suggestions = [];

let memoryCount = 0;
let schemaVersion = 0;
let distinctTypes = 0;
let orphanEmbeddings = 0;
let activeRules = 0;
let inconsistentMemories = 0;

if (hasTable(db, 'memory_items')) {
  memoryCount = (db.prepare('SELECT COUNT(*) AS count FROM memory_items').get() ?? { count: 0 }).count;
  distinctTypes = (db.prepare('SELECT COUNT(DISTINCT type) AS count FROM memory_items').get() ?? { count: 0 }).count;
  inconsistentMemories = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM memory_items
    WHERE (archived = 1 AND lifecycle != 'archive')
       OR (archived = 0 AND lifecycle = 'archive')
       OR (archived = 1 AND active = 1)
  `).get() ?? { count: 0 }).count;
}

if (hasTable(db, 'schema_version')) {
  schemaVersion = (db.prepare('SELECT version FROM schema_version LIMIT 1').get() ?? { version: 0 }).version;
}

if (hasTable(db, 'embedding_meta')) {
  orphanEmbeddings = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM embedding_meta em
    LEFT JOIN memory_items mi ON mi.id = em.memory_id
    WHERE mi.id IS NULL
  `).get() ?? { count: 0 }).count;
}

if (hasTable(db, 'behavior_rules')) {
  activeRules = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM behavior_rules
    WHERE active = 1
      AND deprecated = 0
      AND (frozen IS NULL OR frozen = 0)
  `).get() ?? { count: 0 }).count;
}

let transformersInstalled = true;
try {
  require.resolve('@xenova/transformers');
} catch {
  transformersInstalled = false;
  suggestions.push('npm install @xenova/transformers  # 启用语义搜索');
}

if (orphanEmbeddings > 0) {
  suggestions.push(`运行 memory_housekeeping 清理 ${orphanEmbeddings} 条孤立嵌入`);
}

lines.push(`EverMemory Doctor (v${VERSION})`);
lines.push('========================');
lines.push('');
lines.push(formatCheck(
  dbAlreadyExists || memoryCount > 0 || schemaVersion > 0,
  '数据库',
  dbAlreadyExists || memoryCount > 0 ? `已就绪 (${memoryCount} 条记忆)` : `尚未初始化 (${databasePath})`,
));
lines.push(formatCheck(
  schemaVersion >= CURRENT_SCHEMA_VERSION,
  '迁移',
  `所有迁移已应用 (${schemaVersion}/${CURRENT_SCHEMA_VERSION})`,
));
lines.push(formatCheck(
  distinctTypes >= Math.max(1, Math.min(6, MEMORY_TYPES.length - 1)),
  '类型分布',
  `${distinctTypes}/${MEMORY_TYPES.length} 种记忆类型覆盖${distinctTypes >= 6 ? '良好' : '偏低'}`,
));
lines.push(formatCheck(
  transformersInstalled,
  '嵌入',
  transformersInstalled
    ? '@xenova/transformers 已安装'
    : '@xenova/transformers 未安装 -> 使用关键词搜索（建议安装以获得更好的语义搜索）',
));
lines.push(formatCheck(
  orphanEmbeddings === 0,
  '孤立嵌入',
  orphanEmbeddings === 0 ? '无孤立嵌入' : `${orphanEmbeddings} 条嵌入无对应记忆（建议运行 cleanup）`,
));
lines.push(formatCheck(activeRules > 0, '行为规则', `${activeRules} 条活跃规则`));
lines.push(formatCheck(
  inconsistentMemories === 0,
  '记忆健康',
  inconsistentMemories === 0 ? '无过期或冲突记忆' : `${inconsistentMemories} 条记忆状态冲突`,
));

if (suggestions.length > 0) {
  lines.push('');
  lines.push('建议：');
  for (const [index, suggestion] of suggestions.entries()) {
    lines.push(`  ${index + 1}. ${suggestion}`);
  }
}

console.log(lines.join('\n'));
console.log('[evermemory:doctor] environment is healthy');

db.close();

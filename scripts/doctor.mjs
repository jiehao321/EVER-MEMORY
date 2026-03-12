#!/usr/bin/env node
import process from 'node:process';

function fail(message) {
  console.error(`[evermemory:doctor] ${message}`);
  process.exit(1);
}

function parseMajor(version) {
  const match = /^v(\d+)\./.exec(version);
  return match ? Number(match[1]) : null;
}

const major = parseMajor(process.version);
if (major !== 22) {
  fail(`Unsupported Node.js version ${process.version}. Use Node 22.x for this repository.`);
}

try {
  const { default: Database } = await import('better-sqlite3');
  const db = new Database(':memory:');
  db.prepare('SELECT 1 as value').get();
  db.close();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(
    `better-sqlite3 native probe failed: ${detail}\n` +
      'Run: npm rebuild better-sqlite3',
  );
}

console.log('[evermemory:doctor] environment is healthy');

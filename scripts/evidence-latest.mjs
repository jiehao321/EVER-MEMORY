#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveEvidenceDir } from './report-evidence.mjs';

function printRecord(label, path) {
  if (!existsSync(path)) {
    console.log(`[evermemory:evidence] ${label}: not found (${path})`);
    return;
  }
  try {
    const raw = readFileSync(path, 'utf8');
    const data = JSON.parse(raw);
    console.log(`[evermemory:evidence] ${label}`);
    console.log(`  runner: ${String(data.runner ?? 'unknown')}`);
    console.log(`  ok: ${String(data.ok ?? false)}`);
    if (typeof data.mode === 'string') {
      console.log(`  mode: ${data.mode}`);
    }
    console.log(`  reportPath: ${String(data.reportPath ?? '')}`);
    console.log(`  timestamp: ${String(data.timestamp ?? '')}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.log(`[evermemory:evidence] ${label}: invalid json (${detail})`);
  }
}

const dir = resolveEvidenceDir();
const latestPath = resolve(dir, 'quality-evidence-latest.json');
const latestByRunner = [
  { label: 'quality-gate', file: 'quality-evidence-latest-quality-gate.json' },
  { label: 'agent-teams', file: 'quality-evidence-latest-agent-teams.json' },
  { label: 'openclaw-soak', file: 'quality-evidence-latest-openclaw-soak.json' },
  { label: 'recall-benchmark', file: 'quality-evidence-latest-recall-benchmark.json' },
  { label: 'security-recover', file: 'quality-evidence-latest-security-recover.json' },
];

console.log(`[evermemory:evidence] dir=${dir}`);
printRecord('latest', latestPath);
for (const item of latestByRunner) {
  printRecord(item.label, resolve(dir, item.file));
}

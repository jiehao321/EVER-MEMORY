import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function nowIso() {
  return new Date().toISOString();
}

function ensureParent(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function readJsonArray(path) {
  try {
    const raw = readFileSync(path, 'utf8').trim();
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function trimHistory(entries, max = 120) {
  if (entries.length <= max) {
    return entries;
  }
  return entries.slice(entries.length - max);
}

export function resolveEvidenceDir() {
  return resolve(process.env.EVERMEMORY_EVIDENCE_DIR ?? '.openclaw/reports');
}

export function recordEvidence(entry) {
  try {
    const dir = resolveEvidenceDir();
    const historyPath = resolve(dir, 'quality-evidence-history.json');
    const latestPath = resolve(dir, 'quality-evidence-latest.json');
    const latestByRunnerPath = resolve(dir, `quality-evidence-latest-${entry.runner}.json`);

    const record = {
      timestamp: nowIso(),
      ...entry,
    };

    const existing = readJsonArray(historyPath);
    const history = trimHistory([...existing, record], 200);

    ensureParent(historyPath);
    writeFileSync(historyPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8');
    writeFileSync(latestPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    writeFileSync(latestByRunnerPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[evermemory:evidence] failed to record evidence: ${detail}`);
  }
}

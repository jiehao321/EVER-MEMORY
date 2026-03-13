#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { recordEvidence } from './report-evidence.mjs';

function fail(message) {
  console.error(`[evermemory:release-pack] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    version: '0.0.1',
    outDir: '/tmp/evermemory-release',
    reportPath: undefined,
    evidenceDir: '/tmp/evermemory-release-evidence',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--version') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --version');
      }
      parsed.version = next;
      index += 1;
      continue;
    }
    if (arg === '--out-dir') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --out-dir');
      }
      parsed.outDir = next;
      index += 1;
      continue;
    }
    if (arg === '--report') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --report');
      }
      parsed.reportPath = next;
      index += 1;
      continue;
    }
    if (arg === '--evidence-dir') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --evidence-dir');
      }
      parsed.evidenceDir = next;
      index += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function defaultReportPath(version) {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  return `/tmp/evermemory-release-pack-v${version}-${stamp}.json`;
}

function run(command, args, capture = false, env = process.env) {
  return spawnSync(command, args, {
    stdio: capture ? 'pipe' : 'inherit',
    encoding: capture ? 'utf8' : undefined,
    env,
  });
}

function loadPackageVersion() {
  const raw = readFileSync(resolve('./package.json'), 'utf8');
  const parsed = JSON.parse(raw);
  return String(parsed.version ?? '');
}

const parsed = parseArgs(process.argv.slice(2));
const runEnv = {
  ...process.env,
  EVERMEMORY_EVIDENCE_DIR: parsed.evidenceDir,
};
process.env.EVERMEMORY_EVIDENCE_DIR = parsed.evidenceDir;
const actualVersion = loadPackageVersion();
if (actualVersion !== parsed.version) {
  fail(`package.json version mismatch: expected=${parsed.version} actual=${actualVersion}`);
}

const guard = run('node', ['./scripts/git-branch-guard.mjs'], false, runEnv);
if (guard.status !== 0) {
  fail('git-branch-guard failed');
}

const outDir = resolve(parsed.outDir);
mkdirSync(outDir, { recursive: true });

const pack = run('npm', ['pack', '--json', '--pack-destination', outDir], true, runEnv);
if (pack.status !== 0) {
  const detail = (pack.stderr ?? '').trim();
  fail(`npm pack failed${detail ? `: ${detail}` : ''}`);
}

let packJson;
try {
  const rows = JSON.parse((pack.stdout ?? '').trim());
  packJson = Array.isArray(rows) ? rows[0] : undefined;
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`failed to parse npm pack JSON: ${detail}`);
}

if (!packJson?.filename) {
  fail('npm pack JSON missing filename');
}

const report = {
  generatedAt: new Date().toISOString(),
  version: parsed.version,
  ok: true,
  outDir,
  evidenceDir: parsed.evidenceDir,
  packageFile: resolve(outDir, String(packJson.filename)),
  npmPack: packJson,
};

const reportPath = resolve(parsed.reportPath ?? defaultReportPath(parsed.version));
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

recordEvidence({
  runner: 'release-pack',
  ok: true,
  reportPath,
  version: parsed.version,
  packageFile: report.packageFile,
});

console.log(`[evermemory:release-pack] PASS report=${reportPath}`);
console.log(`[evermemory:release-pack] package=${report.packageFile}`);

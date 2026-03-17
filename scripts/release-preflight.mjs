#!/usr/bin/env node

/**
 * EverMemory release pre-flight check.
 *
 * Validates cross-platform installation integrity and version consistency
 * before any release. Run this BEFORE release-evaluate / release-pack.
 *
 * Usage:
 *   node scripts/release-preflight.mjs
 *   npm run release:preflight
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(root, relPath), 'utf8'));
}

function readText(relPath) {
  return readFileSync(resolve(root, relPath), 'utf8');
}

let failures = 0;
let warnings = 0;

function pass(label) {
  console.log(`  ✓ ${label}`);
}

function fail(label, detail) {
  console.error(`  ✗ ${label}: ${detail}`);
  failures += 1;
}

function warn(label, detail) {
  console.log(`  ⚠ ${label}: ${detail}`);
  warnings += 1;
}

// =============================================================
// 1. Version consistency across all sources
// =============================================================
console.log('\n== 1. Version Consistency ==\n');

const pkg = readJson('package.json');
const version = pkg.version;
pass(`package.json → ${version}`);

// constants.ts source
const constantsSrc = readText('src/constants.ts');
const srcMatch = /PLUGIN_VERSION\s*=\s*'([^']+)'/.exec(constantsSrc);
if (srcMatch && srcMatch[1] === version) {
  pass(`src/constants.ts PLUGIN_VERSION → ${srcMatch[1]}`);
} else {
  fail('src/constants.ts PLUGIN_VERSION', `expected '${version}', got '${srcMatch?.[1] ?? 'NOT FOUND'}'`);
}

// dist/constants.js (compiled)
const distConstantsPath = resolve(root, 'dist/constants.js');
if (existsSync(distConstantsPath)) {
  const distConstants = readText('dist/constants.js');
  const distMatch = /PLUGIN_VERSION\s*=\s*'([^']+)'/.exec(distConstants);
  if (distMatch && distMatch[1] === version) {
    pass(`dist/constants.js PLUGIN_VERSION → ${distMatch[1]}`);
  } else {
    fail('dist/constants.js PLUGIN_VERSION', `expected '${version}', got '${distMatch?.[1] ?? 'NOT FOUND'}'. Run: npm run build`);
  }
} else {
  fail('dist/constants.js', 'file missing — run: npm run build');
}

// openclaw.plugin.json
const openclawPlugin = readJson('openclaw.plugin.json');
if (openclawPlugin.version === version) {
  pass(`openclaw.plugin.json → ${openclawPlugin.version}`);
} else {
  fail('openclaw.plugin.json version', `expected '${version}', got '${openclawPlugin.version}'`);
}

// plugin.json
const pluginJson = readJson('plugin.json');
if (pluginJson.version === version) {
  pass(`plugin.json → ${pluginJson.version}`);
} else {
  fail('plugin.json version', `expected '${version}', got '${pluginJson.version}'`);
}

// package-lock.json (root entry)
if (existsSync(resolve(root, 'package-lock.json'))) {
  const lockfile = readJson('package-lock.json');
  if (lockfile.version === version) {
    pass(`package-lock.json → ${lockfile.version}`);
  } else {
    fail('package-lock.json version', `expected '${version}', got '${lockfile.version}'. Run: npm install --package-lock-only`);
  }
}

// docs version references
for (const docFile of ['docs/GUIDE.md', 'docs/ARCHITECTURE.md']) {
  if (existsSync(resolve(root, docFile))) {
    const content = readText(docFile);
    // Check for stale version patterns (e.g. "Version: X.Y.Z" or "evermemory@X.Y.Z")
    const staleVersions = [];
    for (const match of content.matchAll(/(?:Version[:\s]*|evermemory@)(\d+\.\d+\.\d+)/g)) {
      if (match[1] !== version) {
        staleVersions.push(match[1]);
      }
    }
    if (staleVersions.length > 0) {
      fail(docFile, `stale version references: ${[...new Set(staleVersions)].join(', ')}`);
    } else {
      pass(`${docFile} — version references current`);
    }
  }
}

// =============================================================
// 2. npm package file completeness
// =============================================================
console.log('\n== 2. npm Package Completeness ==\n');

const requiredFiles = [
  'dist/index.js',
  'dist/index.d.ts',
  'dist/openclaw/plugin.js',
  'dist/openclaw/plugin.d.ts',
  'scripts/setup.mjs',
  'openclaw.plugin.json',
  'plugin.json',
  'LICENSE',
  'README.md',
];

for (const file of requiredFiles) {
  if (existsSync(resolve(root, file))) {
    pass(file);
  } else {
    fail(file, 'missing from project root');
  }
}

// Verify files array includes plugin configs
const filesField = pkg.files || [];
for (const required of ['openclaw.plugin.json', 'plugin.json']) {
  if (filesField.includes(required)) {
    pass(`package.json files[] includes "${required}"`);
  } else {
    fail(`package.json files[]`, `missing "${required}" — file won't be in npm tarball`);
  }
}

// Verify npm pack includes expected files
try {
  const packOutput = execSync('npm pack --dry-run 2>&1', { cwd: root, encoding: 'utf8' });
  const packFiles = packOutput.toLowerCase();
  for (const expected of ['openclaw.plugin.json', 'plugin.json', 'dist/index.js', 'dist/openclaw/plugin.js']) {
    if (packFiles.includes(expected)) {
      pass(`npm pack contains ${expected}`);
    } else {
      fail(`npm pack`, `missing ${expected} in tarball`);
    }
  }
} catch (error) {
  fail('npm pack --dry-run', `failed: ${error.message}`);
}

// =============================================================
// 3. Cross-platform compatibility
// =============================================================
console.log('\n== 3. Cross-Platform Compatibility ==\n');

// Check for shell-specific syntax in scripts (2>&1, |, &&, etc.) used without shell:true
const scriptFiles = [
  'scripts/setup.mjs',
  'scripts/release-publish.mjs',
  'scripts/release-pack.mjs',
  'scripts/release-evaluate.mjs',
  'scripts/doctor.mjs',
  'scripts/build-with-fingerprint.mjs',
];

for (const scriptFile of scriptFiles) {
  const filePath = resolve(root, scriptFile);
  if (!existsSync(filePath)) continue;
  const content = readText(scriptFile);

  // Check for shell redirections in execSync without shell:true
  const shellRedirects = [...content.matchAll(/exec(?:Sync|FileSync)\([^)]*(?:2>&1|>\s*\/dev\/null|<\()/g)];
  if (shellRedirects.length > 0) {
    fail(scriptFile, `shell redirection syntax in exec call without shell:true`);
  } else {
    pass(`${scriptFile} — no unsafe shell syntax`);
  }
}

// Check shebangs
for (const scriptFile of scriptFiles) {
  const filePath = resolve(root, scriptFile);
  if (!existsSync(filePath)) continue;
  const firstLine = readText(scriptFile).split('\n')[0];
  if (firstLine.startsWith('#!/usr/bin/env node')) {
    pass(`${scriptFile} — portable shebang`);
  } else if (firstLine.startsWith('#!')) {
    warn(scriptFile, `non-portable shebang: ${firstLine}`);
  }
}

// Check Node version compatibility in doctor
const doctorContent = readText('scripts/doctor.mjs');
if (doctorContent.includes('major !== 22') || doctorContent.includes('major === 22')) {
  fail('scripts/doctor.mjs', 'Node version check too strict — should use major < 22 to allow future versions');
} else if (doctorContent.includes('major < 22')) {
  pass('scripts/doctor.mjs — Node version check allows >=22');
} else {
  warn('scripts/doctor.mjs', 'could not detect Node version check pattern');
}

// =============================================================
// 4. Entry point & exports validation
// =============================================================
console.log('\n== 4. Entry Points & Exports ==\n');

// Verify main/types/exports match existing files
if (pkg.main && existsSync(resolve(root, pkg.main))) {
  pass(`main: ${pkg.main}`);
} else {
  fail('main', `${pkg.main} does not exist`);
}

if (pkg.types && existsSync(resolve(root, pkg.types))) {
  pass(`types: ${pkg.types}`);
} else {
  fail('types', `${pkg.types} does not exist`);
}

if (pkg.exports?.['.']?.import) {
  const importPath = pkg.exports['.'].import;
  if (existsSync(resolve(root, importPath))) {
    pass(`exports["."].import: ${importPath}`);
  } else {
    fail('exports["."].import', `${importPath} does not exist`);
  }
}

// OpenClaw extension entry
const openclawExt = pkg.openclaw?.extensions?.[0];
if (openclawExt && existsSync(resolve(root, openclawExt))) {
  pass(`openclaw.extensions[0]: ${openclawExt}`);
} else {
  fail('openclaw.extensions[0]', `${openclawExt} does not exist`);
}

// =============================================================
// 5. Hardcoded stale version scan
// =============================================================
console.log('\n== 5. Stale Version Scan ==\n');

// Scan source and script files for hardcoded old versions
const scanPaths = [
  ...scriptFiles,
  'src/constants.ts',
];
const versionPattern = /['"](\d+\.\d+\.\d+)['"]/g;
let staleFound = false;

for (const scanPath of scanPaths) {
  const filePath = resolve(root, scanPath);
  if (!existsSync(filePath)) continue;
  const content = readText(scanPath);
  for (const match of content.matchAll(versionPattern)) {
    const foundVersion = match[1];
    // Skip if it's the current version, or clearly a dependency version (e.g. in require/import)
    if (foundVersion === version) continue;
    if (foundVersion === '0.0.0') continue;
    // Only flag versions that look like our own (1.0.x pattern)
    if (foundVersion.startsWith('1.0.') || foundVersion.startsWith('0.')) {
      // Check if it's in a comment or arg parsing default
      const lineIdx = content.lastIndexOf('\n', match.index) + 1;
      const line = content.slice(lineIdx, content.indexOf('\n', match.index));
      if (!line.trimStart().startsWith('//') && !line.trimStart().startsWith('*')) {
        warn(scanPath, `possible stale version "${foundVersion}" in: ${line.trim()}`);
        staleFound = true;
      }
    }
  }
}
if (!staleFound) {
  pass('no stale version strings found in source/scripts');
}

// =============================================================
// Summary
// =============================================================
console.log('\n== Summary ==\n');
console.log(`  Version:  ${version}`);
console.log(`  Failures: ${failures}`);
console.log(`  Warnings: ${warnings}`);
console.log('');

if (failures > 0) {
  console.error(`  ✗ PREFLIGHT FAILED — fix ${failures} issue(s) before release.\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.log(`  ⚠ PREFLIGHT PASSED with ${warnings} warning(s).\n`);
} else {
  console.log('  ✓ PREFLIGHT PASSED — ready for release.\n');
}

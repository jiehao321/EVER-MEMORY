#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const BUILD_INPUT_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.build.json',
  'index.ts',
];
const BUILD_INPUT_DIRS = ['src'];
const BUILD_STAMP_PATH = resolve('dist/.build-fingerprint.json');

function walkFiles(dirPath, collector) {
  if (!existsSync(dirPath)) {
    return collector;
  }
  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkFiles(entryPath, collector);
      continue;
    }
    collector.push(entryPath);
  }
  return collector;
}

function gatherBuildInputs() {
  const inputs = [];
  for (const file of BUILD_INPUT_FILES) {
    if (existsSync(file)) {
      inputs.push(resolve(file));
    }
  }
  for (const dir of BUILD_INPUT_DIRS) {
    walkFiles(dir, inputs);
  }
  inputs.sort();
  return inputs;
}

export function computeBuildFingerprint() {
  const files = gatherBuildInputs();
  const hash = createHash('sha256');
  for (const filePath of files) {
    const rel = relative(process.cwd(), filePath);
    hash.update(rel);
    hash.update('\0');
    const content = readFileSync(filePath);
    hash.update(content);
    hash.update('\0');
    const stats = statSync(filePath);
    hash.update(String(stats.mtimeMs));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function readBuildStamp() {
  if (!existsSync(BUILD_STAMP_PATH)) {
    return undefined;
  }
  try {
    const raw = readFileSync(BUILD_STAMP_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function buildStampPath() {
  return BUILD_STAMP_PATH;
}

export function writeBuildStamp(stamp) {
  mkdirSync(resolve('dist'), { recursive: true });
  writeFileSync(BUILD_STAMP_PATH, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
}

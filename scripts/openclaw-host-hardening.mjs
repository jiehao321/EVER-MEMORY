#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

function fail(message) {
  console.error(`[evermemory:openclaw-host-hardening] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = {
    configPath: join(homedir(), '.openclaw', 'openclaw.json'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config') {
      const next = argv[index + 1];
      if (!next) {
        fail('missing value for --config');
      }
      parsed.configPath = next;
      index += 1;
      continue;
    }
    fail(`unsupported argument: ${arg}`);
  }

  return parsed;
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function markChange(changes, key, before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    changes.push({ key, before, after });
  }
}

function ensureChannelAllowlists(config, changes) {
  const channels = asObject(config.channels);
  const telegram = asObject(channels.telegram);
  const feishu = asObject(channels.feishu);

  markChange(changes, 'channels.telegram.groupPolicy', telegram.groupPolicy, 'allowlist');
  telegram.groupPolicy = 'allowlist';
  const telegramGroupAllowBefore = Array.isArray(telegram.groupAllowFrom)
    ? telegram.groupAllowFrom
    : undefined;
  if (!Array.isArray(telegram.groupAllowFrom)) {
    telegram.groupAllowFrom = [];
  }
  markChange(changes, 'channels.telegram.groupAllowFrom', telegramGroupAllowBefore, telegram.groupAllowFrom);
  if (Object.prototype.hasOwnProperty.call(telegram, 'groups')) {
    markChange(changes, 'channels.telegram.groups', telegram.groups, undefined);
    delete telegram.groups;
  }

  markChange(changes, 'channels.feishu.groupPolicy', feishu.groupPolicy, 'allowlist');
  feishu.groupPolicy = 'allowlist';
  const groupAllowFromBefore = Array.isArray(feishu.groupAllowFrom) ? feishu.groupAllowFrom : undefined;
  if (!Array.isArray(feishu.groupAllowFrom)) {
    feishu.groupAllowFrom = [];
  }
  markChange(changes, 'channels.feishu.groupAllowFrom', groupAllowFromBefore, feishu.groupAllowFrom);

  channels.telegram = telegram;
  channels.feishu = feishu;
  config.channels = channels;
}

function ensurePluginAllowlist(config, changes) {
  const plugins = asObject(config.plugins);
  const allowBefore = Array.isArray(plugins.allow) ? plugins.allow : undefined;
  const allow = [
    'evermemory',
    'feishu',
    'qqbot',
    'ddingtalk',
    'wecom',
    'adp-openclaw',
    'skillhub',
  ];
  markChange(changes, 'plugins.allow', allowBefore, allow);
  plugins.allow = allow;
  config.plugins = plugins;
}

function hasDocker() {
  const check = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  return check.status === 0;
}

function ensureSandboxAndFs(config, changes, targetMode) {
  const tools = asObject(config.tools);
  const fs = asObject(tools.fs);
  markChange(changes, 'tools.fs.workspaceOnly', fs.workspaceOnly, true);
  fs.workspaceOnly = true;
  tools.fs = fs;
  config.tools = tools;

  const agents = asObject(config.agents);
  const defaults = asObject(agents.defaults);
  const defaultSandbox = asObject(defaults.sandbox);
  markChange(changes, 'agents.defaults.sandbox.mode', defaultSandbox.mode, targetMode);
  defaultSandbox.mode = targetMode;
  defaults.sandbox = defaultSandbox;
  agents.defaults = defaults;

  const listBefore = Array.isArray(agents.list) ? agents.list : [];
  const listAfter = listBefore.map((agent) => {
    const normalized = asObject(agent);
    const sandbox = asObject(normalized.sandbox);
    sandbox.mode = targetMode;
    normalized.sandbox = sandbox;
    return normalized;
  });
  markChange(changes, 'agents.list[*].sandbox.mode', listBefore.map((item) => asObject(item).sandbox?.mode), listAfter.map((item) => item.sandbox?.mode));
  agents.list = listAfter;
  config.agents = agents;
}

function applyHardening(config) {
  const changes = [];
  ensureChannelAllowlists(config, changes);
  ensurePluginAllowlist(config, changes);
  const targetMode = hasDocker() ? 'all' : 'off';
  ensureSandboxAndFs(config, changes, targetMode);
  return changes;
}

const parsed = parseArgs(process.argv.slice(2));
const configPath = resolve(parsed.configPath);

let raw;
try {
  raw = readFileSync(configPath, 'utf8');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`failed to read config ${configPath}: ${detail}`);
}

let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`invalid json in ${configPath}: ${detail}`);
}

const changes = applyHardening(config);
const changed = changes.length > 0;
if (!changed) {
  console.log('[evermemory:openclaw-host-hardening] no changes required');
  process.exit(0);
}

const stamp = new Date().toISOString().replaceAll(':', '-');
const backupPath = `${configPath}.bak-${stamp}`;
try {
  writeFileSync(backupPath, raw, 'utf8');
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  fail(`failed to write config/backup: ${detail}`);
}

console.log(`[evermemory:openclaw-host-hardening] updated config=${configPath}`);
console.log(`[evermemory:openclaw-host-hardening] backup=${backupPath}`);
for (const item of changes) {
  console.log(`[evermemory:openclaw-host-hardening] changed ${item.key}`);
}

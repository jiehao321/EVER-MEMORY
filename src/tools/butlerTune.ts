import type { ButlerStateManager } from '../core/butler/state.js';
import type { ButlerConfig, ButlerMode } from '../core/butler/types.js';

const SETTABLE_KEYS = new Set([
  'mode',
  'cognition.dailyTokenBudget',
  'cognition.sessionTokenBudget',
  'attention.maxInsightsPerBriefing',
  'attention.minConfidence',
]);

export interface ButlerTuneResult {
  action: 'get' | 'set';
  config: ButlerConfig;
  updated?: { key: string; value: unknown };
}

function cloneConfig(config: ButlerConfig): ButlerConfig {
  return JSON.parse(JSON.stringify(config)) as ButlerConfig;
}

function readPositiveInteger(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid Butler tune value for ${key}.`);
  }
  return value;
}

function readMode(value: unknown): ButlerMode {
  if (value !== 'steward' && value !== 'reduced') {
    throw new Error('Invalid Butler mode.');
  }
  return value;
}

function readUnitInterval(value: unknown, key: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0 || value > 1) {
    throw new Error(`Invalid Butler tune value for ${key}.`);
  }
  return value;
}

function applyUpdate(
  stateManager: ButlerStateManager,
  config: ButlerConfig,
  key: string,
  value: unknown,
): void {
  switch (key) {
    case 'mode':
      config.mode = readMode(value);
      stateManager.setMode(config.mode);
      return;
    case 'cognition.dailyTokenBudget':
      config.cognition.dailyTokenBudget = readPositiveInteger(value, key);
      return;
    case 'cognition.sessionTokenBudget':
      config.cognition.sessionTokenBudget = readPositiveInteger(value, key);
      return;
    case 'attention.maxInsightsPerBriefing':
      config.attention.maxInsightsPerBriefing = readPositiveInteger(value, key);
      return;
    case 'attention.minConfidence':
      config.attention.minConfidence = readUnitInterval(value, key);
      return;
    default:
      throw new Error(`Unsupported Butler tune key: ${key}`);
  }
}

export function butlerTune(input: {
  stateManager: ButlerStateManager;
  config: ButlerConfig;
  action: 'get' | 'set';
  key?: string;
  value?: unknown;
}): ButlerTuneResult {
  if (input.action === 'get') {
    return { action: 'get', config: cloneConfig(input.config) };
  }
  if (!input.key || !SETTABLE_KEYS.has(input.key)) {
    throw new Error('Invalid Butler tune key.');
  }
  applyUpdate(input.stateManager, input.config, input.key, input.value);
  return {
    action: 'set',
    config: cloneConfig(input.config),
    updated: { key: input.key, value: input.value },
  };
}

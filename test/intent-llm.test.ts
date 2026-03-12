import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { initializeEverMemory } from '../src/index.js';
import { createTempDbPath } from './helpers.js';

test('intent service can enrich heuristic output through optional LLM analyzer', () => {
  const databasePath = createTempDbPath('intent-llm-enrich');
  const app = initializeEverMemory(
    {
      databasePath,
      intent: {
        useLLM: true,
        fallbackHeuristics: true,
      },
    },
    {
      intentLLMAnalyzer: () => JSON.stringify({
        intentType: 'planning',
        confidence: 0.99,
        signals: {
          memoryNeed: 'deep',
          actionNeed: 'analysis',
          urgency: 'medium',
        },
        retrievalHints: {
          preferredTypes: ['project', 'task'],
          preferredScopes: ['project', 'user'],
          preferredTimeBias: 'durable',
        },
      }),
    },
  );

  const intent = app.analyzeIntent({
    text: '帮我看一下。',
    sessionId: 's-llm-1',
    scope: { userId: 'u-1', project: 'evermemory' },
  });

  assert.equal(intent.intent.type, 'planning');
  assert.equal(intent.signals.memoryNeed, 'deep');
  assert.equal(intent.retrievalHints.preferredTimeBias, 'durable');
  assert.ok(intent.retrievalHints.preferredTypes.includes('project'));

  const enrichedEvents = app.debugRepo.listRecent('intent_enriched', 20);
  assert.ok(enrichedEvents.length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('intent service falls back to heuristics when LLM output is invalid JSON', () => {
  const databasePath = createTempDbPath('intent-llm-fallback');
  const app = initializeEverMemory(
    {
      databasePath,
      intent: {
        useLLM: true,
        fallbackHeuristics: true,
      },
    },
    {
      intentLLMAnalyzer: () => 'not-json',
    },
  );

  const intent = app.analyzeIntent({
    text: '更正一下，不是 A，改成 B。',
    sessionId: 's-llm-2',
  });

  assert.equal(intent.intent.type, 'correction');
  assert.equal(intent.signals.memoryNeed, 'targeted');

  const failedEvents = app.debugRepo.listRecent('intent_enrich_failed', 20);
  assert.ok(failedEvents.length >= 1);

  app.database.connection.close();
  rmSync(databasePath, { force: true });
});

test('intent service falls back when LLM output is null or truncated', () => {
  const nullDbPath = createTempDbPath('intent-llm-null');
  const nullApp = initializeEverMemory(
    {
      databasePath: nullDbPath,
      intent: {
        useLLM: true,
        fallbackHeuristics: true,
      },
    },
    {
      intentLLMAnalyzer: () => null,
    },
  );

  const nullResult = nullApp.analyzeIntent({
    text: '更正一下，先确认后执行。',
    sessionId: 's-llm-null',
  });
  assert.equal(nullResult.intent.type, 'correction');
  assert.equal(nullResult.signals.memoryNeed, 'targeted');
  assert.ok(nullApp.debugRepo.listRecent('intent_enrich_failed', 10).length >= 1);

  nullApp.database.connection.close();
  rmSync(nullDbPath, { force: true });

  const truncatedDbPath = createTempDbPath('intent-llm-truncated');
  const truncatedApp = initializeEverMemory(
    {
      databasePath: truncatedDbPath,
      intent: {
        useLLM: true,
        fallbackHeuristics: true,
      },
    },
    {
      intentLLMAnalyzer: () => '{"intentType":"planning","confidence":0.9',
    },
  );

  const truncatedResult = truncatedApp.analyzeIntent({
    text: '请规划下一阶段方案。',
    sessionId: 's-llm-truncated',
  });
  assert.equal(truncatedResult.intent.type, 'planning');
  assert.ok(truncatedApp.debugRepo.listRecent('intent_enrich_failed', 10).length >= 1);

  truncatedApp.database.connection.close();
  rmSync(truncatedDbPath, { force: true });
});

test('intent service handles analyzer throw with fallback, and throws when fallback disabled', () => {
  const fallbackDbPath = createTempDbPath('intent-llm-throw-fallback');
  const fallbackApp = initializeEverMemory(
    {
      databasePath: fallbackDbPath,
      intent: {
        useLLM: true,
        fallbackHeuristics: true,
      },
    },
    {
      intentLLMAnalyzer: () => {
        throw new Error('simulated timeout');
      },
    },
  );

  const recovered = fallbackApp.analyzeIntent({
    text: '请继续推进项目。',
    sessionId: 's-llm-throw-fallback',
  });
  assert.equal(recovered.intent.type, 'planning');
  assert.ok(fallbackApp.debugRepo.listRecent('intent_enrich_failed', 10).length >= 1);

  fallbackApp.database.connection.close();
  rmSync(fallbackDbPath, { force: true });

  const strictDbPath = createTempDbPath('intent-llm-throw-strict');
  const strictApp = initializeEverMemory(
    {
      databasePath: strictDbPath,
      intent: {
        useLLM: true,
        fallbackHeuristics: false,
      },
    },
    {
      intentLLMAnalyzer: () => {
        throw new Error('simulated timeout');
      },
    },
  );

  assert.throws(
    () => strictApp.analyzeIntent({
      text: '请继续推进项目。',
      sessionId: 's-llm-throw-strict',
    }),
    /simulated timeout/,
  );

  strictApp.database.connection.close();
  rmSync(strictDbPath, { force: true });
});

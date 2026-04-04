import { Type } from '@sinclair/typebox';
import type { ButlerAgent } from '../../core/butler/agent.js';
import type { AttentionService } from '../../core/butler/attention/service.js';
import type { CommitmentWatcher } from '../../core/butler/commitments/watcher.js';
import type { CognitiveEngine } from '../../core/butler/cognition.js';
import type { ButlerGoalService } from '../../core/butler/goals/service.js';
import type { NarrativeThreadService } from '../../core/butler/narrative/service.js';
import type { ButlerStateManager } from '../../core/butler/state.js';
import type { StrategicOverlayGenerator } from '../../core/butler/strategy/overlay.js';
import type { TaskQueueService } from '../../core/butler/taskQueue.js';
import type { ButlerLlmClient } from '../../core/butler/llmClient.js';
import type { ButlerConfig } from '../../core/butler/types.js';
import { executeButlerAsk } from '../../tools/butlerAsk.js';
import { butlerBrief } from '../../tools/butlerBrief.js';
import { butlerStatus } from '../../tools/butlerStatus.js';
import { butlerTune } from '../../tools/butlerTune.js';
import type { OpenClawPluginApi, UnknownRecord } from '../shared.js';
import { asOptionalBoolean, asOptionalEnum, asOptionalString, parseScope, scopeSchema } from '../shared.js';

const TUNE_ACTIONS = ['get', 'set'] as const;
const TUNE_KEYS = [
  'mode',
  'cognition.dailyTokenBudget',
  'cognition.sessionTokenBudget',
  'attention.maxInsightsPerBriefing',
  'attention.minConfidence',
] as const;

export interface ButlerRegistrationContext {
  api: OpenClawPluginApi;
  agent: ButlerAgent;
  overlayGenerator: StrategicOverlayGenerator;
  narrativeService: NarrativeThreadService;
  commitmentWatcher: CommitmentWatcher;
  attentionService: AttentionService;
  goalService: ButlerGoalService;
  stateManager: ButlerStateManager;
  taskQueue: TaskQueueService;
  cognitiveEngine: CognitiveEngine;
  llmClient?: ButlerLlmClient;
  llmProbe?: () => Promise<void>;
  config: ButlerConfig;
  getActiveQuestions: () => Array<{ id: string; questionText: string; gapType: string; importance: number }>;
}

export function registerButlerTools(context: ButlerRegistrationContext): void {
  context.api.registerTool(
    () => ({
      name: 'butler_status',
      label: 'Butler Status',
      description: 'Return Butler state, active narratives, queue depth, and LLM usage.',
      parameters: Type.Object({ scope: scopeSchema }, { additionalProperties: false }),
      execute: async (_toolCallId: string, params: UnknownRecord) => {
        // Ensure LLM probe has run before reporting status
        if (context.llmProbe) {
          await context.llmProbe().catch(() => { /* probe failures are non-fatal */ });
        }
        const result = butlerStatus({
          agent: context.agent,
          narrativeService: context.narrativeService,
          taskQueue: context.taskQueue,
          cognitiveEngine: context.cognitiveEngine,
          attentionService: context.attentionService,
          goalService: context.goalService,
          llmClient: context.llmClient,
          scope: parseScope(params.scope),
        });
        return {
          content: [{
            type: 'text',
            text: `Butler mode=${result.mode}, llm=${result.llmAvailable ? 'available' : 'unavailable'}, readiness=${result.llmReadiness}, threads=${result.activeThreads.length}, pendingTasks=${result.pendingTasks}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'butler_status' },
  );

  context.api.registerTool(
    () => ({
      name: 'butler_brief',
      label: 'Butler Brief',
      description: 'Generate a Butler strategic overlay briefing for the current scope.',
      parameters: Type.Object(
        {
          scope: scopeSchema,
          includeNarratives: Type.Optional(Type.Boolean()),
          includeCommitments: Type.Optional(Type.Boolean()),
          includeGoals: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId: string, params: UnknownRecord) => {
        const result = await butlerBrief({
          agent: context.agent,
          overlayGenerator: context.overlayGenerator,
          narrativeService: context.narrativeService,
          commitmentWatcher: context.commitmentWatcher,
          attentionService: context.attentionService,
          goalService: context.goalService,
          scope: parseScope(params.scope),
          includeNarratives: asOptionalBoolean(params.includeNarratives),
          includeCommitments: asOptionalBoolean(params.includeCommitments),
          includeGoals: asOptionalBoolean(params.includeGoals),
        });
        return {
          content: [{
            type: 'text',
            text: `Butler briefing generated: mode=${result.overlay.currentMode}, confidence=${result.overlay.confidence.toFixed(2)}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'butler_brief' },
  );

  context.api.registerTool(
    (_toolContext: UnknownRecord) => ({
      name: 'butler_tune',
      label: 'Butler Tune',
      description: 'Inspect or adjust approved Butler runtime settings.',
      parameters: Type.Object(
        {
          action: Type.Union(TUNE_ACTIONS.map((value) => Type.Literal(value))),
          key: Type.Optional(Type.Union(TUNE_KEYS.map((value) => Type.Literal(value)))),
          value: Type.Optional(Type.Unknown()),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId: string, params: UnknownRecord) => {
        const result = butlerTune({
          stateManager: context.stateManager,
          config: context.config,
          action: asOptionalEnum(params.action, TUNE_ACTIONS) ?? 'get',
          key: asOptionalString(params.key),
          value: params.value,
        });
        return {
          content: [{
            type: 'text',
            text: result.updated
              ? `Butler updated ${result.updated.key}.`
              : `Butler config retrieved: mode=${result.config.mode}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'butler_tune' },
  );

  context.api.registerTool(
    () => ({
      name: 'butler_ask',
      label: 'Butler Ask',
      description: "Get Butler's proactive questions about knowledge gaps",
      parameters: Type.Object({}, { additionalProperties: false }),
      execute: async () => {
        const result = executeButlerAsk({
          getActiveQuestions: context.getActiveQuestions,
        });
        return {
          content: [{
            type: 'text',
            text: result.count === 0
              ? 'No Butler questions pending.'
              : `Butler has ${result.count} question${result.count === 1 ? '' : 's'} pending.`,
          }],
          details: result,
        };
      },
    }),
    { name: 'butler_ask' },
  );
}

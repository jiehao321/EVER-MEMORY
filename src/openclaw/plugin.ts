import { definePluginEntry } from 'openclaw/plugin-sdk/plugin-entry';
import type { OpenClawPluginServiceContext } from 'openclaw/plugin-sdk/core';
import { ButlerAgent } from '../core/butler/agent.js';
import { AttentionService } from '../core/butler/attention/service.js';
import { CommitmentWatcher } from '../core/butler/commitments/watcher.js';
import { CognitiveEngine } from '../core/butler/cognition.js';
import { ButlerGoalService } from '../core/butler/goals/service.js';
import { ButlerLlmClient } from '../core/butler/llmClient.js';
import { NarrativeThreadService } from '../core/butler/narrative/service.js';
import { ButlerStateManager } from '../core/butler/state.js';
import { StrategicOverlayGenerator } from '../core/butler/strategy/overlay.js';
import { TaskQueueService } from '../core/butler/taskQueue.js';
import type { ButlerMode } from '../core/butler/types.js';
import { WorkerThreadPool } from '../core/butler/worker/pool.js';
import { ProviderDirectLlmGateway } from './llmGateway.js';
import { PLUGIN_NAME, PLUGIN_VERSION } from '../constants.js';
import { registerHooks } from './hooks/index.js';
import { createRegistrationContext, isRecord, type OpenClawPluginApi, toErrorMessage } from './shared.js';
import { registerButlerTools } from './tools/butler.js';
import { registerBriefingTools } from './tools/briefing.js';
import { registerIOTools } from './tools/io.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerProfileTools } from './tools/profile.js';
import { embeddingManager, type EmbeddingConfig } from '../embedding/manager.js';
import { isFirstRun, runAutoSetup, writeWelcomeMemory } from '../core/setup/autoSetup.js';
import { ButlerFeedbackRepository } from '../storage/butlerFeedbackRepo.js';
import { ButlerGoalRepository } from '../storage/butlerGoalRepo.js';
import { ButlerInsightRepository } from '../storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../storage/butlerTaskRepo.js';
import { LlmInvocationRepo } from '../storage/llmInvocationRepo.js';
import { NarrativeRepository } from '../storage/narrativeRepo.js';
import { registerButlerReviewTool } from './tools/butlerReview.js';

export default definePluginEntry({
  id: PLUGIN_NAME,
  name: 'EverMemory',
  description: 'Deterministic memory plugin for OpenClaw with governed write/recall behavior',
  kind: 'memory' as const,
  register(api: OpenClawPluginApi) {
    const context = createRegistrationContext(api);
    const butlerEnabled = !isRecord(api.pluginConfig?.butler) || api.pluginConfig?.butler?.enabled !== false;
    const rawButlerConfig = context.evermemory.config.butler;
    const db = context.evermemory.database.connection;

    // Butler starts in reduced mode; upgraded to steward if LLM probe succeeds in service start
    const effectiveButlerMode: ButlerMode = 'reduced';
    const butlerConfig = rawButlerConfig ? { ...rawButlerConfig, mode: effectiveButlerMode } : rawButlerConfig;

    const butler = butlerEnabled && butlerConfig
        ? (() => {
          const insightRepo = new ButlerInsightRepository(db);
          const feedbackRepo = new ButlerFeedbackRepository(db);
          const goalRepo = new ButlerGoalRepository(db);
          const stateManager = new ButlerStateManager({
            stateRepo: new ButlerStateRepository(db),
            logger: api.logger,
          });

          // Force persisted state to reduced mode if it was previously steward
          if (stateManager.getMode() !== effectiveButlerMode) {
            stateManager.setMode(effectiveButlerMode);
          }

          const taskQueue = new TaskQueueService({
            taskRepo: new ButlerTaskRepository(db),
            logger: api.logger,
          });

          // Build LLM gateway using pi-ai complete() with auth from runtime.modelAuth
          const runtimeModelAuth = api.runtime?.modelAuth;
          const runtimeAgentDefaults = api.runtime?.agent?.defaults;
          const hasModelAuth = runtimeModelAuth !== undefined && runtimeAgentDefaults !== undefined;
          const llmGateway: ProviderDirectLlmGateway | undefined = hasModelAuth
            ? buildPiAiGateway(api)
            : undefined;

          const llmClient = new ButlerLlmClient({
            gateway: llmGateway,
            logger: api.logger,
          });

          const cognitiveEngine = new CognitiveEngine({
            llmClient,
            invocationRepo: new LlmInvocationRepo(db),
            config: butlerConfig.cognition,
            logger: api.logger,
          });
          const workerPool = butlerConfig.workers?.enabled
            ? new WorkerThreadPool(
                new URL('../core/butler/worker/runner.js', import.meta.url).pathname,
                {
                  maxWorkers: butlerConfig.workers.maxWorkers,
                  taskTimeoutMs: butlerConfig.workers.taskTimeoutMs,
                },
              )
            : undefined;
          const overlayGenerator = new StrategicOverlayGenerator({
            cognitiveEngine,
            insightRepo,
            logger: api.logger,
          });
          const goalService = new ButlerGoalService({
            goalRepo,
            insightRepo,
            logger: api.logger,
          });
          const narrativeService = new NarrativeThreadService({
            narrativeRepo: new NarrativeRepository(db),
            cognitiveEngine,
            logger: api.logger,
          });
          const commitmentWatcher = new CommitmentWatcher({
            memoryRepo: context.evermemory.memoryRepo,
            insightRepo,
            cognitiveEngine,
            logger: api.logger,
          });
          return {
            agent: new ButlerAgent({
              stateManager,
              taskQueue,
              cognitiveEngine,
              insightRepo,
              goalService,
              workerPool,
              narrativeService,
              commitmentWatcher,
              logger: api.logger,
            }),
            workerPool,
            overlayGenerator,
            narrativeService,
            commitmentWatcher,
            attentionService: new AttentionService({
              insightRepo,
              feedbackRepo,
              config: butlerConfig.attention,
              logger: api.logger,
            }),
            goalService,
            feedbackRepo,
            insightRepo,
            stateManager,
            taskQueue,
            cognitiveEngine,
            llmClient,
            llmGateway,
            config: butlerConfig,
          };
        })()
      : undefined;
    const originalSessionStart = context.evermemory.sessionStart.bind(context.evermemory);

    context.evermemory.sessionStart = (input) => {
      const result = originalSessionStart(input);
      if (!isFirstRun(context.evermemory.memoryRepo)) {
        return result;
      }

      const welcomeResult = writeWelcomeMemory(context.evermemory.memoryService, result.scope);
      if (!welcomeResult.accepted) {
        api.logger.warn(`[EverMemory] Failed to write welcome memory: ${welcomeResult.reason}`);
      }

      result.briefing.sections.identity = [
        ...result.briefing.sections.identity,
        'Welcome to EverMemory. I saved a starter memory and you can begin with evermemory_store, evermemory_recall, evermemory_rules, or profile_onboard. / 欢迎使用 EverMemory。系统已写入欢迎记忆，你可以从 evermemory_store、evermemory_recall、evermemory_rules 或 profile_onboard 开始。',
      ];
      return result;
    };

    // Lazy LLM probe — runs once on first session_start, upgrades Butler to steward mode if successful
    const llmProbe = butler
      ? (() => {
          let probed = false;
          return async () => {
            if (probed) return;
            probed = true;
            try {
              const probeResult = await butler.llmClient.invoke({
                purpose: 'auth-probe',
                caller: { pluginId: 'evermemory', component: 'butler-init' },
                messages: [{ role: 'user', content: 'ping' }],
                budget: { maxOutputTokens: 1 },
                timeoutMs: 5000,
                privacy: { level: 'cloud_allowed' },
              });
              if (probeResult.provider !== 'unavailable' && probeResult.provider !== 'error') {
                butler.stateManager.setMode('steward');
                api.logger.info(`[EverMemory] Butler upgraded to steward mode (provider: ${probeResult.provider})`);
              } else {
                api.logger.info('[EverMemory] Butler staying in reduced mode (LLM not available)');
              }
            } catch (probeError: unknown) {
              api.logger.info(`[EverMemory] Butler staying in reduced mode (LLM probe failed: ${probeError instanceof Error ? probeError.message : String(probeError)})`);
            }
          };
        })()
      : undefined;

    registerHooks(
      context,
      butler
        ? {
            agent: butler.agent,
            overlayGenerator: butler.overlayGenerator,
            attentionService: butler.attentionService,
            goalService: butler.goalService,
            llmProbe,
          }
        : undefined,
    );
    registerMemoryTools(context);
    registerBriefingTools(context);
    registerProfileTools(context);
    registerIOTools(context);
    if (butler) {
      registerButlerTools({
        api,
        agent: butler.agent,
        overlayGenerator: butler.overlayGenerator,
        narrativeService: butler.narrativeService,
        commitmentWatcher: butler.commitmentWatcher,
        attentionService: butler.attentionService,
        goalService: butler.goalService,
        stateManager: butler.stateManager,
        taskQueue: butler.taskQueue,
        cognitiveEngine: butler.cognitiveEngine,
        llmClient: butler.llmClient,
        llmProbe,
        config: butler.config,
      });
      registerButlerReviewTool({
        api,
        feedbackRepo: butler.feedbackRepo,
        insightRepo: butler.insightRepo,
        attentionService: butler.attentionService,
        stateManager: butler.stateManager,
      });
    }

    // Register memory prompt section for SDK host
    api.registerMemoryPromptSection(({ availableTools, citationsMode }) => {
      const lines: string[] = [
        '## Memory (EverMemory)',
        'EverMemory provides deterministic, governed memory with knowledge graph, semantic search, and behavior rules.',
        '',
        'Key behaviors:',
        '- Store important facts, preferences, and decisions for long-term recall.',
        '- Recall relevant memories before answering questions that depend on prior context.',
        '- Follow governance rules registered via evermemory_rules.',
      ];

      if (citationsMode === 'on' || citationsMode === 'auto') {
        lines.push('- When citing recalled memories, include the memory ID as attribution.');
      }

      const toolGuide: Record<string, string> = {
        evermemory_store: 'evermemory_store — save facts, preferences, decisions, or commitments',
        evermemory_recall: 'evermemory_recall — retrieve relevant memories by query',
        evermemory_edit: 'evermemory_edit — update, correct, or delete a stored memory',
        evermemory_browse: 'evermemory_browse — browse and filter memories with sorting',
        evermemory_relations: 'evermemory_relations — manage knowledge graph relations between memories',
        evermemory_review: 'evermemory_review — review stored memories for quality',
        evermemory_restore: 'evermemory_restore — restore archived or deleted memories',
        evermemory_rules: 'evermemory_rules — view, add, or rollback behavior governance rules',
        evermemory_status: 'evermemory_status — check system health, stats, and at-risk memories',
        evermemory_briefing: 'evermemory_briefing — generate session briefing',
        evermemory_explain: 'evermemory_explain — explain how a recall result was scored',
        evermemory_profile: 'evermemory_profile — view or update user profile',
        evermemory_intent: 'evermemory_intent — classify user intent',
        evermemory_reflect: 'evermemory_reflect — trigger reflection on recent interactions',
        evermemory_consolidate: 'evermemory_consolidate — compress and consolidate old memories',
        profile_onboard: 'profile_onboard — first-time user onboarding',
        evermemory_export: 'evermemory_export — export memories to JSON',
        evermemory_import: 'evermemory_import — import memories from JSON',
        butler_status: 'butler_status — Butler agent state, LLM readiness, and usage',
        butler_brief: 'butler_brief — executive briefing with strategic overlay',
        butler_tune: 'butler_tune — adjust Butler runtime config',
        butler_review: 'butler_review — review and rate Butler suggestions',
      };

      lines.push('', 'Available tools:');
      for (const [tool, desc] of Object.entries(toolGuide)) {
        if (availableTools.has(tool)) {
          lines.push(`- ${desc}`);
        }
      }
      return lines;
    });

    api.registerService({
      id: PLUGIN_NAME,
      start: async (_ctx: OpenClawPluginServiceContext) => {
        const provider = (process.env.EVERMEMORY_EMBEDDING_PROVIDER ?? 'local') as EmbeddingConfig['provider'];
        if (process.env.EVERMEMORY_EMBEDDING_PROVIDER === undefined) {
          api.logger.info('[EverMemory] Using local embedding provider (default)');
        } else {
          api.logger.info(`[EverMemory] Embedding provider: ${provider}`);
        }
        const status = context.evermemory.evermemoryStatus();
        api.logger.info(
          `${PLUGIN_NAME}@${PLUGIN_VERSION}: initialized (db=${status.databasePath}, memory=${status.memoryCount})`,
        );
        if (status.profileCount === 0) {
          api.logger.info('[EverMemory] No stored profiles detected. Run profile_onboard to initialize the first user profile.');
        }
        try {
          await embeddingManager.embed('EverMemory startup diagnostic');
        } catch {
          // Diagnostics stay best-effort; startup must continue.
        }
        if (butler) {
          // Probe LLM availability via shared lazy probe (idempotent — also triggered by session_start hook)
          if (llmProbe) {
            await llmProbe().catch((error: unknown) => {
              api.logger.info(`[EverMemory] Butler LLM probe failed in service start: ${error instanceof Error ? error.message : String(error)}`);
            });
          }

          await butler.agent.runCycle({ type: 'service_started' }).catch((error: unknown) => {
            api.logger.warn(`[EverMemory] Butler startup cycle failed: ${toErrorMessage(error)}`);
          });
        }
        const setup = await runAutoSetup(context.evermemory.memoryRepo, embeddingManager);
        api.logger.info(`[EverMemory] Ready. memories=${setup.memoryCount}, embedding=${setup.embeddingProvider}`);
        if (setup.isFirstRun) {
          api.logger.info("[EverMemory] First run detected. Run 'profile_onboard' to get started.");
        }
        for (const warning of setup.warnings) {
          api.logger.warn(`[EverMemory] ${warning}`);
        }
      },
      stop: async (_ctx: OpenClawPluginServiceContext) => {
        // A4c: Dispose embedding resources before closing DB
        if (butler) {
          await butler.workerPool?.terminate().catch((err: unknown) => {
            api.logger.warn(`${PLUGIN_NAME}: worker pool terminate failed: ${toErrorMessage(err)}`);
          });
        }
        await embeddingManager.dispose().catch((error: unknown) => {
          api.logger.warn(`${PLUGIN_NAME}: failed to dispose embedding manager: ${toErrorMessage(error)}`);
        });
        try {
          await context.evermemory.dispose();
          api.logger.info(`${PLUGIN_NAME}: stopped`);
        } catch (error) {
          api.logger.warn(`${PLUGIN_NAME}: failed to close database on stop: ${toErrorMessage(error)}`);
        }
      },
    });
  },
});

function resolveModelTiers(
  pluginConfig: unknown,
): Record<string, { provider: string; model: string }> | undefined {
  if (!isRecord(pluginConfig)) return undefined;
  const butler = pluginConfig.butler;
  if (!isRecord(butler)) return undefined;
  const cognition = butler.cognition;
  if (!isRecord(cognition)) return undefined;
  const tiers = cognition.modelTiers;
  if (!isRecord(tiers)) return undefined;

  const result: Record<string, { provider: string; model: string }> = {};
  for (const tier of ['cheap', 'balanced', 'strong'] as const) {
    const entry = tiers[tier];
    if (isRecord(entry) && typeof entry.provider === 'string' && typeof entry.model === 'string') {
      result[tier] = { provider: entry.provider, model: entry.model };
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Build the pi-ai-backed LLM gateway.
 * Returns a ProviderDirectLlmGateway that lazily imports pi-ai on first invoke.
 * pi-ai and openclaw are runtime deps of the host process — always available when runtime.modelAuth exists.
 */
function buildPiAiGateway(api: OpenClawPluginApi): ProviderDirectLlmGateway {
  // Lazy-loaded pi-ai functions — resolved on first call
  let piAiLoaded: {
    getModel: (provider: string, modelId: string) => unknown;
    complete: (model: unknown, context: unknown, options?: unknown) => Promise<unknown>;
    applyAuth: (model: unknown, auth: unknown) => unknown;
  } | undefined;

  async function ensurePiAi() {
    if (piAiLoaded) return piAiLoaded;
    const piAi = await import('@mariozechner/pi-ai');
    let applyAuthFn: (model: unknown, auth: unknown) => unknown = (m) => m;
    try {
      const modelAuthModule = await import(
        // @ts-expect-error — internal openclaw module, not typed in our project
        'openclaw/plugin-sdk/src/agents/model-auth.js'
      ) as { applyLocalNoAuthHeaderOverride: (model: unknown, auth: unknown) => unknown };
      applyAuthFn = modelAuthModule.applyLocalNoAuthHeaderOverride;
    } catch {
      // Fallback: manually apply auth headers based on token type
      applyAuthFn = (model: unknown, auth: unknown) => {
        const m = model as Record<string, unknown>;
        const a = auth as { apiKey?: string; mode?: string };
        if (!a.apiKey) return model;
        const headers = (m.headers ?? {}) as Record<string, string>;
        if (a.mode === 'token' || (a.apiKey.startsWith('sk-ant-o'))) {
          return { ...m, headers: { ...headers, authorization: `Bearer ${a.apiKey}` } };
        }
        return { ...m, headers: { ...headers, 'x-api-key': a.apiKey } };
      };
    }
    piAiLoaded = {
      getModel: piAi.getModel as unknown as (provider: string, modelId: string) => unknown,
      complete: piAi.complete as unknown as (model: unknown, context: unknown, options?: unknown) => Promise<unknown>,
      applyAuth: applyAuthFn,
    };
    return piAiLoaded!;
  }

  return new ProviderDirectLlmGateway({
    resolveApiKey: async (provider) => {
      // Eagerly load pi-ai on first resolveApiKey call (before getModel/applyAuth which are sync)
      await ensurePiAi();
      return api.runtime.modelAuth.resolveApiKeyForProvider({ provider });
    },
    applyAuth: (model, auth) => {
      if (!piAiLoaded) return model;
      return piAiLoaded.applyAuth(model, auth) as typeof model;
    },
    getModel: (provider, modelId) => {
      if (!piAiLoaded) return undefined;
      try {
        return piAiLoaded.getModel(provider, modelId) as import('./llmGateway.js').PiAiModel;
      } catch {
        return undefined;
      }
    },
    complete: async (model, context, options) => {
      const loaded = (await ensurePiAi())!;
      return loaded.complete(model, context, options) as Promise<import('./llmGateway.js').PiAiAssistantMessage>;
    },
    defaultProvider: api.runtime.agent.defaults.provider,
    defaultModel: api.runtime.agent.defaults.model,
    modelTiers: resolveModelTiers(api.pluginConfig),
    logger: api.logger,
  });
}

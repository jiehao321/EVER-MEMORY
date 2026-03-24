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

    // Butler always runs in reduced mode under SDK host (no LLM gateway available)
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
          const cognitiveEngine = new CognitiveEngine({
            llmClient: new ButlerLlmClient({ gateway: undefined, logger: api.logger }),
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
          return {
            agent: new ButlerAgent({
              stateManager,
              taskQueue,
              cognitiveEngine,
              insightRepo,
              goalService,
              workerPool,
              logger: api.logger,
            }),
            workerPool,
            overlayGenerator,
            narrativeService: new NarrativeThreadService({
              narrativeRepo: new NarrativeRepository(db),
              cognitiveEngine,
              logger: api.logger,
            }),
            commitmentWatcher: new CommitmentWatcher({
              memoryRepo: context.evermemory.memoryRepo,
              insightRepo,
              cognitiveEngine,
              logger: api.logger,
            }),
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

    registerHooks(
      context,
      butler
        ? {
            agent: butler.agent,
            overlayGenerator: butler.overlayGenerator,
            attentionService: butler.attentionService,
            goalService: butler.goalService,
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
        butler_status: 'butler_status — Butler agent state and usage (reduced mode)',
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
          api.logger.info('[EverMemory] Butler running in reduced mode (heuristics only — LLM gateway not available in current SDK)');
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

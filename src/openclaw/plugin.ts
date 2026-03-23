import { ButlerAgent } from '../core/butler/agent.js';
import { AttentionService } from '../core/butler/attention/service.js';
import { CommitmentWatcher } from '../core/butler/commitments/watcher.js';
import { CognitiveEngine } from '../core/butler/cognition.js';
import { ButlerLlmClient } from '../core/butler/llmClient.js';
import { NarrativeThreadService } from '../core/butler/narrative/service.js';
import { ButlerStateManager } from '../core/butler/state.js';
import { StrategicOverlayGenerator } from '../core/butler/strategy/overlay.js';
import { TaskQueueService } from '../core/butler/taskQueue.js';
import { PLUGIN_NAME, PLUGIN_VERSION } from '../constants.js';
import { registerHooks } from './hooks/index.js';
import { createRegistrationContext, isRecord, type OpenClawApi, toErrorMessage } from './shared.js';
import { registerButlerTools } from './tools/butler.js';
import { registerBriefingTools } from './tools/briefing.js';
import { registerIOTools } from './tools/io.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerProfileTools } from './tools/profile.js';
import { embeddingManager, type EmbeddingConfig } from '../embedding/manager.js';
import { isFirstRun, runAutoSetup, writeWelcomeMemory } from '../core/setup/autoSetup.js';
import { ButlerInsightRepository } from '../storage/butlerInsightRepo.js';
import { ButlerStateRepository } from '../storage/butlerStateRepo.js';
import { ButlerTaskRepository } from '../storage/butlerTaskRepo.js';
import { LlmInvocationRepo } from '../storage/llmInvocationRepo.js';
import { NarrativeRepository } from '../storage/narrativeRepo.js';

const memoryPlugin = {
  id: PLUGIN_NAME,
  name: 'EverMemory',
  description: 'Deterministic memory plugin for OpenClaw',
  version: PLUGIN_VERSION,
  kind: 'memory' as const,
  register(api: OpenClawApi) {
    const context = createRegistrationContext(api);
    const butlerEnabled = !isRecord(api.pluginConfig?.butler) || api.pluginConfig?.butler?.enabled !== false;
    const butlerConfig = context.evermemory.config.butler;
    const db = context.evermemory.database.connection;
    const butler = butlerEnabled && butlerConfig
      ? (() => {
          const insightRepo = new ButlerInsightRepository(db);
          const stateManager = new ButlerStateManager({
            stateRepo: new ButlerStateRepository(db),
            logger: api.logger,
          });
          const taskQueue = new TaskQueueService({
            taskRepo: new ButlerTaskRepository(db),
            logger: api.logger,
          });
          const cognitiveEngine = new CognitiveEngine({
            llmClient: new ButlerLlmClient({ gateway: api.llm, logger: api.logger }),
            invocationRepo: new LlmInvocationRepo(db),
            config: butlerConfig.cognition,
            logger: api.logger,
          });
          const overlayGenerator = new StrategicOverlayGenerator({
            cognitiveEngine,
            insightRepo,
            logger: api.logger,
          });
          return {
            agent: new ButlerAgent({
              stateManager,
              taskQueue,
              cognitiveEngine,
              insightRepo,
              logger: api.logger,
            }),
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
              config: butlerConfig.attention,
              logger: api.logger,
            }),
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
        stateManager: butler.stateManager,
        taskQueue: butler.taskQueue,
        cognitiveEngine: butler.cognitiveEngine,
        config: butler.config,
      });
    }

    api.registerService({
      id: PLUGIN_NAME,
      start: async () => {
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
      stop: async () => {
        // A4c: Dispose embedding resources before closing DB
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
};

export default memoryPlugin;

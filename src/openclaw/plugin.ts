import { PLUGIN_NAME, PLUGIN_VERSION } from '../constants.js';
import { registerHooks } from './hooks/index.js';
import { createRegistrationContext, type OpenClawApi, toErrorMessage } from './shared.js';
import { registerBriefingTools } from './tools/briefing.js';
import { registerIOTools } from './tools/io.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerProfileTools } from './tools/profile.js';
import { embeddingManager, type EmbeddingConfig } from '../embedding/manager.js';
import { runAutoSetup } from '../core/setup/autoSetup.js';

const memoryPlugin = {
  id: PLUGIN_NAME,
  name: 'EverMemory',
  description: 'Deterministic memory plugin for OpenClaw',
  version: PLUGIN_VERSION,
  kind: 'memory' as const,
  register(api: OpenClawApi) {
    const context = createRegistrationContext(api);

    registerHooks(context);
    registerMemoryTools(context);
    registerBriefingTools(context);
    registerProfileTools(context);
    registerIOTools(context);

    api.registerService({
      id: PLUGIN_NAME,
      start: async () => {
        const provider = (process.env.EVERMEMORY_EMBEDDING_PROVIDER ?? 'local') as EmbeddingConfig['provider'];
        embeddingManager.configure({ provider });
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
        const setup = await runAutoSetup(context.evermemory.memoryRepo, embeddingManager);
        api.logger.info(`[EverMemory] Ready. memories=${setup.memoryCount}, embedding=${setup.embeddingProvider}`);
        if (setup.isFirstRun) {
          api.logger.info("[EverMemory] First run detected. Run 'profile_onboard' to get started.");
        }
        for (const warning of setup.warnings) {
          api.logger.warn(`[EverMemory] ${warning}`);
        }
      },
      stop: () => {
        try {
          context.evermemory.database.connection.close();
          api.logger.info(`${PLUGIN_NAME}: stopped`);
        } catch (error) {
          api.logger.warn(`${PLUGIN_NAME}: failed to close database on stop: ${toErrorMessage(error)}`);
        }
      },
    });
  },
};

export default memoryPlugin;

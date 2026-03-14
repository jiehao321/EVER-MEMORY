import { PLUGIN_NAME, PLUGIN_VERSION } from '../constants.js';
import { registerHooks } from './hooks/index.js';
import { createRegistrationContext, type OpenClawApi, toErrorMessage } from './shared.js';
import { registerBriefingTools } from './tools/briefing.js';
import { registerIOTools } from './tools/io.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerProfileTools } from './tools/profile.js';
import { embeddingManager, type EmbeddingConfig } from '../embedding/manager.js';

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
      start: () => {
        const provider = (process.env.EVERMEMORY_EMBEDDING_PROVIDER ?? 'none') as EmbeddingConfig['provider'];
        embeddingManager.configure({ provider });
        if (provider === 'none') {
          api.logger.info('[EverMemory] Embedding provider not configured. Set EVERMEMORY_EMBEDDING_PROVIDER=local for semantic search.');
        } else {
          api.logger.info(`[EverMemory] Embedding provider: ${provider}`);
        }
        const status = context.evermemory.evermemoryStatus();
        api.logger.info(
          `${PLUGIN_NAME}@${PLUGIN_VERSION}: initialized (db=${status.databasePath}, memory=${status.memoryCount})`,
        );
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

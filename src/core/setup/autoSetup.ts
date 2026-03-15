import type { EmbeddingProviderKind } from '../../embedding/provider.js';

export interface SetupDiagnostic {
  readonly embeddingProvider: 'local' | 'openai' | 'noop' | 'failed';
  readonly databaseReady: boolean;
  readonly memoryCount: number;
  readonly isFirstRun: boolean;
  readonly warnings: readonly string[];
  readonly suggestions: readonly string[];
}

export interface MemoryRepo {
  count: () => number;
}

export interface EmbeddingManagerInterface {
  isReady(): boolean;
  readonly providerKind: EmbeddingProviderKind;
}

function mapProvider(kind: EmbeddingProviderKind): SetupDiagnostic['embeddingProvider'] {
  switch (kind) {
    case 'local':
      return 'local';
    case 'openai':
      return 'openai';
    default:
      return 'noop';
  }
}

export async function runAutoSetup(
  memoryRepo: MemoryRepo,
  embeddingManager: EmbeddingManagerInterface,
): Promise<SetupDiagnostic> {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  try {
    const embeddingProvider = mapProvider(embeddingManager.providerKind);
    if (!embeddingManager.isReady()) {
      warnings.push(`Embedding provider not ready: ${embeddingProvider}`);
    }

    let memoryCount = 0;
    let databaseReady = false;

    try {
      memoryCount = memoryRepo.count();
      databaseReady = true;
    } catch (error) {
      warnings.push(`Database check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    const isFirstRun = memoryCount === 0;
    if (isFirstRun) {
      suggestions.push('运行 profile_onboard 开始个性化配置');
    }
    if (embeddingProvider === 'noop') {
      suggestions.push('安装 @xenova/transformers 以启用语义搜索');
    }
    if (memoryCount > 200) {
      suggestions.push('建议运行 housekeeping 整理记忆');
    }

    return {
      embeddingProvider,
      databaseReady,
      memoryCount,
      isFirstRun,
      warnings,
      suggestions,
    };
  } catch (error) {
    return {
      embeddingProvider: 'failed',
      databaseReady: false,
      memoryCount: 0,
      isFirstRun: true,
      warnings: [`Auto setup failed: ${error instanceof Error ? error.message : String(error)}`],
      suggestions: ['运行 profile_onboard 开始个性化配置'],
    };
  }
}

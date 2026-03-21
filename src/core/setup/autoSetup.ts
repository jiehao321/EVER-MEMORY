import type { EmbeddingProviderKind } from '../../embedding/provider.js';
import type { MemoryScope, MemoryStoreResult } from '../../types.js';

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

export interface MemoryServiceLike {
  store: (
    input: {
      content: string;
      type: 'identity';
      lifecycle: 'semantic';
      source: {
        kind: 'manual';
        actor: 'system';
      };
      importance: number;
      tags: string[];
      scope?: MemoryScope;
    },
    fallbackScope?: MemoryScope,
  ) => MemoryStoreResult;
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

export function isFirstRun(memoryRepo: MemoryRepo): boolean {
  return memoryRepo.count() === 0;
}

export function writeWelcomeMemory(
  memoryService: MemoryServiceLike,
  scope: MemoryScope,
): MemoryStoreResult {
  return memoryService.store(
    {
      content: [
        'Welcome to EverMemory! I am your intelligent memory assistant.',
        'I can store important information (evermemory_store), recall past context (evermemory_recall), track behavior rules (evermemory_rules), and build your profile over time.',
        'Ask me anything about what I remember!',
        '',
        '欢迎使用 EverMemory！我是你的智能记忆助手。',
        '我可以存储重要信息（evermemory_store）、回忆过往上下文（evermemory_recall）、跟踪行为规则（evermemory_rules），并随着时间推移构建你的用户画像。',
        '你可以随时问我“你记得什么？”',
      ].join(' '),
      type: 'identity',
      lifecycle: 'semantic',
      source: {
        kind: 'manual',
        actor: 'system',
      },
      importance: 0.9,
      tags: ['system', 'welcome'],
      scope,
    },
    scope,
  );
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

    const firstRun = memoryCount === 0;
    if (firstRun) {
      suggestions.push('运行 profile_onboard 开始个性化配置');
    }
    if (embeddingProvider === 'noop') {
      suggestions.push('重新安装 @xenova/transformers 以恢复默认语义搜索');
    }
    if (memoryCount > 200) {
      suggestions.push('建议运行 housekeeping 整理记忆');
    }

    return {
      embeddingProvider,
      databaseReady,
      memoryCount,
      isFirstRun: firstRun,
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

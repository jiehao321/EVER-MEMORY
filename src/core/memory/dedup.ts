import { embeddingManager } from '../../embedding/manager.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';

export interface DedupResult {
  readonly isDuplicate: boolean;
  readonly existingId?: string;
  readonly similarity?: number;
}

export interface DedupConfig {
  readonly threshold: number;
  readonly enabled: boolean;
}

const NO_DUPLICATE: DedupResult = { isDuplicate: false };

export async function checkSemanticDuplicate(
  content: string,
  _kind: string,
  semanticRepo: SemanticRepository,
  config: DedupConfig,
): Promise<DedupResult> {
  if (!config.enabled || !embeddingManager.isReady()) {
    return NO_DUPLICATE;
  }

  const vector = await embeddingManager.embed(content);
  if (!vector) {
    return NO_DUPLICATE;
  }

  const results = await semanticRepo.searchByCosine(vector.values, 3, config.threshold);
  const match = results[0];
  if (!match || match.score < config.threshold) {
    return NO_DUPLICATE;
  }

  return {
    isDuplicate: true,
    existingId: match.memoryId,
    similarity: match.score,
  };
}

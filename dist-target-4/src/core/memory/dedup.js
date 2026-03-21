import { embeddingManager } from '../../embedding/manager.js';
const NO_DUPLICATE = { isDuplicate: false };
export async function checkSemanticDuplicate(content, _kind, semanticRepo, config) {
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

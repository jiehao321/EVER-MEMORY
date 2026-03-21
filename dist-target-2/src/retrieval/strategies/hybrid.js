import { embeddingManager } from '../../embedding/manager.js';
import { rankKeywordRecall } from './keyword.js';
export class HybridRetrievalStrategy {
    support;
    semanticRepo;
    semanticEnabled;
    semanticCandidateLimit;
    semanticMinScore;
    keywordWeights;
    hybridWeights;
    constructor(support, semanticRepo, semanticEnabled, semanticCandidateLimit, semanticMinScore, keywordWeights, hybridWeights) {
        this.support = support;
        this.semanticRepo = semanticRepo;
        this.semanticEnabled = semanticEnabled;
        this.semanticCandidateLimit = semanticCandidateLimit;
        this.semanticMinScore = semanticMinScore;
        this.keywordWeights = keywordWeights;
        this.hybridWeights = hybridWeights;
    }
    async rank(request, limit, meta) {
        const embeddingCheck = this.canUseEmbedding(request);
        if (!embeddingCheck.canUse) {
            const result = this.rankLexical(request, limit, meta);
            return { ...result, degradationReason: embeddingCheck.reason };
        }
        try {
            return await this.rankWithEmbeddings(request, limit, meta);
        }
        catch (error) {
            return {
                ...this.rankLexical(request, limit, meta),
                degradationReason: getDegradationReason(error),
            };
        }
    }
    canUseEmbedding(request) {
        if (!this.semanticEnabled || !this.semanticRepo) {
            return { canUse: false, reason: 'semantic_disabled' };
        }
        if (!embeddingManager.isReady()) {
            return { canUse: false, reason: 'embedding_not_ready' };
        }
        if (request.query.trim().length === 0) {
            return { canUse: false, reason: 'empty_query' };
        }
        return { canUse: true };
    }
    prepareRankingContext(request, limit, meta) {
        const loaded = this.support.loadCandidates(request, limit, false, meta);
        const candidateResult = this.support.applyCandidatePolicy(loaded, limit, meta);
        const candidates = candidateResult.candidates;
        const candidateMap = new Map(candidates.map((item) => [item.id, item]));
        const keywordRanked = rankKeywordRecall(candidates, request, { weights: this.keywordWeights });
        const baseRanked = rankKeywordRecall(candidates, { ...request, query: '' }, { weights: this.keywordWeights });
        const keywordScoreById = new Map(keywordRanked.map((entry) => [entry.memory.id, entry.score]));
        const baseScoreById = new Map(baseRanked.map((entry) => [entry.memory.id, entry.score]));
        const maxKeywordScore = keywordRanked[0]?.score && keywordRanked[0].score > 0 ? keywordRanked[0].score : 1;
        const maxBaseScore = baseRanked[0]?.score && baseRanked[0].score > 0 ? baseRanked[0].score : 1;
        return {
            candidateResult,
            candidates,
            candidateMap,
            keywordScoreById,
            baseScoreById,
            maxKeywordScore,
            maxBaseScore,
        };
    }
    rankLexical(request, limit, meta) {
        const context = this.prepareRankingContext(request, limit, meta);
        const semanticScoreById = new Map();
        if (this.semanticEnabled && this.semanticRepo && request.query.trim().length > 0) {
            for (const hit of this.semanticRepo.search(request.query, {
                limit: this.semanticCandidateLimit,
                candidateLimit: this.semanticCandidateLimit,
                minScore: this.semanticMinScore,
            })) {
                if (context.candidateMap.has(hit.memoryId)) {
                    semanticScoreById.set(hit.memoryId, hit.score);
                }
            }
        }
        const ranked = [];
        for (const id of new Set([
            ...context.keywordScoreById.keys(),
            ...semanticScoreById.keys(),
        ])) {
            const memory = context.candidateMap.get(id);
            if (!memory) {
                continue;
            }
            const keywordScore = (context.keywordScoreById.get(id) ?? 0) / context.maxKeywordScore;
            const semanticScore = semanticScoreById.get(id) ?? 0;
            const baseScore = (context.baseScoreById.get(id) ?? 0) / context.maxBaseScore;
            const rawHybridScore = (keywordScore * this.hybridWeights.keyword
                + semanticScore * this.hybridWeights.semantic
                + baseScore * this.hybridWeights.base);
            const policyScore = this.support.applyRecallPolicyScore(memory, rawHybridScore, meta);
            ranked.push({
                memory,
                score: policyScore.score,
                keywordScore,
                semanticScore,
                baseScore,
                projectPriority: policyScore.projectPriority,
                dataQuality: policyScore.dataQuality,
                dataClass: policyScore.dataClass,
            });
        }
        ranked.sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }
            return right.memory.timestamps.updatedAt.localeCompare(left.memory.timestamps.updatedAt);
        });
        return {
            ranked,
            candidates: context.candidates,
            semanticHitCount: semanticScoreById.size,
            candidatePolicy: context.candidateResult.stats,
        };
    }
    async rankWithEmbeddings(request, limit, meta) {
        const context = this.prepareRankingContext(request, limit, meta);
        const repo = this.semanticRepo;
        if (!repo || typeof repo.searchByCosine !== 'function') {
            return this.rankLexical(request, limit, meta);
        }
        const queryVector = await embeddingManager.embed(request.query);
        if (!queryVector || queryVector.values.length === 0) {
            return this.rankLexical(request, limit, meta);
        }
        const hits = await repo.searchByCosine(queryVector.values, Math.max(limit * 3, this.semanticCandidateLimit), 0.3);
        const semanticScoreById = new Map();
        for (const hit of hits) {
            if (!context.candidateMap.has(hit.memoryId)) {
                continue;
            }
            const existing = semanticScoreById.get(hit.memoryId) ?? 0;
            if (hit.score > existing) {
                semanticScoreById.set(hit.memoryId, hit.score);
            }
        }
        const lexicalWeight = Math.max(0, this.hybridWeights.keyword + this.hybridWeights.base);
        const semanticWeight = Math.max(0, this.hybridWeights.semantic);
        const blendDenominator = lexicalWeight + semanticWeight > 0 ? lexicalWeight + semanticWeight : 1;
        const ranked = [];
        for (const id of new Set([
            ...context.keywordScoreById.keys(),
            ...semanticScoreById.keys(),
        ])) {
            const memory = context.candidateMap.get(id);
            if (!memory) {
                continue;
            }
            const keywordScore = (context.keywordScoreById.get(id) ?? 0) / context.maxKeywordScore;
            const baseScore = (context.baseScoreById.get(id) ?? 0) / context.maxBaseScore;
            const semanticScore = semanticScoreById.get(id) ?? 0;
            const lexicalBaseScore = lexicalWeight > 0
                ? ((keywordScore * this.hybridWeights.keyword) + (baseScore * this.hybridWeights.base)) / lexicalWeight
                : 0;
            const policyScore = this.support.applyRecallPolicyScore(memory, lexicalBaseScore, meta);
            const blendedScore = ((policyScore.score * lexicalWeight)
                + (semanticScore * semanticWeight)) / blendDenominator;
            ranked.push({
                memory,
                score: blendedScore,
                keywordScore,
                semanticScore,
                baseScore,
                projectPriority: policyScore.projectPriority,
                dataQuality: policyScore.dataQuality,
                dataClass: policyScore.dataClass,
            });
        }
        ranked.sort((left, right) => {
            if (right.score !== left.score) {
                return right.score - left.score;
            }
            return right.memory.timestamps.updatedAt.localeCompare(left.memory.timestamps.updatedAt);
        });
        return {
            ranked,
            candidates: context.candidates,
            semanticHitCount: semanticScoreById.size,
            candidatePolicy: context.candidateResult.stats,
        };
    }
}
function getDegradationReason(_error) {
    return 'semantic_search_failed';
}

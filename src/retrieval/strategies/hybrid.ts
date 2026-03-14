import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type { RecallRequest, RetrievalHybridWeights, RetrievalKeywordWeights } from '../../types.js';
import { embeddingManager } from '../../embedding/manager.js';
import { rankKeywordRecall } from './keyword.js';
import type { RankedStrategyResult, RecallExecutionMeta, ScoredRecallItem } from './support.js';
import { RetrievalStrategySupport } from './policy.js';

export class HybridRetrievalStrategy {
  constructor(
    private readonly support: RetrievalStrategySupport,
    private readonly semanticRepo: SemanticRepository | undefined,
    private readonly semanticEnabled: boolean,
    private readonly semanticCandidateLimit: number,
    private readonly semanticMinScore: number,
    private readonly keywordWeights: RetrievalKeywordWeights,
    private readonly hybridWeights: RetrievalHybridWeights,
  ) {}

  async rank(
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): Promise<RankedStrategyResult> {
    if (!this.canUseEmbedding(request)) {
      return this.rankLexical(request, limit, meta);
    }

    try {
      return await this.rankWithEmbeddings(request, limit, meta);
    } catch (error) {
      return this.rankLexical(request, limit, meta);
    }
  }

  private canUseEmbedding(request: RecallRequest): boolean {
    if (!this.semanticEnabled || !this.semanticRepo) {
      return false;
    }
    if (!embeddingManager.isReady()) {
      return false;
    }
    return request.query.trim().length > 0;
  }

  private prepareRankingContext(
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ) {
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

  private rankLexical(
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): RankedStrategyResult {
    const context = this.prepareRankingContext(request, limit, meta);
    const semanticScoreById = new Map<string, number>();
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

    const ranked: ScoredRecallItem[] = [];
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
      const rawHybridScore = (
        keywordScore * this.hybridWeights.keyword
        + semanticScore * this.hybridWeights.semantic
        + baseScore * this.hybridWeights.base
      );
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

  private async rankWithEmbeddings(
    request: RecallRequest,
    limit: number,
    meta: RecallExecutionMeta,
  ): Promise<RankedStrategyResult> {
    const context = this.prepareRankingContext(request, limit, meta);
    const repo = this.semanticRepo;
    if (!repo || typeof repo.searchByCosine !== 'function') {
      return this.rankLexical(request, limit, meta);
    }

    const queryVector = await embeddingManager.embed(request.query);
    if (!queryVector || queryVector.values.length === 0) {
      return this.rankLexical(request, limit, meta);
    }

    const hits = await repo.searchByCosine(
      queryVector.values,
      Math.max(limit * 3, this.semanticCandidateLimit),
      0.3,
    );
    const semanticScoreById = new Map<string, number>();
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

    const ranked: ScoredRecallItem[] = [];
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
      const blendedScore = (
        (policyScore.score * lexicalWeight)
        + (semanticScore * semanticWeight)
      ) / blendDenominator;

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

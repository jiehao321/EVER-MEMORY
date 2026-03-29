import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { MemoryDataClass, MemoryItem, RecallRequest } from '../../types.js';
import {
  DATA_QUALITY_INFERENCE,
  DATA_QUALITY_RUNTIME,
  DATA_QUALITY_RUNTIME_LOW_VALUE,
  DATA_QUALITY_SUMMARY,
  DATA_QUALITY_TEST,
  DATA_QUALITY_UNKNOWN,
  DATA_QUALITY_UNKNOWN_LOW_VALUE,
  PROJECT_PRIORITY_COMMITMENT_NEXT_STEP,
  PROJECT_PRIORITY_CONSTRAINT,
  PROJECT_PRIORITY_DECISION,
  PROJECT_PRIORITY_DEFAULT,
  PROJECT_PRIORITY_PROJECT,
  PROJECT_PRIORITY_PROJECT_STATE,
  PROJECT_PRIORITY_SUMMARY,
  RETRIEVAL_DEFAULT_POLICY_WEIGHT_BASE,
  RETRIEVAL_DEFAULT_POLICY_WEIGHT_QUALITY,
  RETRIEVAL_PROJECT_POLICY_WEIGHT_BASE,
  RETRIEVAL_PROJECT_POLICY_WEIGHT_PROJECT,
  RETRIEVAL_PROJECT_POLICY_WEIGHT_QUALITY,
} from '../../tuning.js';
import { TEST_NOISE_PATTERNS } from '../../patterns.js';
import type { CandidatePolicyStats, RecallExecutionMeta } from './support.js';
import { buildCandidateSeedQuery } from './support.js';

const TEST_TAG_PATTERNS = [
  /(^|[-_])(e2e|smoke|fixture|test_sample|test_data|mock)([-_]|$)/i,
];

const EXTRA_TEST_CONTENT_PATTERNS = [
  /\b(smoke\s*test|test\s*sample|fixture\s*data|shared-scope\s*test)\b/i,
];

const TEST_CONTENT_NOISE_PATTERNS = [...TEST_NOISE_PATTERNS, ...EXTRA_TEST_CONTENT_PATTERNS];

const LOW_VALUE_CONTENT_PATTERNS = [
  ...TEST_NOISE_PATTERNS,
  /\b(call|调用)\s*(evermemory_store|evermemory_recall|evermemory_status)\b/i,
  /openclaw system event/i,
  /\[\[reply_to_current\]\]/i,
];

const LOW_VALUE_TAG_PATTERNS = [
  /(^|[-_])(sample|fixture|noise|boilerplate)([-_]|$)/i,
];

const RUNTIME_SOURCE_KINDS = new Set([
  'runtime_user',
  'runtime_project',
  'reflection_derived',
  'message',
  'summary',
  'inference',
]);

const RUNTIME_TAG_PREFIXES = ['auto_capture', 'project_state', 'project_continuity', 'active_project_summary', 'next_step'];

export class RetrievalStrategySupport {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly semanticCandidateLimit: number,
  ) {}

  applyRecallPolicyScore(
    memory: MemoryItem,
    baseScore: number,
    meta: RecallExecutionMeta,
  ): {
      score: number;
      projectPriority: number;
      dataQuality: number;
      dataClass: MemoryDataClass;
    } {
    const projectPriority = this.projectPriority(memory);
    const dataPolicy = this.dataQuality(memory);
    const score = meta.projectOriented
      ? (
          baseScore * RETRIEVAL_PROJECT_POLICY_WEIGHT_BASE
          + projectPriority * RETRIEVAL_PROJECT_POLICY_WEIGHT_PROJECT
          + dataPolicy.quality * RETRIEVAL_PROJECT_POLICY_WEIGHT_QUALITY
        )
      : (
          baseScore * RETRIEVAL_DEFAULT_POLICY_WEIGHT_BASE
          + dataPolicy.quality * RETRIEVAL_DEFAULT_POLICY_WEIGHT_QUALITY
        );

    return {
      score,
      projectPriority,
      dataQuality: dataPolicy.quality,
      dataClass: dataPolicy.dataClass,
    };
  }

  applyCandidatePolicy(
    candidates: MemoryItem[],
    limit: number,
    meta: RecallExecutionMeta,
  ): { candidates: MemoryItem[]; stats: CandidatePolicyStats } {
    const classCounts: Record<MemoryDataClass, number> = {
      runtime: 0,
      test: 0,
      unknown: 0,
    };
    const primaryCandidates: MemoryItem[] = [];
    const tests: MemoryItem[] = [];
    const lowValue: MemoryItem[] = [];
    const contradicted: MemoryItem[] = [];

    for (const candidate of candidates) {
      const dataClass = this.classifyMemoryData(candidate);
      classCounts[dataClass] += 1;
      if (candidate.tags.includes('contradiction_pending')) {
        contradicted.push(candidate);
      } else if (dataClass === 'test') {
        tests.push(candidate);
      } else if (this.isLowValueNoise(candidate)) {
        lowValue.push(candidate);
      } else {
        primaryCandidates.push(candidate);
      }
    }

    const lowTrustCount = this.demoteLowTrust(primaryCandidates, limit);
    const strictProjectMode = meta.projectOriented || meta.routeApplied;
    const maxLowValueCandidates = strictProjectMode
      ? (primaryCandidates.length >= Math.max(2, limit - 1) ? 0 : 1)
      : (primaryCandidates.length >= limit ? 0 : 1);
    const maxTestCandidates = strictProjectMode
      ? (primaryCandidates.length > 0 ? 0 : 1)
      : primaryCandidates.length >= limit
        ? 0
        : Math.max(1, Math.floor(limit / 2));
    const retainedLowValue = maxLowValueCandidates > 0 ? lowValue.slice(0, maxLowValueCandidates) : [];
    const retainedTests = maxTestCandidates > 0 ? tests.slice(0, maxTestCandidates) : [];
    const filteredCandidates = [...primaryCandidates, ...retainedLowValue, ...retainedTests];

    return {
      candidates: filteredCandidates,
      stats: {
        initialCandidates: candidates.length,
        filteredCandidates: filteredCandidates.length,
        suppressedTestCandidates: tests.length - retainedTests.length,
        retainedTestCandidates: retainedTests.length,
        suppressedLowValueCandidates: lowValue.length - retainedLowValue.length,
        retainedLowValueCandidates: retainedLowValue.length,
        suppressedContradictionCandidates: contradicted.length,
        demotedLowTrustCandidates: lowTrustCount,
        filterMode: strictProjectMode ? 'project_strict' : 'default',
        dataClassCounts: classCounts,
      },
    };
  }

  /**
   * Move low-trust candidates to the end so they lose priority when the
   * candidate pool already exceeds the caller's target limit.
   */
  private demoteLowTrust(primaryCandidates: MemoryItem[], limit: number): number {
    if (primaryCandidates.length <= limit) {
      return 0;
    }

    const lowTrust: MemoryItem[] = [];
    const highTrust: MemoryItem[] = [];
    for (const candidate of primaryCandidates) {
      if (candidate.sourceGrade === 'inferred' && (candidate.scores?.confidence ?? 1) < 0.5) {
        lowTrust.push(candidate);
      } else {
        highTrust.push(candidate);
      }
    }

    if (lowTrust.length === 0) {
      return 0;
    }

    primaryCandidates.length = 0;
    primaryCandidates.push(...highTrust, ...lowTrust);
    return lowTrust.length;
  }

  loadCandidates(
    request: RecallRequest,
    limit: number,
    queryEnabled: boolean,
    meta: RecallExecutionMeta,
  ): MemoryItem[] {
    const candidateLimit = queryEnabled
      ? Math.max(limit * 5, limit)
      : Math.max(limit * 8, this.semanticCandidateLimit);
    const primary = this.memoryRepo.search({
      query: queryEnabled ? buildCandidateSeedQuery(request.query) : undefined,
      scope: request.scope,
      types: request.types,
      lifecycles: request.lifecycles,
      createdAfter: request.createdAfter,
      createdBefore: request.createdBefore,
      activeOnly: true,
      archived: false,
      limit: candidateLimit,
    });

    if (!queryEnabled || primary.length > 0 || (!meta.projectOriented && !meta.routeApplied)) {
      return primary;
    }

    return this.memoryRepo.search({
      query: undefined,
      scope: request.scope,
      types: request.types,
      lifecycles: request.lifecycles,
      createdAfter: request.createdAfter,
      createdBefore: request.createdBefore,
      activeOnly: true,
      archived: false,
      limit: Math.max(limit * 8, this.semanticCandidateLimit),
    });
  }

  private classifyMemoryData(memory: MemoryItem): MemoryDataClass {
    const tags = memory.tags.map((tag) => tag.toLowerCase());
    const lowerContent = memory.content.toLowerCase();
    if (
      memory.source.kind === 'test'
      || tags.some((tag) => TEST_TAG_PATTERNS.some((pattern) => pattern.test(tag)))
      || TEST_CONTENT_NOISE_PATTERNS.some((pattern) => pattern.test(lowerContent))
    ) {
      return 'test';
    }
    if (
      RUNTIME_SOURCE_KINDS.has(memory.source.kind)
      || tags.some((tag) => RUNTIME_TAG_PREFIXES.some((prefix) => tag.includes(prefix)))
    ) {
      return 'runtime';
    }
    return 'unknown';
  }

  private isLowValueNoise(memory: MemoryItem): boolean {
    const lowerContent = memory.content.toLowerCase();
    const lowerTags = memory.tags.map((tag) => tag.toLowerCase());
    return (
      LOW_VALUE_CONTENT_PATTERNS.some((pattern) => pattern.test(lowerContent))
      || lowerTags.some((tag) => LOW_VALUE_TAG_PATTERNS.some((pattern) => pattern.test(tag)))
    );
  }

  private projectPriority(memory: MemoryItem): number {
    if (memory.type === 'summary' && (memory.tags.includes('active_project_summary') || memory.tags.includes('project_continuity'))) {
      return PROJECT_PRIORITY_SUMMARY;
    }
    if (memory.type === 'project' && memory.tags.includes('project_state')) {
      return PROJECT_PRIORITY_PROJECT_STATE;
    }
    if (memory.type === 'decision') {
      return PROJECT_PRIORITY_DECISION;
    }
    if (memory.type === 'commitment' && memory.tags.includes('next_step')) {
      return PROJECT_PRIORITY_COMMITMENT_NEXT_STEP;
    }
    if (memory.type === 'project') {
      return PROJECT_PRIORITY_PROJECT;
    }
    if (memory.type === 'constraint') {
      return PROJECT_PRIORITY_CONSTRAINT;
    }
    return PROJECT_PRIORITY_DEFAULT;
  }

  private dataQuality(memory: MemoryItem): { dataClass: MemoryDataClass; quality: number } {
    const dataClass = this.classifyMemoryData(memory);
    if (dataClass === 'test') {
      return { dataClass, quality: DATA_QUALITY_TEST };
    }
    if (dataClass === 'runtime') {
      if (this.isLowValueNoise(memory)) {
        return { dataClass, quality: DATA_QUALITY_RUNTIME_LOW_VALUE };
      }
      if (memory.type === 'summary' || memory.source.kind === 'summary') {
        return { dataClass, quality: DATA_QUALITY_SUMMARY };
      }
      if (memory.source.kind === 'inference') {
        return { dataClass, quality: DATA_QUALITY_INFERENCE };
      }
      return { dataClass, quality: DATA_QUALITY_RUNTIME };
    }
    return {
      dataClass,
      quality: this.isLowValueNoise(memory) ? DATA_QUALITY_UNKNOWN_LOW_VALUE : DATA_QUALITY_UNKNOWN,
    };
  }
}

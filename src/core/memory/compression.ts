import { randomUUID } from 'node:crypto';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { RelationRepository } from '../../storage/relationRepo.js';
import { BATCH_SEARCH_LIMIT } from '../../tuning/operations.js';
import type { MemoryItem, MemoryScope } from '../../types/memory.js';

export interface CompressionResult {
  clustersFound: number;
  memoriesCompressed: number;
  summariesCreated: number;
  skipped: boolean;
  reason?: string;
}

export interface CompressionOptions {
  scope?: MemoryScope;
  minClusterSize?: number;
  similarityThreshold?: number;
  maxClusters?: number;
  dryRun?: boolean;
}

const DEFAULT_MIN_CLUSTER_SIZE = 3;
const DEFAULT_MAX_CLUSTERS = 5;
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;
const SUMMARY_SNIPPET_LENGTH = 100;
const MAX_SUMMARY_ADDITIONS = 3;

export class MemoryCompressionService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly relationRepo: RelationRepository,
    private readonly debugRepo?: DebugRepository,
  ) {}

  compress(options: CompressionOptions = {}): CompressionResult {
    const minClusterSize = options.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;
    const maxClusters = options.maxClusters ?? DEFAULT_MAX_CLUSTERS;
    const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;

    const memories = sortMemories(
      this.memoryRepo.search({
        scope: options.scope,
        activeOnly: true,
        archived: false,
        limit: BATCH_SEARCH_LIMIT,
      }),
    );

    if (memories.length < minClusterSize) {
      return {
        clustersFound: 0,
        memoriesCompressed: 0,
        summariesCreated: 0,
        skipped: true,
        reason: 'insufficient_memories',
      };
    }

    const groups = new Map<string, MemoryItem[]>();
    for (const memory of memories) {
      const group = groups.get(memory.type);
      if (group) {
        group.push(memory);
      } else {
        groups.set(memory.type, [memory]);
      }
    }

    let clustersFound = 0;
    let memoriesCompressed = 0;
    let summariesCreated = 0;

    for (const type of Array.from(groups.keys()).sort()) {
      if (clustersFound >= maxClusters) {
        break;
      }

      const group = sortMemories(groups.get(type) ?? []);
      if (group.length < minClusterSize) {
        continue;
      }

      const clusters = this.findClusters(group, similarityThreshold, minClusterSize);
      for (const cluster of clusters) {
        if (clustersFound >= maxClusters) {
          break;
        }

        clustersFound += 1;
        if (options.dryRun) {
          continue;
        }

        const summary = this.createSummaryMemory(cluster);
        this.memoryRepo.insert(summary);

        for (const original of cluster) {
          this.memoryRepo.update({
            ...original,
            lifecycle: 'archive',
            timestamps: {
              ...original.timestamps,
              updatedAt: summary.timestamps.createdAt,
            },
            state: {
              ...original.state,
              active: false,
              archived: true,
              supersededBy: summary.id,
            },
          });

          const relations = sortRelations(this.relationRepo.findByMemory(original.id));
          for (const relation of relations) {
            const newSourceId = relation.sourceId === original.id ? summary.id : relation.sourceId;
            const newTargetId = relation.targetId === original.id ? summary.id : relation.targetId;
            if (newSourceId === newTargetId) {
              continue;
            }

            this.relationRepo.upsert({
              ...relation,
              id: randomUUID(),
              sourceId: newSourceId,
              targetId: newTargetId,
              createdBy: 'consolidation',
              updatedAt: summary.timestamps.createdAt,
            });
          }

          memoriesCompressed += 1;
        }

        summariesCreated += 1;
        this.debugRepo?.log('memory_archived', summary.id, {
          event: 'compression',
          clusterSize: cluster.length,
          summaryId: summary.id,
          type: cluster[0]?.type,
          archivedMemoryIds: cluster.map((memory) => memory.id),
        });
      }
    }

    return {
      clustersFound,
      memoriesCompressed,
      summariesCreated,
      skipped: false,
    };
  }

  private findClusters(memories: MemoryItem[], threshold: number, minSize: number): MemoryItem[][] {
    const used = new Set<string>();
    const clusters: MemoryItem[][] = [];

    for (const seed of sortMemories(memories)) {
      if (used.has(seed.id)) {
        continue;
      }

      const seedKeywords = extractKeywords(seed.content);
      const cluster: MemoryItem[] = [seed];

      for (const candidate of sortMemories(memories)) {
        if (candidate.id === seed.id || used.has(candidate.id)) {
          continue;
        }

        const overlap = keywordOverlap(seedKeywords, extractKeywords(candidate.content));
        if (overlap >= threshold) {
          cluster.push(candidate);
        }
      }

      if (cluster.length >= minSize) {
        const sortedCluster = sortMemories(cluster);
        for (const memory of sortedCluster) {
          used.add(memory.id);
        }
        clusters.push(sortedCluster);
      }
    }

    return clusters.sort(compareClusterOrder);
  }

  private createSummaryMemory(cluster: MemoryItem[]): MemoryItem {
    const sortedCluster = [...cluster].sort(compareSummaryPriority);
    const base = sortedCluster[0];
    const createdAt = latestTimestamp(sortedCluster);
    const additions: string[] = [];
    const baseKeywords = new Set(extractKeywords(base.content));

    for (const memory of sortedCluster.slice(1)) {
      const uniqueKeywords = extractKeywords(memory.content).filter((keyword) => !baseKeywords.has(keyword));
      if (uniqueKeywords.length > 0) {
        additions.push(truncateContent(memory.content, SUMMARY_SNIPPET_LENGTH));
      }
    }

    const summaryContent = additions.length > 0
      ? `${base.content} [+${cluster.length - 1} related: ${additions.slice(0, MAX_SUMMARY_ADDITIONS).join('; ')}]`
      : base.content;

    return {
      id: randomUUID(),
      content: summaryContent,
      type: base.type,
      lifecycle: 'semantic',
      source: { kind: 'summary', actor: 'system' },
      scope: { ...base.scope },
      scores: {
        confidence: Math.max(...sortedCluster.map((memory) => memory.scores.confidence)),
        importance: Math.max(...sortedCluster.map((memory) => memory.scores.importance)),
        explicitness: base.scores.explicitness,
      },
      timestamps: {
        createdAt,
        updatedAt: createdAt,
      },
      state: {
        active: true,
        archived: false,
      },
      evidence: {
        references: sortedCluster.map((memory) => memory.id),
      },
      tags: uniqueSortedStrings([...sortedCluster.flatMap((memory) => memory.tags), 'compressed']),
      relatedEntities: uniqueSortedStrings(sortedCluster.flatMap((memory) => memory.relatedEntities)),
      stats: {
        accessCount: 0,
        retrievalCount: 0,
      },
      sourceGrade: 'derived',
    };
  }
}

function extractKeywords(text: string): string[] {
  const keywords = text.toLowerCase().match(/[\p{Script=Han}]{2,4}|[a-z0-9]{3,}/gu) ?? [];
  return Array.from(new Set(keywords.filter((keyword) => keyword.length >= 2))).sort();
}

function keywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setB = new Set(b);
  let overlap = 0;
  for (const keyword of a) {
    if (setB.has(keyword)) {
      overlap += 1;
    }
  }

  return overlap / Math.min(a.length, b.length);
}

function sortMemories(memories: MemoryItem[]): MemoryItem[] {
  return [...memories].sort(compareMemoryOrder);
}

function compareMemoryOrder(a: MemoryItem, b: MemoryItem): number {
  return compareStrings(a.timestamps.updatedAt, b.timestamps.updatedAt)
    || compareStrings(a.timestamps.createdAt, b.timestamps.createdAt)
    || compareStrings(a.id, b.id);
}

function compareSummaryPriority(a: MemoryItem, b: MemoryItem): number {
  return (b.scores.importance - a.scores.importance)
    || (b.scores.confidence - a.scores.confidence)
    || compareStrings(a.timestamps.createdAt, b.timestamps.createdAt)
    || compareStrings(a.id, b.id);
}

function compareClusterOrder(a: MemoryItem[], b: MemoryItem[]): number {
  const firstA = a[0];
  const firstB = b[0];
  if (!firstA || !firstB) {
    return a.length - b.length;
  }

  return compareMemoryOrder(firstA, firstB) || (a.length - b.length);
}

function latestTimestamp(memories: MemoryItem[]): string {
  let latest = memories[0]?.timestamps.updatedAt ?? new Date().toISOString();
  for (const memory of memories) {
    if (compareStrings(memory.timestamps.updatedAt, latest) > 0) {
      latest = memory.timestamps.updatedAt;
    }
  }
  return latest;
}

function truncateContent(content: string, maxLength: number): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, Math.max(0, maxLength - 3)).trimEnd() + '...';
}

function uniqueSortedStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort();
}

function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

function sortRelations(relations: ReturnType<RelationRepository['findByMemory']>): ReturnType<RelationRepository['findByMemory']> {
  return [...relations].sort((a, b) =>
    compareStrings(a.updatedAt, b.updatedAt)
    || compareStrings(a.createdAt, b.createdAt)
    || compareStrings(a.id, b.id),
  );
}

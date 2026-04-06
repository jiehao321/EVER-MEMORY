import type { MemoryDataClass } from '../../types.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { RelationRepository } from '../../storage/relationRepo.js';
import type { RelationType } from '../../types/relation.js';
import type { ScoredRecallItem } from './support.js';

const RELATION_BOOST: Record<string, number> = {
  supports: 0.08,
  causes: 0.08,
  depends_on: 0.08,
  evolves_from: 0.06,
  supersedes: 0.06,
  refines: 0.06,
  related_to: 0.04,
  related: 0.04,
  contradicts: 0.02,
};

const GRAPH_SCAN_TYPES: RelationType[] = [
  'supports',
  'causes',
  'depends_on',
  'contradicts',
  'evolves_from',
  'supersedes',
  'related_to',
];

const DEFAULT_SCAN_TOP = 10;
const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_GRAPH_LIMIT = 10;
const MIN_GRAPH_WEIGHT = 0.3;
const MAX_GRAPH_INJECTIONS = 3;
const MIN_INJECTION_BOOST = 0.1;

function sortRanked(left: ScoredRecallItem, right: ScoredRecallItem): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  const updatedDelta = right.memory.timestamps.updatedAt.localeCompare(left.memory.timestamps.updatedAt);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  return right.memory.id.localeCompare(left.memory.id);
}

function resolveDataClass(entry: ScoredRecallItem | undefined): MemoryDataClass {
  return entry?.dataClass ?? 'unknown';
}

function resolveBoost(node: {
  relationType?: string;
  weight?: number;
  depth: number;
}): number {
  const relationWeight = node.relationType ? (RELATION_BOOST[node.relationType] ?? 0) : 0;
  if (relationWeight <= 0) {
    return 0;
  }
  return relationWeight * (node.weight ?? 1) / Math.max(node.depth, 1);
}

export function enhanceWithGraphBoost(
  ranked: ScoredRecallItem[],
  relationRepo: RelationRepository,
  memoryRepo?: MemoryRepository,
  options: { scanTop?: number; maxDepth?: number } = {},
): ScoredRecallItem[] {
  if (ranked.length === 0) {
    return ranked;
  }

  const scanTop = options.scanTop ?? DEFAULT_SCAN_TOP;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const boostById = new Map<string, number>();
  const existingById = new Map(ranked.map((entry) => [entry.memory.id, entry]));

  for (const item of ranked.slice(0, scanTop)) {
    const connected = relationRepo.findConnected(item.memory.id, {
      maxDepth,
      types: GRAPH_SCAN_TYPES,
      limit: DEFAULT_GRAPH_LIMIT,
      minWeight: MIN_GRAPH_WEIGHT,
    });

    for (const node of connected) {
      const boost = resolveBoost(node);
      if (boost <= 0) {
        continue;
      }
      boostById.set(node.memoryId, (boostById.get(node.memoryId) ?? 0) + boost);
    }
  }

  if (boostById.size === 0) {
    return ranked;
  }

  const boosted = ranked.map((entry) => {
    const graphBoost = boostById.get(entry.memory.id) ?? 0;
    return graphBoost > 0
      ? { ...entry, score: entry.score + graphBoost }
      : entry;
  });

  if (!memoryRepo) {
    return boosted.sort(sortRanked);
  }

  const injected: ScoredRecallItem[] = [];
  for (const [memoryId, boost] of [...boostById.entries()]
    .filter(([memoryId, boost]) => !existingById.has(memoryId) && boost >= MIN_INJECTION_BOOST)
    .sort((left, right) => right[1] - left[1])
    .slice(0, MAX_GRAPH_INJECTIONS)) {
    const memory = memoryRepo.findById(memoryId);
    if (!memory) {
      continue;
    }

    injected.push({
      memory,
      score: boost,
      keywordScore: 0,
      semanticScore: 0,
      baseScore: 0,
      projectPriority: 0,
      dataQuality: 0,
      dataClass: resolveDataClass(existingById.get(memoryId)),
      graphInjected: true,
    });
  }

  return [...boosted, ...injected].sort(sortRanked);
}

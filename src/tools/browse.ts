import type { MemoryRepository } from '../storage/memoryRepo.js';
import type { MemoryItem, MemoryLifecycle, MemoryScope, MemoryType } from '../types.js';

export interface EverMemoryBrowseToolInput {
  type?: MemoryType | 'all';
  lifecycle?: MemoryLifecycle;
  limit?: number;
  sortBy?: 'recent' | 'importance' | 'accessed' | 'written';
  sinceMinutesAgo?: number;
  scope?: MemoryScope;
  source?: string;
}

export interface EverMemoryBrowseItem {
  id: string;
  content: string;
  type: MemoryType;
  lifecycle: MemoryLifecycle;
  confidence: number;
  lastAccessedAt?: string;
  ageInDays: number;
  atRiskOfArchival: boolean;
}

export interface EverMemoryBrowseToolResult {
  items: EverMemoryBrowseItem[];
  total: number;
  summary: string;
}

const CONTENT_PREVIEW_LENGTH = 120;
const AT_RISK_AGE_DAYS = 25;
const AT_RISK_MIN_ACCESS = 2;

function toBrowseItem(memory: MemoryItem): EverMemoryBrowseItem {
  const ageInDays = Math.floor((Date.now() - Date.parse(memory.timestamps.updatedAt)) / (24 * 60 * 60 * 1000));
  const atRiskOfArchival = ageInDays > AT_RISK_AGE_DAYS && memory.stats.accessCount < AT_RISK_MIN_ACCESS;
  return {
    id: memory.id,
    content: memory.content.length > CONTENT_PREVIEW_LENGTH
      ? `${memory.content.slice(0, CONTENT_PREVIEW_LENGTH - 1)}…`
      : memory.content,
    type: memory.type,
    lifecycle: memory.lifecycle,
    confidence: memory.scores.confidence,
    lastAccessedAt: memory.timestamps.lastAccessedAt,
    ageInDays,
    atRiskOfArchival,
  };
}

export function evermemoryBrowse(
  memoryRepo: MemoryRepository,
  input: EverMemoryBrowseToolInput = {},
): EverMemoryBrowseToolResult {
  const limit = Math.max(1, Math.min(input.limit ?? 20, 100));
  const lifecycle = (input.lifecycle as MemoryLifecycle | undefined);

  const memories = memoryRepo.search({
    scope: input.scope,
    types: input.type && input.type !== 'all' ? [input.type as MemoryType] : undefined,
    lifecycles: lifecycle ? [lifecycle] : ['working', 'episodic', 'semantic'],
    activeOnly: true,
    archived: false,
    limit: 500, // fetch more for sorting
  });

  const sinceMinutesAgo = input.sinceMinutesAgo;
  const cutoffTime = sinceMinutesAgo !== undefined
    ? Date.now() - sinceMinutesAgo * 60_000
    : undefined;
  const filtered = memories.filter((memory) => {
    if (cutoffTime !== undefined && Date.parse(memory.timestamps.createdAt) < cutoffTime) {
      return false;
    }
    if (input.source && !memory.tags.includes(input.source)) {
      return false;
    }
    return true;
  });

  let sorted: MemoryItem[];
  if (input.sortBy === 'importance') {
    sorted = [...filtered].sort((a, b) => b.scores.importance - a.scores.importance);
  } else if (input.sortBy === 'accessed') {
    sorted = [...filtered].sort((a, b) => {
      const aTime = a.timestamps.lastAccessedAt ? Date.parse(a.timestamps.lastAccessedAt) : 0;
      const bTime = b.timestamps.lastAccessedAt ? Date.parse(b.timestamps.lastAccessedAt) : 0;
      return bTime - aTime;
    });
  } else if (input.sortBy === 'written') {
    sorted = [...filtered].sort((a, b) => b.timestamps.createdAt.localeCompare(a.timestamps.createdAt));
  } else {
    // default: recent (by updatedAt)
    sorted = [...filtered].sort((a, b) => b.timestamps.updatedAt.localeCompare(a.timestamps.updatedAt));
  }

  const items = sorted.slice(0, limit).map(toBrowseItem);
  const atRiskCount = items.filter((item) => item.atRiskOfArchival).length;

  const summary = atRiskCount > 0
    ? `${items.length} of ${filtered.length} active memories. ${atRiskCount} at risk of archival.`
    : `${items.length} of ${filtered.length} active memories.`;

  return { items, total: filtered.length, summary };
}

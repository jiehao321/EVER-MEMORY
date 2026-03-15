import { randomUUID } from 'node:crypto';
import { MEMORY_TYPES } from '../../constants.js';
import type { MemoryItem, MemoryScope, MemoryType } from '../../types.js';
import { MemoryRepository } from '../../storage/memoryRepo.js';

export interface ExportFormat {
  readonly format: 'json' | 'markdown';
  readonly scope?: MemoryScope;
  readonly includeArchived?: boolean;
  readonly limit?: number;
}

export interface ExportResult {
  readonly format: 'json' | 'markdown';
  readonly content: string;
  readonly count: number;
  readonly exportedAt: string;
}

export interface ImportResult {
  readonly imported: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}

type ImportShape = {
  content?: unknown;
  kind?: unknown;
  type?: unknown;
  tags?: unknown;
  scores?: { importance?: unknown } | undefined;
  timestamps?: { createdAt?: unknown; updatedAt?: unknown } | undefined;
};

const DEFAULT_LIMIT = 1000;
const MAX_CONTENT_LENGTH = 10_000;
const DEDUP_SCAN_LIMIT = 10_000;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeType(value: unknown): MemoryType | null {
  return typeof value === 'string' && MEMORY_TYPES.includes(value as MemoryType) ? value as MemoryType : null;
}

function fallbackLifecycle(type: MemoryType): MemoryItem['lifecycle'] {
  return ['identity', 'preference', 'constraint', 'decision'].includes(type) ? 'semantic' : 'episodic';
}

function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function toExportItem(memory: MemoryItem) {
  return {
    id: memory.id,
    content: memory.content,
    kind: memory.type,
    type: memory.type,
    tags: memory.tags,
    scores: memory.scores,
    timestamps: memory.timestamps,
  };
}

function toMarkdown(memory: MemoryItem): string {
  return [
    `## [${memory.type}] ${memory.content}`,
    `- 标签: ${memory.tags.length > 0 ? memory.tags.join(', ') : '无'}`,
    `- 创建时间: ${memory.timestamps.createdAt.slice(0, 10)}`,
    `- 重要性: ${memory.scores.importance}`,
  ].join('\n');
}

function parseMarkdown(content: string): ImportShape[] {
  return content
    .split(/^##\s+/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const [header = '', ...rest] = block.split('\n');
      const match = /^\[(.+?)\]\s+(.+)$/.exec(header.trim());
      const tagsLine = rest.find((line) => line.startsWith('- 标签:'));
      const createdAtLine = rest.find((line) => line.startsWith('- 创建时间:'));
      const importanceLine = rest.find((line) => line.startsWith('- 重要性:'));
      return {
        content: match?.[2]?.trim(),
        kind: match?.[1]?.trim(),
        tags: tagsLine
          ? tagsLine.replace('- 标签:', '').split(',').map((item) => item.trim()).filter(Boolean)
          : [],
        scores: importanceLine ? { importance: Number(importanceLine.replace('- 重要性:', '').trim()) } : undefined,
        timestamps: createdAtLine
          ? {
              createdAt: new Date(createdAtLine.replace('- 创建时间:', '').trim()).toISOString(),
            }
          : undefined,
      } satisfies ImportShape;
    });
}

function toMemoryItem(entry: ImportShape, scope: MemoryScope): MemoryItem | null {
  const content = typeof entry.content === 'string' ? entry.content.trim() : '';
  if (!content) {
    return null;
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new Error(`content exceeds ${MAX_CONTENT_LENGTH} characters`);
  }
  const type = normalizeType(entry.kind ?? entry.type);
  if (!type) {
    throw new Error('missing valid kind/type');
  }
  const createdAt = typeof entry.timestamps?.createdAt === 'string' ? entry.timestamps.createdAt : nowIso();
  const updatedAt = typeof entry.timestamps?.updatedAt === 'string' ? entry.timestamps.updatedAt : createdAt;
  const importance = typeof entry.scores?.importance === 'number' && entry.scores.importance >= 0 && entry.scores.importance <= 1
    ? entry.scores.importance
    : 0.5;
  return {
    id: randomUUID(),
    content,
    type,
    lifecycle: fallbackLifecycle(type),
    source: { kind: 'imported', actor: 'system' },
    scope,
    scores: { confidence: 0.8, importance, explicitness: 1 },
    timestamps: { createdAt, updatedAt },
    state: { active: true, archived: false },
    evidence: { references: [] },
    tags: normalizeTags(entry.tags),
    relatedEntities: [],
    stats: { accessCount: 0, retrievalCount: 0 },
  };
}

export class MemoryExportService {
  constructor(private readonly memoryRepo: MemoryRepository) {}

  export(options: ExportFormat): ExportResult {
    const exportedAt = nowIso();
    const count = this.memoryRepo.count({
      scope: options.scope,
      archived: options.includeArchived ? undefined : false,
    });
    const memories = count > 0
      ? this.memoryRepo.search({
          scope: options.scope,
          archived: options.includeArchived ? undefined : false,
          limit: Math.min(options.limit ?? DEFAULT_LIMIT, DEFAULT_LIMIT),
        })
      : [];
    return {
      format: options.format,
      content: options.format === 'json'
        ? JSON.stringify(memories.map(toExportItem), null, 2)
        : memories.map(toMarkdown).join('\n\n'),
      count: memories.length,
      exportedAt,
    };
  }

  async import(content: string, format: 'json' | 'markdown', scope: MemoryScope): Promise<ImportResult> {
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;
    let rawItems: ImportShape[] = [];
    try {
      rawItems = format === 'json' ? JSON.parse(content) as ImportShape[] : parseMarkdown(content);
      if (!Array.isArray(rawItems)) {
        throw new Error('root value must be an array or markdown blocks');
      }
    } catch (error) {
      return { imported: 0, skipped: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }

    const existing = new Set(
      this.memoryRepo.search({
        scope,
        archived: undefined,
        limit: Math.min(Math.max(this.memoryRepo.count({ scope }), 1), DEDUP_SCAN_LIMIT),
      }).map((item) => `${item.type}::${item.content.trim()}`),
    );

    for (const [index, raw] of rawItems.entries()) {
      try {
        const memory = toMemoryItem(raw, scope);
        if (!memory) {
          skipped += 1;
          continue;
        }
        const dedupKey = `${memory.type}::${memory.content}`;
        if (existing.has(dedupKey)) {
          skipped += 1;
          continue;
        }
        this.memoryRepo.insert(memory);
        existing.add(dedupKey);
        imported += 1;
      } catch (error) {
        const safeMsg = error instanceof Error && !error.message.includes('SQLITE')
          ? error.message
          : 'storage error';
        errors.push(`item ${index}: ${safeMsg}`);
      }
    }

    return { imported, skipped, errors };
  }
}

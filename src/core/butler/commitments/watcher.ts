import type { OpenClawLogger } from '../../../openclaw/shared.js';
import type { CognitiveEngine } from '../cognition.js';
import type { ButlerInsight, CognitiveTask, NewButlerInsight } from '../types.js';
import type { MemoryItem, MemoryScope } from '../../../types.js';
import { ButlerInsightRepository } from '../../../storage/butlerInsightRepo.js';
import { MemoryRepository } from '../../../storage/memoryRepo.js';

const COMMITMENT_KEYWORDS = [
  'promise',
  'deadline',
  'due ',
  'due:',
  'will do',
  'i will',
  'we will',
  'follow up',
  'by tomorrow',
  'by friday',
];
const SCAN_LIMIT = 100;
const EXISTING_LIMIT = 200;
const TITLE_LIMIT = 80;
const FRESH_HOURS = 72;

interface CommitmentExtraction {
  title?: string;
  summary?: string;
  confidence?: number;
  importance?: number;
  what?: string;
  when?: string;
  status?: string;
}

interface CommitmentWatcherOptions {
  memoryRepo: MemoryRepository;
  insightRepo: ButlerInsightRepository;
  cognitiveEngine?: CognitiveEngine;
  logger?: OpenClawLogger;
}

function nowMs(): number {
  return Date.now();
}

function toScope(scope?: MemoryScope): MemoryScope | undefined {
  if (!scope) {
    return undefined;
  }
  return { userId: scope.userId, chatId: scope.chatId, project: scope.project };
}

function toInsightScope(scope?: MemoryScope): Record<string, unknown> | undefined {
  const scoped = toScope(scope);
  return scoped ? { ...scoped } : undefined;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function titleFromContent(content: string): string {
  const normalized = normalizeText(content);
  return normalized.length <= TITLE_LIMIT ? normalized : `${normalized.slice(0, TITLE_LIMIT - 1)}...`;
}

function futureIso(hours: number): string {
  return new Date(nowMs() + hours * 60 * 60 * 1000).toISOString();
}

function parseSourceRefs(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function uniqueMemories(items: MemoryItem[]): MemoryItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function buildHeuristicInsight(memory: MemoryItem): NewButlerInsight {
  return {
    kind: 'commitment',
    scope: toInsightScope(memory.scope),
    title: titleFromContent(memory.content),
    summary: memory.content,
    confidence: memory.scores.confidence,
    importance: Math.max(memory.scores.importance, 0.4),
    freshUntil: futureIso(FRESH_HOURS),
    sourceRefs: [memory.id],
  };
}

function buildLlmTask(memory: MemoryItem): CognitiveTask<CommitmentExtraction> {
  return {
    taskType: 'commitment-extraction',
    evidence: {
      id: memory.id,
      content: memory.content,
      scope: toScope(memory.scope),
      createdAt: memory.timestamps.createdAt,
      updatedAt: memory.timestamps.updatedAt,
    },
    outputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        confidence: { type: 'number' },
        importance: { type: 'number' },
        what: { type: 'string' },
        when: { type: 'string' },
        status: { type: 'string' },
      },
      required: ['title', 'summary'],
    },
    latencyClass: 'background',
    privacyClass: 'local_only',
    budgetClass: 'cheap',
  };
}

function buildLlmInsight(memory: MemoryItem, output: CommitmentExtraction): NewButlerInsight {
  const parts = [output.summary];
  if (output.what) {
    parts.push(`What: ${output.what}`);
  }
  if (output.when) {
    parts.push(`When: ${output.when}`);
  }
  if (output.status) {
    parts.push(`Status: ${output.status}`);
  }
  return {
    kind: 'commitment',
    scope: toInsightScope(memory.scope),
    title: titleFromContent(output.title ?? memory.content),
    summary: parts.filter((item): item is string => typeof item === 'string' && item.length > 0).join(' | '),
    confidence: output.confidence ?? memory.scores.confidence,
    importance: output.importance ?? Math.max(memory.scores.importance, 0.4),
    freshUntil: futureIso(FRESH_HOURS),
    sourceRefs: [memory.id],
  };
}

export class CommitmentWatcher {
  private readonly memoryRepo: MemoryRepository;
  private readonly insightRepo: ButlerInsightRepository;
  private readonly cognitiveEngine?: CognitiveEngine;
  private readonly logger?: OpenClawLogger;

  constructor(options: CommitmentWatcherOptions) {
    this.memoryRepo = options.memoryRepo;
    this.insightRepo = options.insightRepo;
    this.cognitiveEngine = options.cognitiveEngine;
    this.logger = options.logger;
  }

  async scanCommitments(scope?: MemoryScope): Promise<ButlerInsight[]> {
    const memories = this.findCandidateMemories(scope);
    const existingRefs = this.getExistingCommitmentRefs();
    const created: ButlerInsight[] = [];
    for (const memory of memories) {
      if (existingRefs.has(memory.id)) {
        continue;
      }
      const id = this.insightRepo.insert(await this.buildInsight(memory));
      const stored = this.insightRepo.findById(id);
      if (stored) {
        created.push(stored);
        existingRefs.add(memory.id);
      }
    }
    return created;
  }

  getActiveCommitments(): ButlerInsight[] {
    return this.insightRepo.findByKind('commitment', 20);
  }

  private findCandidateMemories(scope?: MemoryScope): MemoryItem[] {
    const scoped = toScope(scope);
    const typed = this.memoryRepo.search({
      scope: scoped,
      types: ['commitment'],
      activeOnly: true,
      archived: false,
      limit: SCAN_LIMIT,
    });
    const keywordMatches = COMMITMENT_KEYWORDS.flatMap((keyword) => this.memoryRepo.search({
      scope: scoped,
      query: keyword,
      activeOnly: true,
      archived: false,
      limit: SCAN_LIMIT,
    }));
    return uniqueMemories([...typed, ...keywordMatches]);
  }

  private getExistingCommitmentRefs(): Set<string> {
    const insights = this.insightRepo.findByKind('commitment', EXISTING_LIMIT);
    return new Set(insights.flatMap((insight) => parseSourceRefs(insight.sourceRefsJson)));
  }

  private async buildInsight(memory: MemoryItem): Promise<NewButlerInsight> {
    if (!this.cognitiveEngine) {
      return buildHeuristicInsight(memory);
    }
    const task = buildLlmTask(memory);
    if (!this.cognitiveEngine.canAfford(task)) {
      return buildHeuristicInsight(memory);
    }
    try {
      const result = await this.cognitiveEngine.runTask(task);
      return result.fallbackUsed ? buildHeuristicInsight(memory) : buildLlmInsight(memory, result.output);
    } catch (error) {
      this.logger?.warn('CommitmentWatcher failed to extract commitment details.', error);
      return buildHeuristicInsight(memory);
    }
  }
}

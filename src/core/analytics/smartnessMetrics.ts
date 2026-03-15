import type { DebugEvent, MemoryItem } from '../../types.js';
import type { DebugRepository } from '../../storage/debugRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';

export interface SmartnessDimension {
  readonly name: string;
  readonly score: number;
  readonly trend: 'up' | 'down' | 'stable';
  readonly description: string;
}

export interface SmartnessSummary {
  readonly overall: number;
  readonly dimensions: readonly SmartnessDimension[];
  readonly computedAt: string;
  readonly userId?: string;
}

const DIVERSITY_KINDS = [
  'project_state',
  'decision',
  'explicit_constraint',
  'user_preference',
  'next_step',
  'lesson',
  'warning',
] as const;

function clamp(score: number): number {
  return Math.max(0, Math.min(1, score));
}

function toTrend(current: number, previous: number): SmartnessDimension['trend'] {
  if (current > previous) {
    return 'up';
  }
  if (current < previous) {
    return 'down';
  }
  return 'stable';
}

function hasKind(memory: MemoryItem, kind: string): boolean {
  return memory.type === kind || memory.tags.includes(kind);
}

function countByKind(memories: readonly MemoryItem[], kind: string): number {
  return memories.filter((memory) => hasKind(memory, kind)).length;
}

function byWindow(items: readonly { createdAt: string }[], recentStart: string, previousStart: string): [number, number] {
  let recent = 0;
  let previous = 0;
  for (const item of items) {
    if (item.createdAt >= recentStart) {
      recent += 1;
    } else if (item.createdAt >= previousStart) {
      previous += 1;
    }
  }
  return [recent, previous];
}

function getRulesCount(event: DebugEvent | undefined): number {
  const value = event?.payload.rules;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export class SmartnessMetricsService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly debugEventRepo: DebugRepository,
  ) {}

  async compute(userId?: string): Promise<SmartnessSummary> {
    const scope = userId ? { userId } : undefined;
    const total = this.memoryRepo.count({ scope });
    const memories = total > 0 ? this.memoryRepo.search({ scope, limit: total, archived: false }) : [];
    const now = new Date();
    const recentStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const previousStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const createdRows = memories.map((memory) => ({ createdAt: memory.timestamps.createdAt }));
    const [recentAdded, previousAdded] = byWindow(createdRows, recentStart, previousStart);

    const preferenceCount = countByKind(memories, 'user_preference');
    const constraintCount = countByKind(memories, 'explicit_constraint');
    const [recentPreference, previousPreference] = byWindow(
      memories
        .filter((memory) => hasKind(memory, 'user_preference') || hasKind(memory, 'explicit_constraint'))
        .map((memory) => ({ createdAt: memory.timestamps.createdAt })),
      recentStart,
      previousStart,
    );

    const learningCount = countByKind(memories, 'lesson') + countByKind(memories, 'warning');
    const [recentLearning, previousLearning] = byWindow(
      memories
        .filter((memory) => hasKind(memory, 'lesson') || hasKind(memory, 'warning'))
        .map((memory) => ({ createdAt: memory.timestamps.createdAt })),
      recentStart,
      previousStart,
    );

    const uniqueKinds = new Set(
      DIVERSITY_KINDS.filter((kind) => memories.some((memory) => hasKind(memory, kind))),
    ).size;
    const recentKinds = new Set(
      DIVERSITY_KINDS.filter((kind) => memories.some((memory) => hasKind(memory, kind) && memory.timestamps.createdAt >= recentStart)),
    ).size;
    const previousKinds = new Set(
      DIVERSITY_KINDS.filter((kind) => memories.some((memory) => hasKind(memory, kind)
        && memory.timestamps.createdAt < recentStart
        && memory.timestamps.createdAt >= previousStart)),
    ).size;

    const ruleEvents = this.debugEventRepo.listRecent('rules_loaded', 200);
    const activeRules = getRulesCount(ruleEvents[0]);
    const [recentRuleEvents, previousRuleEvents] = [
      ruleEvents.filter((event) => event.createdAt >= recentStart),
      ruleEvents.filter((event) => event.createdAt < recentStart && event.createdAt >= previousStart),
    ];
    const recentRules = recentRuleEvents.length > 0
      ? Math.round(recentRuleEvents.reduce((sum, event) => sum + getRulesCount(event), 0) / recentRuleEvents.length)
      : 0;
    const previousRules = previousRuleEvents.length > 0
      ? Math.round(previousRuleEvents.reduce((sum, event) => sum + getRulesCount(event), 0) / previousRuleEvents.length)
      : 0;

    const dimensions: SmartnessDimension[] = [
      {
        name: '记忆深度',
        score: clamp(total / 100),
        trend: toTrend(recentAdded, previousAdded),
        description: `${total} 条记忆，近 7 天新增 ${recentAdded} 条`,
      },
      {
        name: '偏好精准度',
        score: clamp((total > 0 ? preferenceCount / total : 0) * 3 + (constraintCount > 0 ? 0.1 : 0)),
        trend: toTrend(recentPreference, previousPreference),
        description: `${preferenceCount} 条偏好记忆，${constraintCount} 条约束`,
      },
      {
        name: '主动学习密度',
        score: clamp(total > 0 ? learningCount / total : 0),
        trend: toTrend(recentLearning, previousLearning),
        description: `${learningCount} 条 lesson/warning 记忆`,
      },
      {
        name: '行为规则成熟度',
        score: clamp(activeRules / 10),
        trend: toTrend(recentRules, previousRules),
        description: `${activeRules} 条活跃规则`,
      },
      {
        name: '记忆多样性',
        score: clamp(uniqueKinds / DIVERSITY_KINDS.length),
        trend: toTrend(recentKinds, previousKinds),
        description: `${uniqueKinds}/${DIVERSITY_KINDS.length} 种关键类型覆盖`,
      },
    ];

    return {
      overall: clamp(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length),
      dimensions,
      computedAt: now.toISOString(),
      userId,
    };
  }
}

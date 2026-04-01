import type {
  IntentRecord,
  MemoryScope,
  MemoryStoreInput,
  ReflectionRecord,
  SessionEndInput,
} from '../../types.js';
import type { SemanticRepository } from '../../storage/semanticRepo.js';
import type { MemoryService } from './service.js';
import { clip } from '../../util/string.js';

const WARNING_PATTERN = /注意|小心|警告|danger|warning|careful/iu;
const SUCCESS_PATTERN = /有效|成功|顺利|通过|认可|approved|worked/iu;

export interface LearningInsight {
  readonly content: string;
  readonly kind: 'lesson' | 'pattern' | 'insight' | 'warning';
  readonly confidence: number;
  readonly trigger: 'correction' | 'success' | 'repeated_pattern' | 'explicit';
  readonly evidenceText: string;
}

export interface SessionContext {
  readonly intent?: IntentRecord;
  readonly reflection?: Pick<ReflectionRecord, 'trigger' | 'analysis' | 'evidence'>;
}

export interface ActiveLearningResult {
  readonly insights: readonly LearningInsight[];
  readonly storedCount: number;
  readonly skippedCount: number;
}

const ACTIVE_LEARNING_CLIP_DEFAULT = 180;

function dedupeInsights(insights: readonly LearningInsight[]): readonly LearningInsight[] {
  const seen = new Set<string>();
  return insights.filter((insight) => {
    const key = `${insight.kind}:${insight.content}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildEvidence(input: SessionEndInput, context: SessionContext): string {
  return clip(
    context.intent?.rawText
      || input.inputText
      || input.outcomeSummary
      || input.actionSummary
      || context.reflection?.analysis.nextTimeRecommendation,
    ACTIVE_LEARNING_CLIP_DEFAULT,
  );
}

function formatInsight(insight: LearningInsight): string {
  if (insight.kind === 'lesson') {
    return insight.content.startsWith('[踩坑]') ? insight.content : `[踩坑] ${insight.content}`;
  }
  if (insight.kind === 'pattern') {
    return insight.content.startsWith('[有效模式]') ? insight.content : `[有效模式] ${insight.content}`;
  }
  if (insight.kind === 'warning') {
    return insight.content.startsWith('[警告]') ? insight.content : `[警告] ${insight.content}`;
  }
  return insight.content.startsWith('[洞察]') ? insight.content : `[洞察] ${insight.content}`;
}

async function isDuplicateInsight(content: string, semanticRepo?: SemanticRepository): Promise<boolean> {
  if (!semanticRepo) {
    return false;
  }
  const hits = semanticRepo.search(content, { limit: 3, minScore: 0.88 });
  return hits.some((hit) => hit.score > 0.88);
}

export async function extractLearningInsights(
  input: SessionEndInput,
  context: SessionContext,
): Promise<readonly LearningInsight[]> {
  const evidenceText = buildEvidence(input, context);
  const combined = [input.inputText, input.actionSummary, input.outcomeSummary].filter(Boolean).join(' ');
  const insights: LearningInsight[] = [];

  if (context.intent?.intent.type === 'correction' || (context.intent?.signals.correctionSignal ?? 0) >= 0.8) {
    const cause = clip(
      input.actionSummary || input.outcomeSummary || '执行方式偏离了用户预期',
      ACTIVE_LEARNING_CLIP_DEFAULT,
    );
    const fix = clip(
      input.inputText
        || context.reflection?.analysis.nextTimeRecommendation
        || '先复述修正点并确认，再继续执行',
      ACTIVE_LEARNING_CLIP_DEFAULT,
    );
    insights.push({
      content: `踩坑：${cause}；修正：${fix}`,
      kind: 'lesson',
      confidence: 0.92,
      trigger: 'correction',
      evidenceText,
    });
  }

  if ((context.reflection?.evidence.recurrenceCount ?? 0) >= 2 && SUCCESS_PATTERN.test(combined)) {
    const pattern = clip(
      context.reflection?.analysis.whatWorked
        || input.outcomeSummary
        || input.actionSummary
        || '当前做法在重复场景中表现稳定',
      ACTIVE_LEARNING_CLIP_DEFAULT,
    );
    insights.push({
      content: `有效模式：${pattern}`,
      kind: 'pattern',
      confidence: 0.86,
      trigger: 'repeated_pattern',
      evidenceText,
    });
  }

  const recommendation = clip(context.reflection?.analysis.nextTimeRecommendation, ACTIVE_LEARNING_CLIP_DEFAULT);
  if (recommendation) {
    insights.push({
      content: recommendation,
      kind: 'insight',
      confidence: Math.max(0.7, context.reflection?.evidence.confidence ?? 0.7),
      trigger: context.reflection?.trigger.kind === 'success' ? 'success' : 'explicit',
      evidenceText,
    });
  }

  if (WARNING_PATTERN.test(combined)) {
    insights.push({
      content: clip(input.inputText || input.outcomeSummary || combined, ACTIVE_LEARNING_CLIP_DEFAULT),
      kind: 'warning',
      confidence: 0.9,
      trigger: 'explicit',
      evidenceText,
    });
  }

  return dedupeInsights(insights);
}

export async function storeInsights(
  insights: readonly LearningInsight[],
  scope: MemoryScope,
  memoryService: MemoryService,
  semanticRepo?: SemanticRepository,
): Promise<ActiveLearningResult> {
  const stored: LearningInsight[] = [];
  let skippedCount = 0;

  for (const insight of insights) {
    const content = formatInsight(insight);
    if (await isDuplicateInsight(content, semanticRepo)) {
      skippedCount += 1;
      continue;
    }

    const memory: MemoryStoreInput = {
      content,
      type: insight.kind === 'pattern' ? 'decision' : insight.kind === 'insight' ? 'fact' : 'constraint',
      lifecycle: 'semantic',
      scope,
      source: {
        kind: 'reflection_derived',
        actor: 'system',
      },
      evidence: {
        excerpt: insight.evidenceText,
      },
      confidence: insight.confidence,
      importance: insight.kind === 'warning' || insight.kind === 'lesson' ? 0.9 : 0.75,
      explicitness: 0.8,
      tags: ['learning_insight', insight.kind, insight.trigger],
    };

    const result = memoryService.store(memory, scope);
    if (result.accepted) {
      stored.push(insight);
      continue;
    }
    skippedCount += 1;
  }

  return {
    insights: stored,
    storedCount: stored.length,
    skippedCount,
  };
}

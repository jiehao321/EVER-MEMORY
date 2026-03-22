import { Type } from '@sinclair/typebox';
import {
  CONSOLIDATION_MODES,
  INTENT_TYPES,
  MEMORY_LIFECYCLES,
  MEMORY_TYPES,
  RETRIEVAL_MODES,
} from '../../constants.js';
import { ARCHIVE_MAX_REVIEW_LIMIT, TRANSFER_MAX_EXPORT_LIMIT } from '../../tuning.js';
import { asOptionalEnum, asOptionalString, isRecord, truncate } from './format.js';

const MEMORY_SOURCE_KINDS = [
  'message',
  'tool',
  'manual',
  'summary',
  'inference',
  'test',
  'runtime_user',
  'runtime_project',
  'reflection_derived',
  'imported',
] as const;

const MEMORY_SOURCE_ACTORS = ['user', 'assistant', 'system'] as const;

export function parseMemorySource(
  value: unknown,
): {
    kind: (typeof MEMORY_SOURCE_KINDS)[number];
    actor?: (typeof MEMORY_SOURCE_ACTORS)[number];
    sessionId?: string;
    messageId?: string;
    channel?: string;
  } | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const kind = asOptionalEnum(value.kind, MEMORY_SOURCE_KINDS);
  if (!kind) {
    return undefined;
  }
  return {
    kind,
    actor: asOptionalEnum(value.actor, MEMORY_SOURCE_ACTORS),
    sessionId: asOptionalString(value.sessionId),
    messageId: asOptionalString(value.messageId),
    channel: asOptionalString(value.channel),
  };
}

function extractMessageText(message: unknown): string {
  if (!isRecord(message)) {
    return '';
  }

  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => {
        if (!isRecord(block)) {
          return '';
        }
        return typeof block.text === 'string' ? block.text : '';
      })
      .filter((value) => value.length > 0);
    return parts.join('\n');
  }

  return '';
}

export function extractLastExchange(messages: unknown[]): { userText?: string; assistantText?: string } {
  let userText: string | undefined;
  let assistantText: string | undefined;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!isRecord(message)) {
      continue;
    }
    const role = asOptionalString(message.role);
    if (!role) {
      continue;
    }
    const text = asOptionalString(extractMessageText(message));
    if (!text) {
      continue;
    }

    if (!assistantText && role === 'assistant') {
      assistantText = text;
      continue;
    }
    if (!userText && role === 'user') {
      userText = text;
      if (assistantText) {
        break;
      }
    }
  }

  return { userText, assistantText };
}

export function buildInjectedContext(
  recallItems: Array<{ type: string; lifecycle: string; content: string; tags?: string[] }>,
  behaviorRules: Array<{ statement: string; priority?: number }> | undefined,
): {
    prependContext?: string;
    stats: {
      recalledInput: number;
      memorySelected: number;
      memoryDeduped: number;
      rulesInput: number;
      rulesSelected: number;
      rulesDeduped: number;
      approxTokens: number;
    };
  } {
  const normalizeKey = (value: string): string => value
    .toLowerCase()
    .replace(/^(项目状态更新：|关键约束：|最近决策：|下一步：|项目连续性摘要（[^）]+）：)\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();

  const typePriority = (item: { type: string; tags?: string[] }): number => {
    if (item.type === 'summary' && (item.tags?.includes('active_project_summary') || item.tags?.includes('project_continuity'))) {
      return 100;
    }
    if (item.type === 'project') {
      return 90;
    }
    if (item.type === 'decision') {
      return 80;
    }
    if (item.type === 'constraint') {
      return 70;
    }
    if (item.type === 'commitment') {
      return 60;
    }
    return 20;
  };

  const dedupedRecallItems = [...recallItems]
    .sort((left, right) => typePriority(right) - typePriority(left))
    .reduce<Array<{ type: string; lifecycle: string; content: string; tags?: string[] }>>((acc, item) => {
      if (acc.length >= 5) {
        return acc;
      }
      const key = normalizeKey(item.content);
      if (!key) {
        return acc;
      }
      if (acc.some((existing) => normalizeKey(existing.content) === key)) {
        return acc;
      }
      acc.push(item);
      return acc;
    }, []);

  const memoryLines = dedupedRecallItems
    .map((item, index) => `${index + 1}. [${item.type}/${item.lifecycle}] ${truncate(item.content, 200)}`);

  const seenText = new Set(memoryLines.map((line) => normalizeKey(line)));
  const ruleInputs = (behaviorRules ?? [])
    .filter((rule) => typeof rule.statement === 'string' && rule.statement.trim().length > 0);
  const ruleLines = ruleInputs
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0))
    .reduce<string[]>((acc, rule) => {
      if (acc.length >= 3) {
        return acc;
      }
      const key = normalizeKey(rule.statement);
      if (!key || seenText.has(key) || acc.some((line) => normalizeKey(line) === key)) {
        return acc;
      }
      seenText.add(key);
      acc.push(rule.statement);
      return acc;
    }, [])
    .map((statement, index) => `${index + 1}. ${truncate(statement, 160)}`);

  if (memoryLines.length === 0 && ruleLines.length === 0) {
    return {
      prependContext: undefined,
      stats: {
        recalledInput: recallItems.length,
        memorySelected: 0,
        memoryDeduped: recallItems.length,
        rulesInput: ruleInputs.length,
        rulesSelected: 0,
        rulesDeduped: ruleInputs.length,
        approxTokens: 0,
      },
    };
  }

  const sections: string[] = ['<evermemory-context>'];
  if (memoryLines.length > 0) {
    sections.push('Relevant memory:');
    sections.push(...memoryLines.map((line) => `- ${line}`));
  }
  if (ruleLines.length > 0) {
    sections.push('Applicable behavior rules:');
    sections.push(...ruleLines.map((line) => `- ${line}`));
  }
  sections.push('</evermemory-context>');
  const prependContext = sections.join('\n');
  return {
    prependContext,
    stats: {
      recalledInput: recallItems.length,
      memorySelected: memoryLines.length,
      memoryDeduped: Math.max(0, recallItems.length - memoryLines.length),
      rulesInput: ruleInputs.length,
      rulesSelected: ruleLines.length,
      rulesDeduped: Math.max(0, ruleInputs.length - ruleLines.length),
      approxTokens: Math.ceil(prependContext.length / 4),
    },
  };
}

export const memoryTypeSchema = Type.Optional(Type.Union(MEMORY_TYPES.map((value) => Type.Literal(value))));
export const memoryLifecycleSchema = Type.Optional(
  Type.Union(MEMORY_LIFECYCLES.map((value) => Type.Literal(value))),
);
export const retrievalModeSchema = Type.Optional(Type.Union(
  RETRIEVAL_MODES.map((value) => Type.Literal(value)),
  { description: `Retrieval mode. One of: ${RETRIEVAL_MODES.join(', ')}.` },
));
export const intentTypeSchema = Type.Optional(Type.Union(INTENT_TYPES.map((value) => Type.Literal(value))));
export const consolidationModeSchema = Type.Optional(
  Type.Union(CONSOLIDATION_MODES.map((value) => Type.Literal(value))),
);
export const reflectModeSchema = Type.Optional(Type.Union([
  Type.Literal('light'),
  Type.Literal('full'),
]));
export const explainTopicSchema = Type.Optional(Type.Union([
  Type.Literal('write'),
  Type.Literal('retrieval'),
  Type.Literal('rule'),
]));
export const rulesActionSchema = Type.Optional(Type.Union([
  Type.Literal('freeze'),
  Type.Literal('deprecate'),
  Type.Literal('rollback'),
]));
export const importModeSchema = Type.Optional(Type.Union([
  Type.Literal('review'),
  Type.Literal('apply'),
], { description: 'Import mode. One of: review, apply.' }));
export const restoreModeSchema = Type.Optional(Type.Union([
  Type.Literal('review'),
  Type.Literal('apply'),
], { description: 'Restore mode. One of: review, apply.' }));
export const restoreLifecycleSchema = Type.Optional(Type.Union([
  Type.Literal('working'),
  Type.Literal('episodic'),
  Type.Literal('semantic'),
]));
export const REFLECT_MODES = ['light', 'full'] as const;
export const RULE_MUTATION_ACTIONS = ['freeze', 'deprecate', 'rollback'] as const;
export const EXPLAIN_TOPICS = ['write', 'retrieval', 'rule'] as const;
export const IMPORT_MODES = ['review', 'apply'] as const;
export const RESTORE_MODES = ['review', 'apply'] as const;
export const RESTORE_TARGET_LIFECYCLES = ['working', 'episodic', 'semantic'] as const;
export const sourceSchema = Type.Optional(
  Type.Object(
    {
      kind: Type.Optional(Type.String()),
      actor: Type.Optional(Type.String()),
      sessionId: Type.Optional(Type.String()),
      messageId: Type.Optional(Type.String()),
      channel: Type.Optional(Type.String()),
    },
    { additionalProperties: false },
  ),
);
export const scopeSchema = Type.Optional(
  Type.Object(
    {
      userId: Type.Optional(Type.String()),
      chatId: Type.Optional(Type.String()),
      project: Type.Optional(Type.String()),
      global: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
);

const OPENCLAW_EXPORT_LIMIT_MAX = Math.min(1000, TRANSFER_MAX_EXPORT_LIMIT);
const OPENCLAW_REVIEW_LIMIT_MAX = Math.min(100, ARCHIVE_MAX_REVIEW_LIMIT);

export const toolLimits = {
  explain: 20,
  export: OPENCLAW_EXPORT_LIMIT_MAX,
  recall: 20,
  restore: 100,
  review: OPENCLAW_REVIEW_LIMIT_MAX,
  rules: 50,
} as const;

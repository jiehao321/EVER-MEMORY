import { Type } from '@sinclair/typebox';
import { MEMORY_LIFECYCLES, MEMORY_TYPES, RETRIEVAL_MODES } from '../../constants.js';
import type { OpenClawRegistrationContext, UnknownRecord } from '../shared.js';
import {
  asOptionalBoolean,
  asOptionalEnum,
  asOptionalInteger,
  asOptionalString,
  asOptionalStringArray,
  memoryLifecycleSchema,
  memoryTypeSchema,
  mergeScope,
  parseMemorySource,
  parseScope,
  resolveToolScope,
  restoreLifecycleSchema,
  restoreModeSchema,
  RESTORE_MODES,
  RESTORE_TARGET_LIFECYCLES,
  retrievalModeSchema,
  scopeSchema,
  sourceSchema,
  toolLimits,
  truncate,
} from '../shared.js';

const EDIT_ACTIONS = ['update', 'delete', 'correct', 'merge', 'pin', 'unpin'] as const;
const RELATION_TYPES = ['causes', 'contradicts', 'supports', 'evolves_from', 'supersedes', 'depends_on', 'related_to'] as const;
const RELATION_ACTIONS = ['list', 'add', 'remove', 'graph'] as const;
const BROWSE_SORT_BY = ['recent', 'importance', 'accessed', 'written'] as const;
const EDIT_ACTION_LABELS: Record<(typeof EDIT_ACTIONS)[number], string> = {
  update: 'updated',
  delete: 'deleted',
  correct: 'corrected',
  merge: 'merged',
  pin: 'pinned',
  unpin: 'unpinned',
};

function normalizeToolMemoryType(value: unknown) {
  const normalized = asOptionalEnum(value, MEMORY_TYPES);
  return normalized;
}

function normalizeToolMemoryLifecycle(value: unknown) {
  const normalized = asOptionalEnum(value, MEMORY_LIFECYCLES);
  return normalized;
}

function buildToolMemorySource(params: UnknownRecord, toolContext: UnknownRecord) {
  const source = parseMemorySource(params.source) ?? {
    kind: 'tool' as const,
    actor: 'system' as const,
  };

  return {
    ...source,
    sessionId: source.sessionId ?? asOptionalString(toolContext.sessionId),
    messageId: source.messageId ?? asOptionalString(toolContext.runId),
    channel: source.channel
      ?? asOptionalString(toolContext.messageChannel)
      ?? asOptionalString(toolContext.channelId)
      ?? asOptionalString(toolContext.channel),
  };
}

export function registerMemoryTools({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_store',
      label: 'EverMemory Store',
      description: 'Store durable memory content in EverMemory. If unsure about type or lifecycle, omit them and let EverMemory infer safe defaults.',
      parameters: Type.Object(
        {
          content: Type.String({ description: 'Text to store as memory.' }),
          type: Type.Optional(Type.String({
            description: `Optional memory type. Use one of: ${MEMORY_TYPES.join(', ')}. If unsure, omit this field.`,
          })),
          lifecycle: Type.Optional(Type.String({
            description: `Optional lifecycle. Use one of: ${MEMORY_LIFECYCLES.join(', ')}. If unsure, omit this field.`,
          })),
          scope: scopeSchema,
          source: sourceSchema,
          tags: Type.Optional(Type.Array(Type.String())),
          relatedEntities: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const content = asOptionalString(params.content);
        if (!content) {
          return {
            content: [{ type: 'text', text: 'Missing required field: content' }],
            details: { accepted: false, reason: 'missing_content' },
          };
        }

        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const result = evermemory.evermemoryStore({
          content,
          type: normalizeToolMemoryType(params.type),
          lifecycle: normalizeToolMemoryLifecycle(params.lifecycle),
          scope: mergeScope(baseScope, parseScope(params.scope)),
          source: buildToolMemorySource(params, toolContext),
          tags: asOptionalStringArray(params.tags),
          relatedEntities: asOptionalStringArray(params.relatedEntities),
        });

        return {
          content: [{
            type: 'text',
            text: result.accepted
              ? `Stored [${result.inferredType ?? 'fact'}/${result.inferredLifecycle ?? 'episodic'}]: ${truncate(result.memory?.content ?? content, 80)}`
              : `Memory rejected: ${result.reason}`,
          }],
          details: result,
        };
      },
    }),
    { names: ['evermemory_store', 'memory_store'] },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_recall',
      label: 'EverMemory Recall',
      description: 'Recall relevant memory content from EverMemory.',
      parameters: Type.Object(
        {
          query: Type.String({ description: 'Recall query text.' }),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: toolLimits.recall })),
          mode: retrievalModeSchema,
          scope: scopeSchema,
          createdAfter: Type.Optional(Type.String()),
          createdBefore: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const query = asOptionalString(params.query);
        if (!query) {
          return {
            content: [{ type: 'text', text: 'Missing required field: query' }],
            details: { count: 0, reason: 'missing_query' },
          };
        }

        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const recall = await evermemory.evermemoryRecall({
          query,
          limit: asOptionalInteger(params.limit),
          mode: asOptionalEnum(params.mode, RETRIEVAL_MODES),
          scope: mergeScope(baseScope, parseScope(params.scope)),
          createdAfter: asOptionalString(params.createdAfter),
          createdBefore: asOptionalString(params.createdBefore),
        });

        if (recall.total === 0) {
          return {
            content: [{ type: 'text', text: 'No relevant memories found.' }],
            details: recall,
          };
        }

        const lines = recall.items
          .slice(0, 6)
          .map((item, index) => `${index + 1}. #${item.id.slice(0, 8)} [${item.type}/${item.lifecycle}] ${truncate(item.content, 120)}`);

        return {
          content: [{
            type: 'text',
            text: `Found ${recall.total} memory item(s):\n${lines.join('\n')}`,
          }],
          details: recall,
        };
      },
    }),
    { names: ['evermemory_recall', 'memory_recall'] },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_review',
      label: 'EverMemory Review',
      description: 'Review archived memory candidates and optional rule provenance.',
      parameters: Type.Object(
        {
          scope: scopeSchema,
          query: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: toolLimits.review })),
          includeSuperseded: Type.Optional(Type.Boolean()),
          ruleId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const result = evermemory.evermemoryReview({
          scope: mergeScope(baseScope, parseScope(params.scope)),
          query: asOptionalString(params.query),
          limit: asOptionalInteger(params.limit),
          includeSuperseded: asOptionalBoolean(params.includeSuperseded),
          ruleId: asOptionalString(params.ruleId),
        });
        return {
          content: [{
            type: 'text',
            text: `Review completed: candidates=${result.total}${result.ruleReview ? ', ruleReview=present' : ''}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_review' },
  );

  api.registerTool(
    () => ({
      name: 'evermemory_restore',
      label: 'EverMemory Restore',
      description: 'Review/apply restore plan for archived memories.',
      parameters: Type.Object(
        {
          ids: Type.Array(Type.String()),
          mode: restoreModeSchema,
          approved: Type.Optional(Type.Boolean()),
          targetLifecycle: restoreLifecycleSchema,
          allowSuperseded: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const ids = asOptionalStringArray(params.ids);
        if (!ids || ids.length === 0) {
          return {
            content: [{ type: 'text', text: 'Missing required field: ids' }],
            details: { reason: 'missing_ids' },
          };
        }
        const result = evermemory.evermemoryRestore({
          ids,
          mode: asOptionalEnum(params.mode, RESTORE_MODES),
          approved: asOptionalBoolean(params.approved),
          targetLifecycle: asOptionalEnum(params.targetLifecycle, RESTORE_TARGET_LIFECYCLES),
          allowSuperseded: asOptionalBoolean(params.allowSuperseded),
        });
        return {
          content: [{
            type: 'text',
            text: `Restore ${result.mode}: applied=${result.applied}, restorable=${result.restorable}, restored=${result.restored}, rejected=${result.rejected.length}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_restore' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_edit',
      label: 'EverMemory Edit',
      description: 'Edit, correct, merge, pin, unpin, or delete a stored memory by ID. Use evermemory_browse or evermemory_recall to find memory IDs.',
      parameters: Type.Object(
        {
          memoryId: Type.String({ description: 'ID of the memory to edit (from browse/recall results).' }),
          action: Type.Union(EDIT_ACTIONS.map((a) => Type.Literal(a)), { description: 'update: modify content, delete: soft-delete, correct: create new version superseding old, merge: combine with another memory, pin/unpin: adjust retention priority.' }),
          newContent: Type.Optional(Type.String({ description: 'New content for update/correct actions, or merged content for merge.' })),
          mergeWithId: Type.Optional(Type.String({ description: 'ID of the second memory to merge with when action=merge.' })),
          reason: Type.Optional(Type.String({ description: 'Reason for the edit (for audit trail).' })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const memoryId = asOptionalString(params.memoryId);
        const action = asOptionalEnum(params.action, EDIT_ACTIONS);
        if (!memoryId || !action) {
          return {
            content: [{ type: 'text', text: 'Missing required fields: memoryId, action' }],
            details: { success: false, error: 'missing_params' },
          };
        }
        const callerScope = resolveToolScope(sessionScopes, toolContext);
        const result = await evermemory.evermemoryEdit({
          memoryId,
          action,
          newContent: asOptionalString(params.newContent),
          mergeWithId: asOptionalString(params.mergeWithId),
          reason: asOptionalString(params.reason),
        }, callerScope);
        return {
          content: [{
            type: 'text',
            text: result.success
              ? `Memory ${EDIT_ACTION_LABELS[action]} successfully. Previous: "${truncate(result.previous?.content ?? '', 80)}"`
              : `Edit failed: ${result.error}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_edit' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_browse',
      label: 'EverMemory Browse',
      description: 'Browse your stored memories as an inventory. Shows what EverMemory remembers about you, with at-risk-of-archival flags.',
      parameters: Type.Object(
        {
          type: Type.Optional(Type.Union([...MEMORY_TYPES.map((t) => Type.Literal(t)), Type.Literal('all')])),
          lifecycle: memoryLifecycleSchema,
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
          sortBy: Type.Optional(Type.Union(BROWSE_SORT_BY.map((s) => Type.Literal(s)))),
          sinceMinutesAgo: Type.Optional(Type.Number({ minimum: 1, maximum: 10080 })),
          source: Type.Optional(Type.String({ description: 'Filter by source tag (e.g., "auto_capture")' })),
          scope: scopeSchema,
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const result = evermemory.evermemoryBrowse({
          type: asOptionalEnum(params.type, [...MEMORY_TYPES, 'all'] as readonly string[]) as import('../../tools/browse.js').EverMemoryBrowseToolInput['type'],
          lifecycle: asOptionalEnum(params.lifecycle, MEMORY_LIFECYCLES),
          limit: asOptionalInteger(params.limit),
          sortBy: asOptionalEnum(params.sortBy, BROWSE_SORT_BY),
          sinceMinutesAgo: asOptionalInteger(params.sinceMinutesAgo),
          source: asOptionalString(params.source),
          scope: mergeScope(baseScope, parseScope(params.scope)),
        });
        return {
          content: [{ type: 'text', text: result.summary }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_browse' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_relations',
      label: 'EverMemory Relations',
      description: 'Manage knowledge graph relations between memories. List, add, remove edges, or explore the graph around a memory.',
      parameters: Type.Object(
        {
          action: Type.Union(RELATION_ACTIONS.map((a) => Type.Literal(a)), {
            description: 'Action to perform: list, add, remove, or graph.',
          }),
          memoryId: Type.Optional(Type.String({ description: 'Source memory ID (required for list/add/graph).' })),
          targetId: Type.Optional(Type.String({ description: 'Target memory ID (required for add).' })),
          relationType: Type.Optional(
            Type.Union(RELATION_TYPES.map((t) => Type.Literal(t)), {
              description: 'Relation type (required for add).',
            }),
          ),
          confidence: Type.Optional(Type.Number({ description: 'Confidence score 0-1 (default 0.8).', minimum: 0, maximum: 1 })),
          depth: Type.Optional(Type.Integer({ description: 'Graph traversal depth (default 2).', minimum: 1, maximum: 5 })),
          limit: Type.Optional(Type.Integer({ description: 'Max results.', minimum: 1 })),
          relationId: Type.Optional(Type.String({ description: 'Relation ID (for remove action).' })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const result = evermemory.evermemoryRelations({
          action: asOptionalEnum(params.action, RELATION_ACTIONS) ?? 'list',
          memoryId: asOptionalString(params.memoryId),
          targetId: asOptionalString(params.targetId),
          relationType: asOptionalEnum(params.relationType, RELATION_TYPES),
          confidence: typeof params.confidence === 'number' ? params.confidence : undefined,
          depth: asOptionalInteger(params.depth),
          limit: asOptionalInteger(params.limit),
          relationId: asOptionalString(params.relationId),
        });
        const summary = result.action === 'graph'
          ? `Graph: ${result.total} node(s) found.`
          : result.action === 'list'
            ? `Found ${result.total} relation(s).`
            : result.action === 'add'
              ? result.added ? `Added ${result.added.relationType} relation.` : 'Failed to add relation (missing params).'
              : result.removed ? 'Relation removed.' : 'Relation not found.';
        return {
          content: [{ type: 'text', text: summary }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_relations' },
  );
}

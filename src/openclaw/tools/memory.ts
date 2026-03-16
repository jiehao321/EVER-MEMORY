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

const EDIT_ACTIONS = ['update', 'delete', 'correct'] as const;
const BROWSE_SORT_BY = ['recent', 'importance', 'accessed'] as const;

export function registerMemoryTools({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_store',
      label: 'EverMemory Store',
      description: 'Store durable memory content in EverMemory.',
      parameters: Type.Object(
        {
          content: Type.String({ description: 'Text to store as memory.' }),
          type: memoryTypeSchema,
          lifecycle: memoryLifecycleSchema,
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
          type: asOptionalEnum(params.type, MEMORY_TYPES),
          lifecycle: asOptionalEnum(params.lifecycle, MEMORY_LIFECYCLES),
          scope: mergeScope(baseScope, parseScope(params.scope)),
          source: parseMemorySource(params.source),
          tags: asOptionalStringArray(params.tags),
          relatedEntities: asOptionalStringArray(params.relatedEntities),
        });

        return {
          content: [{
            type: 'text',
            text: result.accepted
              ? `Stored memory: ${truncate(result.memory?.content ?? content, 100)}`
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
        });

        if (recall.total === 0) {
          return {
            content: [{ type: 'text', text: 'No relevant memories found.' }],
            details: recall,
          };
        }

        const lines = recall.items
          .slice(0, 6)
          .map((item, index) => `${index + 1}. [${item.type}/${item.lifecycle}] ${truncate(item.content, 140)}`);

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
      description: 'Edit, correct, or delete a stored memory by ID. Use evermemory_browse or evermemory_recall to find memory IDs.',
      parameters: Type.Object(
        {
          memoryId: Type.String({ description: 'ID of the memory to edit (from browse/recall results).' }),
          action: Type.Union(EDIT_ACTIONS.map((a) => Type.Literal(a)), { description: 'update: modify content, delete: soft-delete, correct: create new version superseding old.' }),
          newContent: Type.Optional(Type.String({ description: 'New content for update/correct actions.' })),
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
          reason: asOptionalString(params.reason),
        }, callerScope);
        return {
          content: [{
            type: 'text',
            text: result.success
              ? `Memory ${action}d successfully. Previous: "${truncate(result.previous?.content ?? '', 80)}"`
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
}

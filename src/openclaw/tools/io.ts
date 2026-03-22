import { Type } from '@sinclair/typebox';
import type { OpenClawRegistrationContext, UnknownRecord } from '../shared.js';
import type { EverMemorySnapshotV1 } from '../../types.js';
import {
  asOptionalBoolean,
  asOptionalEnum,
  asOptionalInteger,
  importModeSchema,
  IMPORT_MODES,
  mergeScope,
  parseScope,
  resolveToolScope,
  scopeSchema,
  toolLimits,
} from '../shared.js';

function isMemorySnapshotItemArray(value: unknown): value is EverMemorySnapshotV1['items'] {
  return Array.isArray(value);
}

function isEverMemorySnapshotV1(value: unknown): value is EverMemorySnapshotV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.format === 'evermemory.snapshot.v1' &&
    typeof candidate.generatedAt === 'string' &&
    typeof candidate.total === 'number' &&
    isMemorySnapshotItemArray(candidate.items)
  );
}

export function registerIOTools({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_export',
      label: 'EverMemory Export',
      description: 'Export memory as snapshot, JSON, or Markdown for review, backup, or migration.',
      parameters: Type.Object(
        {
          scope: scopeSchema,
          format: Type.Optional(Type.Union([
            Type.Literal('json', { description: 'Export as lightweight JSON array.' }),
            Type.Literal('markdown', { description: 'Export as Markdown sections.' }),
          ])),
          includeArchived: Type.Optional(Type.Boolean({ description: 'Include archived memories in the export.' })),
          limit: Type.Optional(Type.Number({
            minimum: 1,
            maximum: toolLimits.export,
            description: 'Maximum number of memories to export.',
          })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const scope = mergeScope(baseScope, parseScope(params.scope));
        const format = asOptionalEnum(params.format, ['json', 'markdown'] as const);
        if (format) {
          const result = evermemory.export(format, scope, {
            includeArchived: asOptionalBoolean(params.includeArchived),
            limit: asOptionalInteger(params.limit),
          });
          return {
            content: [{
              type: 'text',
              text: result.content,
            }],
            details: result,
          };
        }
        const result = evermemory.evermemoryExport({
          scope,
          includeArchived: asOptionalBoolean(params.includeArchived),
          limit: asOptionalInteger(params.limit),
        });
        return {
          content: [{
            type: 'text',
            text: `Snapshot exported: total=${result.summary.exported}, includeArchived=${result.summary.includeArchived}`,
          }],
          details: result,
        };
      },
    }),
    { names: ['evermemory_export', 'memory_export'] },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_import',
      label: 'EverMemory Import',
      description: 'Import memory from snapshot, JSON, or Markdown with validation and duplicate skipping.',
      parameters: Type.Object(
        {
          content: Type.Optional(Type.String({ description: 'JSON or Markdown content to import.' })),
          format: Type.Optional(Type.Union([
            Type.Literal('json', { description: 'Parse lightweight JSON memory array.' }),
            Type.Literal('markdown', { description: 'Parse Markdown memory blocks.' }),
          ])),
          snapshot: Type.Any(),
          mode: importModeSchema,
          approved: Type.Optional(Type.Boolean({ description: 'Approve applying snapshot import changes.' })),
          allowOverwrite: Type.Optional(Type.Boolean({ description: 'Allow snapshot import to overwrite existing IDs.' })),
          scopeOverride: scopeSchema,
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const format = asOptionalEnum(params.format, ['json', 'markdown'] as const);
        const content = typeof params.content === 'string' ? params.content : undefined;
        if (format && content !== undefined) {
          const baseScope = resolveToolScope(sessionScopes, toolContext);
          const approvedValue = asOptionalBoolean(params.approved);
          if (approvedValue === false) {
            return {
              content: [{
                type: 'text',
                text: `Import preview (approved=false): content provided as ${format}, ${content.length} chars. Set approved=true to apply.`,
              }],
              details: {
                mode: 'review',
                applied: false,
                format,
                contentLength: content.length,
              },
            };
          }
          const result = await evermemory.import(
            content,
            format,
            mergeScope(baseScope, parseScope(params.scopeOverride)),
          );
          return {
            content: [{
              type: 'text',
              text: `Import completed: imported=${result.imported}, skipped=${result.skipped}, errors=${result.errors.length}`,
            }],
            details: result,
          };
        }
        if (!isEverMemorySnapshotV1(params.snapshot)) {
          return {
            content: [{ type: 'text', text: 'Missing required field: snapshot or content+format' }],
            details: { reason: 'missing_snapshot' },
          };
        }
        const result = evermemory.evermemoryImport({
          snapshot: params.snapshot,
          mode: asOptionalEnum(params.mode, IMPORT_MODES),
          approved: asOptionalBoolean(params.approved),
          allowOverwrite: asOptionalBoolean(params.allowOverwrite),
          scopeOverride: parseScope(params.scopeOverride),
        });
        return {
          content: [{
            type: 'text',
            text: `Import ${result.mode}: applied=${result.applied}, total=${result.total}, imported=${result.imported}, updated=${result.updated}, rejected=${result.rejected.length}`,
          }],
          details: result,
        };
      },
    }),
    { names: ['evermemory_import', 'memory_import'] },
  );
}

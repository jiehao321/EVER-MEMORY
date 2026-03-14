import { Type } from '@sinclair/typebox';
import type { OpenClawRegistrationContext, UnknownRecord } from '../shared.js';
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

export function registerIOTools({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_export',
      label: 'EverMemory Export',
      description: 'Export memory snapshot for review or migration.',
      parameters: Type.Object(
        {
          scope: scopeSchema,
          includeArchived: Type.Optional(Type.Boolean()),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: toolLimits.export })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const result = evermemory.evermemoryExport({
          scope: mergeScope(baseScope, parseScope(params.scope)),
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
    { name: 'evermemory_export' },
  );

  api.registerTool(
    () => ({
      name: 'evermemory_import',
      label: 'EverMemory Import',
      description: 'Review/apply memory snapshot import with safety checks.',
      parameters: Type.Object(
        {
          snapshot: Type.Any(),
          mode: importModeSchema,
          approved: Type.Optional(Type.Boolean()),
          allowOverwrite: Type.Optional(Type.Boolean()),
          scopeOverride: scopeSchema,
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        if (typeof params.snapshot !== 'object' || params.snapshot === null || Array.isArray(params.snapshot)) {
          return {
            content: [{ type: 'text', text: 'Missing required field: snapshot' }],
            details: { reason: 'missing_snapshot' },
          };
        }
        const result = evermemory.evermemoryImport({
          snapshot: params.snapshot as any,
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
    { name: 'evermemory_import' },
  );
}

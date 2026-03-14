import { Type } from '@sinclair/typebox';
import type { OpenClawRegistrationContext, UnknownRecord } from '../shared.js';
import {
  asOptionalEnum,
  asOptionalInteger,
  asOptionalString,
  explainTopicSchema,
  EXPLAIN_TOPICS,
  mergeScope,
  parseScope,
  resolveToolScope,
  scopeSchema,
  toolLimits,
} from '../shared.js';

export function registerBriefingTools({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_status',
      label: 'EverMemory Status',
      description: 'Return current EverMemory system status summary.',
      parameters: Type.Object(
        {
          userId: Type.Optional(Type.String()),
          sessionId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const runtimeSessionId = asOptionalString(toolContext.sessionId);
        const status = evermemory.evermemoryStatus({
          userId: asOptionalString(params.userId),
          sessionId: asOptionalString(params.sessionId) ?? runtimeSessionId,
        });
        return {
          content: [{
            type: 'text',
            text: `memoryCount=${status.memoryCount}, active=${status.activeMemoryCount ?? 0}, archived=${status.archivedMemoryCount ?? 0}`,
          }],
          details: status,
        };
      },
    }),
    { name: 'evermemory_status' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_briefing',
      label: 'EverMemory Briefing',
      description: 'Build current memory briefing sections for the active scope.',
      parameters: Type.Object(
        {
          sessionId: Type.Optional(Type.String()),
          scope: scopeSchema,
          tokenTarget: Type.Optional(Type.Number({ minimum: 1 })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const briefing = evermemory.evermemoryBriefing({
          sessionId: asOptionalString(params.sessionId) ?? asOptionalString(toolContext.sessionId),
          scope: mergeScope(baseScope, parseScope(params.scope)),
          tokenTarget: asOptionalInteger(params.tokenTarget),
        });
        return {
          content: [{
            type: 'text',
            text: `Briefing generated: sections(identity=${briefing.sections.identity.length}, constraints=${briefing.sections.constraints.length}, continuity=${briefing.sections.recentContinuity.length}, projects=${briefing.sections.activeProjects.length})`,
          }],
          details: briefing,
        };
      },
    }),
    { name: 'evermemory_briefing' },
  );

  api.registerTool(
    () => ({
      name: 'evermemory_explain',
      label: 'EverMemory Explain',
      description: 'Explain write/retrieval/rule decisions from debug evidence.',
      parameters: Type.Object(
        {
          topic: explainTopicSchema,
          entityId: Type.Optional(Type.String()),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: toolLimits.explain })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const result = evermemory.evermemoryExplain({
          topic: asOptionalEnum(params.topic, EXPLAIN_TOPICS),
          entityId: asOptionalString(params.entityId),
          limit: asOptionalInteger(params.limit),
        });
        return {
          content: [{
            type: 'text',
            text: `Explain topic=${result.topic}, items=${result.total}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_explain' },
  );
}

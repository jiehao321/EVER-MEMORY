import { Type } from '@sinclair/typebox';
import { CONSOLIDATION_MODES, INTENT_TYPES } from '../../constants.js';
import type { OpenClawRegistrationContext, UnknownRecord } from '../shared.js';
import {
  asOptionalBoolean,
  asOptionalEnum,
  asOptionalInteger,
  asOptionalString,
  asOptionalStringArray,
  consolidationModeSchema,
  intentTypeSchema,
  mergeScope,
  parseScope,
  reflectModeSchema,
  REFLECT_MODES,
  resolveToolScope,
  rulesActionSchema,
  RULE_MUTATION_ACTIONS,
  scopeSchema,
  toolLimits,
} from '../shared.js';

export function registerProfileTools({ api, evermemory, sessionScopes }: OpenClawRegistrationContext): void {
  api.registerTool(
    () => ({
      name: 'evermemory_profile',
      label: 'EverMemory Profile',
      description: 'Read or recompute projected user profile.',
      parameters: Type.Object(
        {
          userId: Type.Optional(Type.String()),
          recompute: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const result = evermemory.evermemoryProfile({
          userId: asOptionalString(params.userId),
          recompute: asOptionalBoolean(params.recompute),
        });
        return {
          content: [{
            type: 'text',
            text: `Profile source=${result.source}, exists=${result.profile ? 'yes' : 'no'}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_profile' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'profile_onboard',
      label: 'Profile Onboard',
      description: 'Run the first-use onboarding questionnaire and persist answers into the user profile.',
      parameters: Type.Object(
        {
          userId: Type.Optional(Type.String()),
          responses: Type.Optional(Type.Array(Type.Object(
            {
              questionId: Type.String(),
              answer: Type.String(),
            },
            { additionalProperties: false },
          ))),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const scope = resolveToolScope(sessionScopes, toolContext);
        const userId = asOptionalString(params.userId) ?? scope.userId;
        if (!userId) {
          return {
            content: [{ type: 'text', text: 'Missing required field: userId' }],
            details: { reason: 'missing_user_id' },
          };
        }
        const responses = Array.isArray(params.responses)
          ? params.responses
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .map((item) => ({
              questionId: asOptionalString(item.questionId) ?? '',
              answer: asOptionalString(item.answer) ?? '',
            }))
            .filter((item) => item.questionId.length > 0)
          : undefined;
        const result = await evermemory.evermemoryOnboard({
          userId,
          responses,
        });
        return {
          content: [{
            type: 'text',
            text: result.questions.length > 0
              ? `${result.welcomeMessage ?? ''}\nOnboarding required: ${result.questions.length} question(s) pending.`
              : result.completionMessage
                ?? result.welcomeMessage
                ?? `Onboarding completed=${result.result?.completed ?? false}, profileUpdated=${result.result?.profileUpdated ?? false}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'profile_onboard' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_intent',
      label: 'EverMemory Intent',
      description: 'Analyze a message intent and persist deterministic intent record.',
      parameters: Type.Object(
        {
          message: Type.String(),
          sessionId: Type.Optional(Type.String()),
          messageId: Type.Optional(Type.String()),
          scope: scopeSchema,
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const message = asOptionalString(params.message);
        if (!message) {
          return {
            content: [{ type: 'text', text: 'Missing required field: message' }],
            details: { reason: 'missing_message' },
          };
        }
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const intent = evermemory.evermemoryIntent({
          message,
          sessionId: asOptionalString(params.sessionId) ?? asOptionalString(toolContext.sessionId),
          messageId: asOptionalString(params.messageId),
          scope: mergeScope(baseScope, parseScope(params.scope)),
        });
        return {
          content: [{
            type: 'text',
            text: `Intent analyzed: type=${intent.intent.type}, urgency=${intent.signals.urgency}, memoryNeed=${intent.signals.memoryNeed}`,
          }],
          details: intent,
        };
      },
    }),
    { name: 'evermemory_intent' },
  );

  api.registerTool(
    () => ({
      name: 'evermemory_reflect',
      label: 'EverMemory Reflect',
      description: 'Generate reflection records and candidate behavior rules.',
      parameters: Type.Object(
        {
          sessionId: Type.Optional(Type.String()),
          mode: reflectModeSchema,
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const result = evermemory.evermemoryReflect({
          sessionId: asOptionalString(params.sessionId),
          mode: asOptionalEnum(params.mode, REFLECT_MODES),
        });
        return {
          content: [{
            type: 'text',
            text: `Reflection completed: created=${result.summary.createdReflections}, candidates=${result.candidateRules.length}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_reflect' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_rules',
      label: 'EverMemory Rules',
      description: 'Load active behavior rules or mutate a specific rule lifecycle state.',
      parameters: Type.Object(
        {
          scope: scopeSchema,
          intentType: intentTypeSchema,
          channel: Type.Optional(Type.String()),
          contexts: Type.Optional(Type.Array(Type.String())),
          limit: Type.Optional(Type.Number({ minimum: 1, maximum: toolLimits.rules })),
          includeInactive: Type.Optional(Type.Boolean()),
          includeDeprecated: Type.Optional(Type.Boolean()),
          includeFrozen: Type.Optional(Type.Boolean()),
          action: rulesActionSchema,
          ruleId: Type.Optional(Type.String()),
          reason: Type.Optional(Type.String()),
          reflectionId: Type.Optional(Type.String()),
          replacementRuleId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const action = asOptionalEnum(params.action, RULE_MUTATION_ACTIONS);
        const ruleId = asOptionalString(params.ruleId);
        if (action && !ruleId) {
          return {
            content: [{ type: 'text', text: 'Missing required field: ruleId (when action is provided)' }],
            details: { reason: 'missing_rule_id_for_action', action },
          };
        }
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const result = evermemory.evermemoryRules({
          scope: mergeScope(baseScope, parseScope(params.scope)),
          intentType: asOptionalEnum(params.intentType, INTENT_TYPES),
          channel: asOptionalString(params.channel),
          contexts: asOptionalStringArray(params.contexts),
          limit: asOptionalInteger(params.limit),
          includeInactive: asOptionalBoolean(params.includeInactive),
          includeDeprecated: asOptionalBoolean(params.includeDeprecated),
          includeFrozen: asOptionalBoolean(params.includeFrozen),
          action,
          ruleId,
          reason: asOptionalString(params.reason),
          reflectionId: asOptionalString(params.reflectionId),
          replacementRuleId: asOptionalString(params.replacementRuleId),
        });
        return {
          content: [{
            type: 'text',
            text: result.mutation
              ? `Rule mutation: action=${result.mutation.action}, changed=${result.mutation.changed}, reason=${result.mutation.reason}`
              : `Loaded ${result.total} active rule(s).`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_rules' },
  );

  api.registerTool(
    (toolContext: UnknownRecord) => ({
      name: 'evermemory_consolidate',
      label: 'EverMemory Consolidate',
      description: 'Run manual lifecycle maintenance and consolidation pass.',
      parameters: Type.Object(
        {
          mode: consolidationModeSchema,
          scope: scopeSchema,
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId: string, params: UnknownRecord) {
        const baseScope = resolveToolScope(sessionScopes, toolContext);
        const result = evermemory.evermemoryConsolidate({
          mode: asOptionalEnum(params.mode, CONSOLIDATION_MODES),
          scope: mergeScope(baseScope, parseScope(params.scope)),
        });
        return {
          content: [{
            type: 'text',
            text: `Consolidation done: mode=${result.mode}, processed=${result.processed}, merged=${result.merged}, archivedStale=${result.archivedStale}`,
          }],
          details: result,
        };
      },
    }),
    { name: 'evermemory_consolidate' },
  );
}

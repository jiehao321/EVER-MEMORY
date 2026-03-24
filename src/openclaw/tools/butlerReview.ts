import { Type } from '@sinclair/typebox';
import type { AttentionService } from '../../core/butler/attention/service.js';
import type { ButlerStateManager } from '../../core/butler/state.js';
import type { ButlerFeedbackRepository } from '../../storage/butlerFeedbackRepo.js';
import type { ButlerInsightRepository } from '../../storage/butlerInsightRepo.js';
import { butlerReview } from '../../tools/butlerReview.js';
import type { OpenClawPluginApi, UnknownRecord } from '../shared.js';
import { asOptionalEnum, asOptionalInteger, asOptionalString } from '../shared.js';

const REVIEW_ACTIONS = ['list', 'accept', 'reject', 'snooze', 'dismiss'] as const;

export function registerButlerReviewTool(context: {
  api: OpenClawPluginApi;
  feedbackRepo: ButlerFeedbackRepository;
  insightRepo: ButlerInsightRepository;
  attentionService: AttentionService;
  stateManager: ButlerStateManager;
}): void {
  context.api.registerTool(
    () => ({
      name: 'butler_review',
      label: 'Butler Review',
      description: 'Review Butler insights, record feedback, and update overlay acceptance metrics.',
      parameters: Type.Object(
        {
          action: Type.Union(REVIEW_ACTIONS.map((value) => Type.Literal(value))),
          insightId: Type.Optional(Type.String()),
          snoozeHours: Type.Optional(Type.Integer({ minimum: 1 })),
          reason: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      execute: async (_toolCallId: string, params: UnknownRecord) => {
        const result = await butlerReview({
          attentionService: context.attentionService,
          feedbackRepo: context.feedbackRepo,
          insightRepo: context.insightRepo,
          stateManager: context.stateManager,
          action: asOptionalEnum(params.action, REVIEW_ACTIONS) ?? 'list',
          insightId: asOptionalString(params.insightId),
          snoozeHours: asOptionalInteger(params.snoozeHours),
          reason: asOptionalString(params.reason),
        });
        return {
          content: [{ type: 'text', text: result.message }],
          details: result,
        };
      },
    }),
    { name: 'butler_review' },
  );
}

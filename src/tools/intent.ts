import type { IntentService } from '../core/intent/service.js';
import type { EverMemoryIntentToolInput } from '../types.js';

export function evermemoryIntent(
  intentService: IntentService,
  input: EverMemoryIntentToolInput,
) {
  return intentService.analyze({
    text: input.message,
    sessionId: input.sessionId,
    messageId: input.messageId,
    scope: input.scope,
  });
}

import type { IntentRecord } from './intent.js';
import type { MemoryScope } from './memory.js';
import type { RetrievalMode } from './primitives.js';

export interface RecallForIntentRequest {
  intent: IntentRecord;
  scope?: MemoryScope;
  query?: string;
  mode?: RetrievalMode;
  limit?: number;
}

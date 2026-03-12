import type { DebugEventKind } from './primitives.js';

export interface DebugEvent {
  id: string;
  createdAt: string;
  kind: DebugEventKind;
  entityId?: string;
  payload: Record<string, unknown>;
}

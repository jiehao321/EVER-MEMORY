import type { ButlerMessage } from '../protocol/types.js';

export interface ButlerTransport {
  start(onMessage: (message: ButlerMessage) => Promise<ButlerMessage | null>): void;
  send(message: ButlerMessage): void;
  stop(): void;
}

import type { ButlerMessage } from '../protocol/types.js';
import type { ButlerTransport } from './types.js';

export class InMemoryTransport implements ButlerTransport {
  private handler?: (message: ButlerMessage) => Promise<ButlerMessage | null>;

  start(onMessage: (message: ButlerMessage) => Promise<ButlerMessage | null>): void {
    this.handler = onMessage;
  }

  send(_message: ButlerMessage): void {
    return;
  }

  stop(): void {
    this.handler = undefined;
  }

  async ingest(message: ButlerMessage): Promise<ButlerMessage | null> {
    if (!this.handler) {
      return null;
    }
    return this.handler(message);
  }
}

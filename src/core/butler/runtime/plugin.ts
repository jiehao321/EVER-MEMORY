import type { ButlerAgent } from '../agent.js';
import type { ClockPort } from '../ports/clock.js';
import type { ButlerStoragePort } from '../ports/storage.js';
import type { ButlerMessage } from '../protocol/types.js';
import { ProtocolHandler } from '../protocol/handler.js';
import type { ButlerScheduler } from '../scheduler/service.js';
import type { ButlerLogger } from '../types.js';
import { InMemoryTransport } from '../transports/inmemory.js';

export interface PluginRuntimeOptions {
  agent: ButlerAgent;
  scheduler: ButlerScheduler;
  storage: ButlerStoragePort;
  clock: ClockPort;
  logger?: ButlerLogger;
}

export class PluginRuntime {
  private readonly handler: ProtocolHandler;
  private readonly transport: InMemoryTransport;

  constructor(options: PluginRuntimeOptions) {
    this.handler = new ProtocolHandler(options);
    this.transport = new InMemoryTransport();
    this.transport.start((message: ButlerMessage) => this.handler.handle(message));
  }

  async ingest(message: ButlerMessage): Promise<ButlerMessage | null> {
    return this.transport.ingest(message);
  }

  stop(): void {
    this.transport.stop();
  }
}

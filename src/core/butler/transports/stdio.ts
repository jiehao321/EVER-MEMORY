import { createInterface } from 'node:readline';
import type { ButlerMessage } from '../protocol/types.js';
import type { ButlerLogger } from '../types.js';
import type { ButlerTransport } from './types.js';

export class StdioTransport implements ButlerTransport {
  private rl?: ReturnType<typeof createInterface>;
  private handler?: (message: ButlerMessage) => Promise<ButlerMessage | null>;

  constructor(
    private readonly input: NodeJS.ReadableStream = process.stdin,
    private readonly output: NodeJS.WritableStream = process.stdout,
    private readonly logger?: ButlerLogger,
  ) {}

  start(onMessage: (message: ButlerMessage) => Promise<ButlerMessage | null>): void {
    this.handler = onMessage;
    this.rl = createInterface({ input: this.input });
    this.rl.on('line', (line: string) => {
      this.handleLine(line).catch((error: unknown) => {
        this.logger?.error('StdioTransport line handling failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    });
  }

  send(message: ButlerMessage): void {
    this.output.write(`${JSON.stringify(message)}\n`);
  }

  stop(): void {
    this.rl?.close();
    this.rl = undefined;
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let parsed: ButlerMessage;
    try {
      parsed = JSON.parse(trimmed) as ButlerMessage;
    } catch {
      this.logger?.warn('StdioTransport: invalid JSON line', {
        line: trimmed.slice(0, 100),
      });
      return;
    }

    if (!this.handler) {
      return;
    }

    const response = await this.handler(parsed);
    if (response) {
      this.send(response);
    }
  }
}

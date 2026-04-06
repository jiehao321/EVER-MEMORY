import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { ButlerMessage } from '../protocol/types.js';
import type { ButlerLogger } from '../types.js';
import type { ButlerTransport } from './types.js';

export interface HttpTransportConfig {
  port: number;
  host?: string;
}

export class HttpTransport implements ButlerTransport {
  private server?: Server;
  private readonly sseClients = new Set<ServerResponse>();
  private handler?: (message: ButlerMessage) => Promise<ButlerMessage | null>;

  constructor(
    private readonly config: HttpTransportConfig,
    private readonly logger?: ButlerLogger,
  ) {}

  start(onMessage: (message: ButlerMessage) => Promise<ButlerMessage | null>): void {
    this.handler = onMessage;
    this.server = createServer((req, res) => {
      this.handleRequest(req, res).catch((error: unknown) => {
        this.logger?.error('HttpTransport request handling failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        if (!res.writableEnded) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });
    });
    this.server.listen(this.config.port, this.config.host ?? '127.0.0.1', () => {
      this.logger?.info('HttpTransport started', {
        port: this.config.port,
        host: this.config.host ?? '127.0.0.1',
      });
    });
  }

  send(message: ButlerMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  }

  stop(): void {
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    this.server?.close();
    this.server = undefined;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      this.sseClients.add(res);
      req.on('close', () => {
        this.sseClients.delete(res);
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/message') {
      const body = await this.readBody(req);
      let message: ButlerMessage;
      try {
        message = JSON.parse(body) as ButlerMessage;
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }

      if (!this.handler) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not ready' }));
        return;
      }

      const response = await this.handler(message);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response ?? { ok: true }));
      return;
    }

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }

  private readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  }
}

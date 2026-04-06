#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { createStandaloneStorage } from './adapters/sqlite.js';
import { ButlerRuntime } from './runtime/standalone.js';
import { HttpTransport } from './transports/http.js';
import { StdioTransport } from './transports/stdio.js';
import type { ButlerTransport } from './transports/types.js';
import type { ButlerLogger } from './types.js';

const logger: ButlerLogger = {
  debug: (message, meta) => console.error(`[DEBUG] ${message}`, meta ?? ''),
  info: (message, meta) => console.error(`[INFO] ${message}`, meta ?? ''),
  warn: (message, meta) => console.error(`[WARN] ${message}`, meta ?? ''),
  error: (message, meta) => console.error(`[ERROR] ${message}`, meta ?? ''),
};

function main(): void {
  const { values } = parseArgs({
    options: {
      db: { type: 'string', default: './butler.db' },
      transport: { type: 'string', default: 'stdio' },
      port: { type: 'string', default: '3100' },
      host: { type: 'string', default: '127.0.0.1' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.error(`Butler Agent — Standalone Runtime

Usage: butler [options]

Options:
  --db <path>           SQLite database path (default: ./butler.db)
  --transport <type>    Transport type: stdio | http (default: stdio)
  --port <number>       HTTP port (default: 3100)
  --host <address>      HTTP host (default: 127.0.0.1)
  -h, --help            Show this help message
`);
    process.exit(0);
  }

  const { storage } = createStandaloneStorage(values.db ?? './butler.db');

  const clock = {
    now: () => Date.now(),
    isoNow: () => new Date().toISOString(),
  };

  let transport: ButlerTransport;
  if (values.transport === 'http') {
    transport = new HttpTransport(
      {
        port: Number.parseInt(values.port ?? '3100', 10),
        host: values.host ?? '127.0.0.1',
      },
      logger,
    );
  } else {
    transport = new StdioTransport(process.stdin, process.stdout, logger);
  }

  const runtime = new ButlerRuntime({
    storage,
    clock,
    transport,
    logger,
  });

  runtime.start();

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down...');
    runtime.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down...');
    runtime.stop();
    process.exit(0);
  });
}

main();

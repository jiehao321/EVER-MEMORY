import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

export interface DatabaseHandle {
  path: string;
  connection: Database.Database;
}

export function resolveDatabasePath(storagePath: string): string {
  return resolve(storagePath);
}

export function openDatabase(storagePath: string): DatabaseHandle {
  const path = resolveDatabasePath(storagePath);
  mkdirSync(dirname(path), { recursive: true });

  const connection = new Database(path);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');

  return { path, connection };
}

export function closeDatabase(handle: DatabaseHandle): void {
  handle.connection.close();
}

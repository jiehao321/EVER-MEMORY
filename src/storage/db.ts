import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { StorageError } from '../errors.js';

export interface DatabaseHandle {
  path: string;
  connection: Database.Database;
}

export function resolveDatabasePath(storagePath: string): string {
  if (storagePath === ':memory:') {
    return storagePath;
  }
  return resolve(storagePath);
}

export function openDatabase(storagePath: string): DatabaseHandle {
  const path = resolveDatabasePath(storagePath);
  try {
    mkdirSync(dirname(path), { recursive: true });

    const connection = new Database(path);
    connection.pragma('journal_mode = WAL');
    connection.pragma('foreign_keys = ON');

    return { path, connection };
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError('Failed to open database.', {
      code: 'STORAGE_OPEN_FAILED',
      context: { path },
      cause: error,
    });
  }
}

export function closeDatabase(handle: DatabaseHandle): void {
  try {
    handle.connection.close();
  } catch (error) {
    if (error instanceof StorageError) {
      throw error;
    }
    throw new StorageError('Failed to close database.', {
      code: 'STORAGE_CLOSE_FAILED',
      context: { path: handle.path },
      cause: error,
    });
  }
}

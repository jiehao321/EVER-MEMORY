import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function createTempDbPath(name) {
    const dir = join(tmpdir(), `evermemory-${name}-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    return join(dir, 'evermemory.db');
}

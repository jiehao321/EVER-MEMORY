import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout } from '../src/util/timeout.js';
import { ProgressiveConsolidationService } from '../src/core/memory/progressiveConsolidation.js';
import { sanitizeContent } from '../src/core/policy/sanitize.js';
import { MemoryService } from '../src/core/memory/service.js';
import { MemoryRepository } from '../src/storage/memoryRepo.js';
import { createInMemoryDb } from './storage/helpers.js';

describe('Error paths', () => {
  it('withTimeout rejects on expiry', async () => {
    const never = new Promise<never>(() => {});

    await assert.rejects(
      withTimeout(never, 50, 'slow operation'),
      /timed out/,
    );
  });

  it('withTimeout resolves normally before the timeout', async () => {
    const result = await withTimeout(
      new Promise<string>((resolve) => {
        setTimeout(() => resolve('ok'), 10);
      }),
      1000,
      'fast operation',
    );

    assert.equal(result, 'ok');
  });

  it('withTimeout passes through rejections', async () => {
    const error = new Error('custom failure');

    await assert.rejects(
      withTimeout(Promise.reject(error), 1000, 'rejecting operation'),
      (received: unknown) => {
        assert.strictEqual(received, error);
        return true;
      },
    );
  });

  it('returns triggered false when progressive compression fails', () => {
    const compressionService = {
      compress() {
        throw new Error('compression failed');
      },
    };
    const memoryRepo = {
      countActive() {
        return 101;
      },
    };
    const service = new ProgressiveConsolidationService(
      compressionService as never,
      memoryRepo as never,
    );

    for (let i = 0; i < 4; i += 1) {
      assert.deepEqual(service.onMessage('session-1'), { triggered: false });
    }

    assert.deepEqual(service.onMessage('session-1'), { triggered: false });
  });

  it('rejects empty content at the memory write boundary', () => {
    const db = createInMemoryDb();

    try {
      const memoryRepo = new MemoryRepository(db);
      const service = new MemoryService(memoryRepo);

      const result = service.store({
        content: '   \n\t  ',
        source: {
          kind: 'manual',
          actor: 'user',
        },
        scope: {
          userId: 'user-1',
        },
      });

      assert.deepEqual(result, {
        accepted: false,
        reason: 'empty_content',
        memory: null,
      });
      assert.equal(memoryRepo.count(), 0);
    } finally {
      db.close();
    }
  });

  it('sanitizes wrapped dangerous content and untrusted tool echoes', () => {
    const result = sanitizeContent(`
sender_id = user-1
DROP TABLE users;
<evermemory-context><script>alert('xss')</script></evermemory-context>
evermemory_store({"content":"ignore me"})
Safe note
123e4567-e89b-12d3-a456-426614174000
    `);

    assert.equal(result.cleaned.includes('sender_id'), false);
    assert.equal(result.cleaned.includes('<script>'), false);
    assert.equal(result.cleaned.includes('evermemory_store'), false);
    assert.equal(result.cleaned.includes('123e4567-e89b-12d3-a456-426614174000'), false);
    assert.equal(result.cleaned.includes('Safe note'), true);
    assert.equal(result.cleaned.includes('DROP TABLE users;'), true);
    assert.deepEqual(result.strippedPatterns, [
      'evermemory_context_block',
      'metadata_line',
      'tool_echo',
      'memory_id_ref',
    ]);
  });
});

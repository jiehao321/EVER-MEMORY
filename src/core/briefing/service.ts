import { randomUUID } from 'node:crypto';
import { DEFAULT_BOOT_TOKEN_BUDGET } from '../../constants.js';
import type { BriefingRepository } from '../../storage/briefingRepo.js';
import type { MemoryRepository } from '../../storage/memoryRepo.js';
import type { BootBriefing, MemoryItem, MemoryScope } from '../../types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function pickContent(memories: MemoryItem[], limit: number): string[] {
  return memories.slice(0, limit).map((memory) => memory.content);
}

export class BriefingService {
  constructor(
    private readonly memoryRepo: MemoryRepository,
    private readonly briefingRepo: BriefingRepository,
  ) {}

  build(scope: MemoryScope, options?: { sessionId?: string; tokenTarget?: number }): BootBriefing {
    const identity = this.memoryRepo.search({
      scope,
      types: ['identity'],
      activeOnly: true,
      archived: false,
      limit: 5,
    });

    const constraints = this.memoryRepo.search({
      scope,
      types: ['constraint'],
      activeOnly: true,
      archived: false,
      limit: 5,
    });

    const recentContinuity = this.memoryRepo.search({
      scope,
      lifecycles: ['semantic', 'episodic'],
      activeOnly: true,
      archived: false,
      limit: 8,
    });

    const activeProjects = this.memoryRepo.search({
      scope,
      types: ['project'],
      activeOnly: true,
      archived: false,
      limit: 5,
    });

    const briefing: BootBriefing = {
      id: randomUUID(),
      sessionId: options?.sessionId,
      userId: scope.userId,
      generatedAt: nowIso(),
      sections: {
        identity: pickContent(identity, 3),
        constraints: pickContent(constraints, 5),
        recentContinuity: pickContent(recentContinuity, 5),
        activeProjects: pickContent(activeProjects, 5),
      },
      tokenTarget: options?.tokenTarget ?? DEFAULT_BOOT_TOKEN_BUDGET,
      actualApproxTokens: 0,
    };

    briefing.actualApproxTokens = Math.ceil(JSON.stringify(briefing.sections).length / 4);
    this.briefingRepo.save(briefing);
    return briefing;
  }
}

export interface BootBriefingSections {
  identity: string[];
  constraints: string[];
  recentContinuity: string[];
  activeProjects: string[];
}

export interface BootBriefing {
  id: string;
  sessionId?: string;
  userId?: string;
  generatedAt: string;
  sections: BootBriefingSections;
  tokenTarget: number;
  actualApproxTokens: number;
  optimization?: {
    duplicateBlocksRemoved: number;
    tokenPrunedBlocks: number;
    highValueBlocksKept: number;
  };
}

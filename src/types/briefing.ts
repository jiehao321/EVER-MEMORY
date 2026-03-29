export interface BootBriefingSections {
  identity: string[];
  constraints: string[];
  recentContinuity: string[];
  activeProjects: string[];
}

export interface BootBriefingQuality {
  qualityScore: number;
  qualityLabel: 'excellent' | 'good' | 'fair' | 'low';
  emptySections: string[];
  nudge: string | null;
}

/** D3: Session Continuity Score — 0.0 (no context) to 1.0 (rich context) */
export interface SessionContinuityScore {
  score: number;
  label: 'rich' | 'moderate' | 'sparse' | 'empty';
  filledSections: number;
  totalSections: number;
}

export interface BootBriefing {
  id: string;
  sessionId?: string;
  userId?: string;
  generatedAt: string;
  memoryIds?: readonly string[];
  sections: BootBriefingSections;
  tokenTarget: number;
  actualApproxTokens: number;
  optimization?: {
    duplicateBlocksRemoved: number;
    tokenPrunedBlocks: number;
    highValueBlocksKept: number;
  };
  quality?: BootBriefingQuality;
  continuityScore?: SessionContinuityScore;
}

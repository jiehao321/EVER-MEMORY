export interface ContradictionAlert {
  type: 'contradiction';
  memoryA: { id: string; content: string; updatedAt: string };
  memoryB: { id: string; content: string; updatedAt: string };
  conflictScore: number;
  suggestion: 'keep_newer' | 'keep_both' | 'ask_user';
}

export type MemoryAlert = ContradictionAlert;

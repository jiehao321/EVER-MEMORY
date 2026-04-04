import type { MemoryType } from '../../../types.js';

export interface MemorySnapshot {
  id: string;
  content: string;
  type: MemoryType;
  tags: string[];
  scores: { confidence: number; importance: number };
  scope?: { userId?: string; chatId?: string; project?: string };
  timestamps: { createdAt: string; updatedAt: string };
}

export interface MemorySearchQuery {
  scope?: { userId?: string; chatId?: string; project?: string };
  types?: MemoryType[];
  query?: string;
  activeOnly?: boolean;
  archived?: boolean;
  limit?: number;
}

export interface MemoryQueryPort {
  search(query: MemorySearchQuery): MemorySnapshot[];
}

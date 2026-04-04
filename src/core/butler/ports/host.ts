export interface HostPort {
  injectContext(xml: string): void;
  invokeTool?(toolName: string, params: Record<string, unknown>): Promise<unknown>;
  askUser?(question: string, options?: { context?: string }): Promise<string | null>;
  searchKnowledge?(
    query: string,
    sources?: string[],
  ): Promise<Array<{ content: string; source: string; relevance: number }>>;
}

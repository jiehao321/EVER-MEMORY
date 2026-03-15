declare module '../../scripts/growth-report.mjs' {
  export function parseArgs(argv: string[]): { dbPath: string; days: number };
  export function generateGrowthReport(input: { dbPath: string; days?: number; now?: Date }): string;
}

import type Database from 'better-sqlite3';
import type {
  ContradictionCluster,
  EvolutionEntry,
  FindConnectedOptions,
  GraphNode,
  GraphPath,
  GraphStats,
  MemoryRelation,
  RelationCreatedBy,
  RelationType,
} from '../types/relation.js';
import {
  GRAPH_TRAVERSAL_MAX_DEPTH,
  GRAPH_TRAVERSAL_MAX_RESULTS,
  GRAPH_TRAVERSAL_MIN_WEIGHT,
  RELATION_DECAY_RATE,
  RELATION_PRUNE_THRESHOLD,
  RELATION_REINFORCE_ON_HIT,
  RELATION_WEIGHT_CAP,
} from '../tuning/graph.js';
import { safeJsonParse } from '../util/json.js';

interface MemoryRelationRow {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  confidence: number;
  weight: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  metadata_json: string | null;
  active: number;
}

interface GraphStatsRow {
  memory_id: string;
  in_degree: number;
  out_degree: number;
  strongest_relation_type: string | null;
  strongest_relation_id: string | null;
  cluster_id: string | null;
  updated_at: string;
}

interface GraphNodeRow {
  memory_id: string;
  depth: number;
  path: string;
  relation_type: string | null;
  weight: number | null;
}

interface GraphPathRow {
  nodes: string;
  relations: string;
  total_weight: number;
  total_confidence: number;
}

interface ContradictionRow {
  memory_id: string;
  relation_id: string;
  confidence: number;
}

interface EvolutionEntryRow {
  memory_id: string;
  content: string;
  updated_at: string;
  relation_type: 'evolves_from' | 'supersedes';
  confidence: number;
}

interface CountRow {
  count: number;
}

interface StrongestRelationRow {
  id: string;
  relation_type: string;
}

interface ClusterRow {
  cluster_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toMemoryRelation(row: MemoryRelationRow): MemoryRelation {
  const metadata = row.metadata_json
    ? safeJsonParse<unknown>(row.metadata_json, undefined)
    : undefined;

  return {
    id: row.id,
    sourceId: row.source_id,
    targetId: row.target_id,
    relationType: row.relation_type as RelationType,
    confidence: row.confidence,
    weight: row.weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by as RelationCreatedBy,
    metadata: isRecord(metadata) ? metadata : undefined,
    active: row.active === 1,
  };
}

function toGraphStats(row: GraphStatsRow): GraphStats {
  return {
    memoryId: row.memory_id,
    inDegree: row.in_degree,
    outDegree: row.out_degree,
    strongestRelationType: (row.strongest_relation_type as RelationType | null) ?? undefined,
    strongestRelationId: row.strongest_relation_id ?? undefined,
    clusterId: row.cluster_id ?? undefined,
    updatedAt: row.updated_at,
  };
}

function normalizeGraphPath(path: string): string {
  return path.replace(/^→/, '').replace(/→$/, '');
}

function parsePipeList(value: string): string[] {
  if (!value) {
    return [];
  }

  return value.split('|').filter((item) => item.length > 0);
}

function toGraphNode(row: GraphNodeRow): GraphNode {
  return {
    memoryId: row.memory_id,
    depth: row.depth,
    path: normalizeGraphPath(row.path),
    relationType: (row.relation_type as RelationType | null) ?? undefined,
    weight: row.weight ?? undefined,
  };
}

function toGraphPath(row: GraphPathRow): GraphPath {
  return {
    nodes: parsePipeList(row.nodes),
    relations: parsePipeList(row.relations) as RelationType[],
    totalWeight: row.total_weight,
    totalConfidence: row.total_confidence,
  };
}

function parsePositiveInteger(value: number | undefined, fallback: number): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return fallback;
  }

  return value as number;
}

function parseMinWeight(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return GRAPH_TRAVERSAL_MIN_WEIGHT;
  }

  return Math.max(0, value);
}

function buildRelationTypeFilter(types: RelationType[] | undefined, column: string): { sql: string; params: RelationType[] } {
  if (!types || types.length === 0) {
    return { sql: '', params: [] };
  }

  return {
    sql: ` AND ${column} IN (${types.map(() => '?').join(', ')})`,
    params: types,
  };
}

export class RelationRepository {
  private readonly stmtUpsert: Database.Statement;
  private readonly stmtDeactivate: Database.Statement;
  private readonly stmtFindById: Database.Statement;
  private readonly stmtFindByMemory: Database.Statement;
  private readonly stmtCountByMemory: Database.Statement;
  private readonly stmtFindCausalForward: Database.Statement;
  private readonly stmtFindCausalBackward: Database.Statement;
  private readonly stmtFindContradictionCluster: Database.Statement;
  private readonly stmtFindEvolutionTimeline: Database.Statement;
  private readonly stmtFindShortestPath: Database.Statement;
  private readonly stmtCountIncoming: Database.Statement;
  private readonly stmtCountOutgoing: Database.Statement;
  private readonly stmtFindStrongestRelation: Database.Statement;
  private readonly stmtFindClusterId: Database.Statement;
  private readonly stmtUpsertGraphStats: Database.Statement;
  private readonly stmtGetGraphStats: Database.Statement;
  private readonly stmtDecayWeights: Database.Statement;
  private readonly stmtPruneRelations: Database.Statement;
  private readonly stmtReinforceWeight: Database.Statement;
  private readonly connectedStatementCache = new Map<string, Database.Statement>();

  constructor(private readonly db: Database.Database) {
    this.stmtUpsert = db.prepare(`
      INSERT INTO memory_relations (
        id, source_id, target_id, relation_type,
        confidence, weight, created_at, updated_at,
        created_by, metadata_json, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(source_id, target_id, relation_type) DO UPDATE SET
        confidence = excluded.confidence,
        weight = excluded.weight,
        updated_at = excluded.updated_at,
        created_by = excluded.created_by,
        metadata_json = excluded.metadata_json,
        active = 1
    `);

    this.stmtDeactivate = db.prepare(`
      UPDATE memory_relations
      SET active = 0, updated_at = ?
      WHERE id = ?
    `);

    this.stmtFindById = db.prepare(`
      SELECT * FROM memory_relations
      WHERE id = ?
      LIMIT 1
    `);

    this.stmtFindByMemory = db.prepare(`
      SELECT * FROM memory_relations
      WHERE active = 1 AND (source_id = ? OR target_id = ?)
      ORDER BY weight DESC, updated_at DESC, id ASC
    `);

    this.stmtCountByMemory = db.prepare(`
      SELECT COUNT(*) as count FROM memory_relations
      WHERE active = 1 AND (source_id = ? OR target_id = ?)
    `);

    this.stmtFindCausalForward = db.prepare(`
      WITH RECURSIVE causal_chain(nodes, relations, current_id, total_weight, total_confidence, depth, visit_path) AS (
        SELECT
          ? || '|' || target_id,
          relation_type,
          target_id,
          weight,
          confidence,
          1,
          '→' || ? || '→' || target_id || '→'
        FROM memory_relations
        WHERE source_id = ?
          AND relation_type = 'causes'
          AND active = 1
          AND weight >= ?
          AND target_id != ?
        UNION ALL
        SELECT
          c.nodes || '|' || r.target_id,
          c.relations || '|' || r.relation_type,
          r.target_id,
          c.total_weight + r.weight,
          c.total_confidence + r.confidence,
          c.depth + 1,
          c.visit_path || r.target_id || '→'
        FROM memory_relations r
        JOIN causal_chain c ON r.source_id = c.current_id
        WHERE c.depth < ?
          AND r.relation_type = 'causes'
          AND r.active = 1
          AND r.weight >= ?
          AND c.visit_path NOT LIKE '%→' || r.target_id || '→%'
      )
      SELECT nodes, relations, total_weight, total_confidence
      FROM causal_chain
      ORDER BY depth ASC, total_weight DESC, total_confidence DESC
    `);

    this.stmtFindCausalBackward = db.prepare(`
      WITH RECURSIVE causal_chain(nodes, relations, current_id, total_weight, total_confidence, depth, visit_path) AS (
        SELECT
          ? || '|' || source_id,
          relation_type,
          source_id,
          weight,
          confidence,
          1,
          '→' || ? || '→' || source_id || '→'
        FROM memory_relations
        WHERE target_id = ?
          AND relation_type = 'causes'
          AND active = 1
          AND weight >= ?
          AND source_id != ?
        UNION ALL
        SELECT
          c.nodes || '|' || r.source_id,
          c.relations || '|' || r.relation_type,
          r.source_id,
          c.total_weight + r.weight,
          c.total_confidence + r.confidence,
          c.depth + 1,
          c.visit_path || r.source_id || '→'
        FROM memory_relations r
        JOIN causal_chain c ON r.target_id = c.current_id
        WHERE c.depth < ?
          AND r.relation_type = 'causes'
          AND r.active = 1
          AND r.weight >= ?
          AND c.visit_path NOT LIKE '%→' || r.source_id || '→%'
      )
      SELECT nodes, relations, total_weight, total_confidence
      FROM causal_chain
      ORDER BY depth ASC, total_weight DESC, total_confidence DESC
    `);

    this.stmtFindContradictionCluster = db.prepare(`
      SELECT target_id as memory_id, id as relation_id, confidence
      FROM memory_relations
      WHERE source_id = ? AND relation_type = 'contradicts' AND active = 1
      UNION ALL
      SELECT source_id as memory_id, id as relation_id, confidence
      FROM memory_relations
      WHERE target_id = ? AND relation_type = 'contradicts' AND active = 1
      ORDER BY confidence DESC, relation_id ASC
    `);

    this.stmtFindEvolutionTimeline = db.prepare(`
      WITH RECURSIVE evolution(memory_id, content, updated_at, relation_type, confidence, depth, visit_path) AS (
        SELECT
          m.id,
          m.content,
          m.updated_at,
          r.relation_type,
          r.confidence,
          1,
          '→' || ? || '→' || m.id || '→'
        FROM memory_relations r
        JOIN memory_items m ON r.source_id = m.id
        WHERE r.target_id = ?
          AND r.relation_type IN ('evolves_from', 'supersedes')
          AND r.active = 1
          AND r.source_id != ?
        UNION ALL
        SELECT
          m.id,
          m.content,
          m.updated_at,
          r.relation_type,
          r.confidence,
          e.depth + 1,
          e.visit_path || m.id || '→'
        FROM memory_relations r
        JOIN evolution e ON r.target_id = e.memory_id
        JOIN memory_items m ON r.source_id = m.id
        WHERE e.depth < ?
          AND r.relation_type IN ('evolves_from', 'supersedes')
          AND r.active = 1
          AND e.visit_path NOT LIKE '%→' || m.id || '→%'
      )
      SELECT memory_id, content, updated_at, relation_type, confidence
      FROM evolution
      ORDER BY updated_at ASC, depth ASC, memory_id ASC
    `);

    this.stmtFindShortestPath = db.prepare(`
      WITH RECURSIVE shortest_path(nodes, relations, current_id, total_weight, total_confidence, depth, visit_path) AS (
        SELECT
          ? || '|' || target_id,
          relation_type,
          target_id,
          weight,
          confidence,
          1,
          '→' || ? || '→' || target_id || '→'
        FROM memory_relations
        WHERE source_id = ?
          AND active = 1
          AND weight >= ?
          AND target_id != ?
        UNION ALL
        SELECT
          p.nodes || '|' || r.target_id,
          p.relations || '|' || r.relation_type,
          r.target_id,
          p.total_weight + r.weight,
          p.total_confidence + r.confidence,
          p.depth + 1,
          p.visit_path || r.target_id || '→'
        FROM memory_relations r
        JOIN shortest_path p ON r.source_id = p.current_id
        WHERE p.depth < ?
          AND r.active = 1
          AND r.weight >= ?
          AND p.visit_path NOT LIKE '%→' || r.target_id || '→%'
      )
      SELECT nodes, relations, total_weight, total_confidence
      FROM shortest_path
      WHERE current_id = ?
      ORDER BY depth ASC, total_weight DESC, total_confidence DESC
      LIMIT 1
    `);

    this.stmtCountIncoming = db.prepare(`
      SELECT COUNT(*) as count FROM memory_relations
      WHERE target_id = ? AND active = 1
    `);

    this.stmtCountOutgoing = db.prepare(`
      SELECT COUNT(*) as count FROM memory_relations
      WHERE source_id = ? AND active = 1
    `);

    this.stmtFindStrongestRelation = db.prepare(`
      SELECT id, relation_type FROM memory_relations
      WHERE active = 1 AND (source_id = ? OR target_id = ?)
      ORDER BY weight DESC, confidence DESC, updated_at DESC, id ASC
      LIMIT 1
    `);

    this.stmtFindClusterId = db.prepare(`
      SELECT cluster_id FROM graph_stats
      WHERE memory_id = ?
      LIMIT 1
    `);

    this.stmtUpsertGraphStats = db.prepare(`
      INSERT INTO graph_stats (
        memory_id, in_degree, out_degree, strongest_relation_type,
        strongest_relation_id, cluster_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(memory_id) DO UPDATE SET
        in_degree = excluded.in_degree,
        out_degree = excluded.out_degree,
        strongest_relation_type = excluded.strongest_relation_type,
        strongest_relation_id = excluded.strongest_relation_id,
        cluster_id = excluded.cluster_id,
        updated_at = excluded.updated_at
    `);

    this.stmtGetGraphStats = db.prepare(`
      SELECT * FROM graph_stats
      WHERE memory_id = ?
      LIMIT 1
    `);

    this.stmtDecayWeights = db.prepare(`
      UPDATE memory_relations
      SET
        weight = MAX(weight * (1 - ?), 0),
        updated_at = ?
      WHERE active = 1
    `);

    this.stmtPruneRelations = db.prepare(`
      UPDATE memory_relations
      SET active = 0, updated_at = ?
      WHERE active = 1 AND weight < ?
    `);

    this.stmtReinforceWeight = db.prepare(`
      UPDATE memory_relations
      SET
        weight = MIN(weight + ?, ?),
        updated_at = ?
      WHERE id = ? AND active = 1
    `);
  }

  /** Insert or update a relation (upsert by source+target+type unique constraint) */
  upsert(relation: Omit<MemoryRelation, 'active'>): void {
    this.stmtUpsert.run(
      relation.id,
      relation.sourceId,
      relation.targetId,
      relation.relationType,
      relation.confidence,
      relation.weight,
      relation.createdAt,
      relation.updatedAt,
      relation.createdBy,
      relation.metadata ? JSON.stringify(relation.metadata) : null,
    );
  }

  /** Deactivate a relation */
  deactivate(id: string): void {
    this.stmtDeactivate.run(new Date().toISOString(), id);
  }

  /** Get relation by ID */
  findById(id: string): MemoryRelation | null {
    const row = this.stmtFindById.get(id) as MemoryRelationRow | undefined;
    return row ? toMemoryRelation(row) : null;
  }

  /** Get all active relations for a memory (as source or target) */
  findByMemory(memoryId: string): MemoryRelation[] {
    const rows = this.stmtFindByMemory.all(memoryId, memoryId) as MemoryRelationRow[];
    return rows.map(toMemoryRelation);
  }

  /** Count active relations for a memory */
  countByMemory(memoryId: string): number {
    const row = this.stmtCountByMemory.get(memoryId, memoryId) as CountRow;
    return row.count;
  }

  /** BFS from a memory node. Uses recursive CTE with cycle detection via path. */
  findConnected(memoryId: string, opts: FindConnectedOptions = {}): GraphNode[] {
    const maxDepth = parsePositiveInteger(opts.maxDepth, GRAPH_TRAVERSAL_MAX_DEPTH);
    const limit = parsePositiveInteger(opts.limit, GRAPH_TRAVERSAL_MAX_RESULTS);
    const minWeight = parseMinWeight(opts.minWeight);
    const statement = this.getFindConnectedStatement(opts.types);
    const typeParams = opts.types ?? [];
    const rows = statement.all(
      minWeight,
      minWeight,
      memoryId,
      memoryId,
      memoryId,
      ...typeParams,
      maxDepth,
      ...typeParams,
      limit,
    ) as GraphNodeRow[];

    return rows.map(toGraphNode);
  }

  /** Find causal chain forward or backward */
  findCausalChain(memoryId: string, direction: 'forward' | 'backward', maxDepth?: number): GraphPath[] {
    const resolvedMaxDepth = parsePositiveInteger(maxDepth, GRAPH_TRAVERSAL_MAX_DEPTH);
    const minWeight = GRAPH_TRAVERSAL_MIN_WEIGHT;
    const statement = direction === 'forward' ? this.stmtFindCausalForward : this.stmtFindCausalBackward;
    const rows = statement.all(
      memoryId,
      memoryId,
      memoryId,
      minWeight,
      memoryId,
      resolvedMaxDepth,
      minWeight,
    ) as GraphPathRow[];

    return rows.map(toGraphPath);
  }

  /** Find contradiction cluster around a memory */
  findContradictionCluster(memoryId: string): ContradictionCluster {
    const rows = this.stmtFindContradictionCluster.all(memoryId, memoryId) as ContradictionRow[];

    return {
      centerId: memoryId,
      contradictions: rows.map((row) => ({
        memoryId: row.memory_id,
        relationId: row.relation_id,
        confidence: row.confidence,
      })),
    };
  }

  /** Find evolution timeline (evolves_from + supersedes chain backward) */
  findEvolutionTimeline(memoryId: string): EvolutionEntry[] {
    const rows = this.stmtFindEvolutionTimeline.all(
      memoryId,
      memoryId,
      memoryId,
      GRAPH_TRAVERSAL_MAX_DEPTH,
    ) as EvolutionEntryRow[];

    return rows.map((row) => ({
      memoryId: row.memory_id,
      content: row.content,
      updatedAt: row.updated_at,
      relationType: row.relation_type,
      confidence: row.confidence,
    }));
  }

  /** Find shortest path between two memories (BFS with early termination) */
  findShortestPath(sourceId: string, targetId: string, maxDepth?: number): GraphPath | null {
    if (sourceId === targetId) {
      return {
        nodes: [sourceId],
        relations: [],
        totalWeight: 0,
        totalConfidence: 0,
      };
    }

    const resolvedMaxDepth = parsePositiveInteger(maxDepth, GRAPH_TRAVERSAL_MAX_DEPTH);
    const row = this.stmtFindShortestPath.get(
      sourceId,
      sourceId,
      sourceId,
      GRAPH_TRAVERSAL_MIN_WEIGHT,
      sourceId,
      resolvedMaxDepth,
      GRAPH_TRAVERSAL_MIN_WEIGHT,
      targetId,
    ) as GraphPathRow | undefined;

    return row ? toGraphPath(row) : null;
  }

  /** Update graph_stats for a memory after relation changes */
  updateGraphStats(memoryId: string): void {
    const inDegree = (this.stmtCountIncoming.get(memoryId) as CountRow).count;
    const outDegree = (this.stmtCountOutgoing.get(memoryId) as CountRow).count;
    const strongest = this.stmtFindStrongestRelation.get(memoryId, memoryId) as StrongestRelationRow | undefined;
    const existingCluster = this.stmtFindClusterId.get(memoryId) as ClusterRow | undefined;
    const updatedAt = new Date().toISOString();

    this.stmtUpsertGraphStats.run(
      memoryId,
      inDegree,
      outDegree,
      strongest?.relation_type ?? null,
      strongest?.id ?? null,
      existingCluster?.cluster_id ?? null,
      updatedAt,
    );
  }

  /** Get graph stats for a memory */
  getGraphStats(memoryId: string): GraphStats | null {
    const row = this.stmtGetGraphStats.get(memoryId) as GraphStatsRow | undefined;
    return row ? toGraphStats(row) : null;
  }

  /** Decay all relation weights. Called during housekeeping. */
  decayWeights(): { decayed: number; pruned: number } {
    const updatedAt = new Date().toISOString();
    const decayed = this.stmtDecayWeights.run(RELATION_DECAY_RATE, updatedAt).changes;
    const pruned = this.stmtPruneRelations.run(updatedAt, RELATION_PRUNE_THRESHOLD).changes;

    return { decayed, pruned };
  }

  /** Reinforce a relation's weight (when traversed/used) */
  reinforceWeight(id: string): void {
    this.stmtReinforceWeight.run(
      RELATION_REINFORCE_ON_HIT,
      RELATION_WEIGHT_CAP,
      new Date().toISOString(),
      id,
    );
  }

  private getFindConnectedStatement(types?: RelationType[]): Database.Statement {
    const key = types && types.length > 0 ? `typed:${[...types].sort().join(',')}` : 'all';
    const cached = this.connectedStatementCache.get(key);
    if (cached) {
      return cached;
    }

    const seedFilter = buildRelationTypeFilter(types, 'e.relation_type');
    const recursiveFilter = buildRelationTypeFilter(types, 'e.relation_type');

    const statement = this.db.prepare(`
      WITH RECURSIVE edges(from_id, to_id, relation_type, weight) AS (
        SELECT source_id, target_id, relation_type, weight
        FROM memory_relations
        WHERE active = 1 AND weight >= ?
        UNION ALL
        SELECT target_id, source_id, relation_type, weight
        FROM memory_relations
        WHERE active = 1 AND weight >= ?
      ),
      graph_bfs(id, depth, path, rel_type, weight) AS (
        SELECT
          e.to_id,
          1,
          '→' || ? || '→' || e.to_id || '→',
          e.relation_type,
          e.weight
        FROM edges e
        WHERE e.from_id = ?
          AND e.to_id != ?
          ${seedFilter.sql}
        UNION ALL
        SELECT
          e.to_id,
          g.depth + 1,
          g.path || e.to_id || '→',
          e.relation_type,
          e.weight
        FROM edges e
        JOIN graph_bfs g ON e.from_id = g.id
        WHERE g.depth < ?
          ${recursiveFilter.sql}
          AND g.path NOT LIKE '%→' || e.to_id || '→%'
      )
      SELECT memory_id, depth, path, relation_type, weight
      FROM (
        SELECT
          id as memory_id,
          depth,
          path,
          rel_type as relation_type,
          weight,
          ROW_NUMBER() OVER (
            PARTITION BY id
            ORDER BY depth ASC, weight DESC, id ASC
          ) as row_number
        FROM graph_bfs
      )
      WHERE row_number = 1
      ORDER BY depth ASC, weight DESC, memory_id ASC
      LIMIT ?
    `);

    this.connectedStatementCache.set(key, statement);
    return statement;
  }
}

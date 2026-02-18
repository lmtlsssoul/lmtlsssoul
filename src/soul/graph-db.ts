import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { SoulNode, SoulEdge, EvidenceLink, NodeType, NodeStatus, WeightVector, EdgeRelation, EvidenceLinkType } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class GraphDB {
  private db: Database.Database;
  private dbDir: string;

  constructor(baseDir: string) {
    this.dbDir = baseDir;

    if (baseDir !== ':memory:') {
        if (!fs.existsSync(this.dbDir)) {
            fs.mkdirSync(this.dbDir, { recursive: true });
        }
    }


    const dbPath = baseDir === ':memory:' ? ':memory:' : path.join(this.dbDir, 'soul.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Load schema
    const schemaPath = path.resolve(__dirname, '../schema/soul-graph.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    } else {
      console.warn(`Schema file not found at ${schemaPath}. Assuming DB is initialized or will be initialized manually.`);
    }
  }

  // ─── Nodes ──────────────────────────────────────────────────────

  public createNode(params: {
    premise: string;
    nodeType: NodeType;
    status?: NodeStatus;
    weight?: Partial<WeightVector>;
    createdBy: string;
  }): string {
    const nodeId = ulid();
    const now = new Date().toISOString();
    
    const weight = {
      salience: params.weight?.salience ?? 0.5,
      valence: params.weight?.valence ?? 0.0,
      arousal: params.weight?.arousal ?? 0.0,
      commitment: params.weight?.commitment ?? 0.5,
      uncertainty: params.weight?.uncertainty ?? 0.5,
      resonance: params.weight?.resonance ?? 0.0,
    };

    const stmt = this.db.prepare(`
      INSERT INTO soul_nodes (
        node_id, premise, node_type, status,
        salience, valence, arousal, commitment, uncertainty, resonance,
        created_at, updated_at, created_by, version
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, 1
      )
    `);

    stmt.run(
      nodeId, params.premise, params.nodeType, params.status || 'active',
      weight.salience, weight.valence, weight.arousal, weight.commitment, weight.uncertainty, weight.resonance,
      now, now, params.createdBy
    );

    return nodeId;
  }

  public getNode(nodeId: string): SoulNode | null {
    const stmt = this.db.prepare('SELECT * FROM soul_nodes WHERE node_id = ?');
    const row = stmt.get(nodeId) as any;
    
    if (!row) return null;

    return this.mapNode(row);
  }

  public getNodeCount(): number {
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM soul_nodes');
    const result = stmt.get() as { count: number };
    return result.count;
  }

  public updateNodeWeight(nodeId: string, weight: Partial<WeightVector>): void {
    const updates: string[] = [];
    const params: any[] = [];

    // Helper to clamp values
    const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

    if (weight.salience !== undefined) {
      updates.push('salience = ?');
      params.push(clamp(weight.salience, 0.0, 1.0));
    }
    if (weight.valence !== undefined) {
      updates.push('valence = ?');
      params.push(clamp(weight.valence, -1.0, 1.0));
    }
    if (weight.arousal !== undefined) {
      updates.push('arousal = ?');
      params.push(clamp(weight.arousal, 0.0, 1.0));
    }
    if (weight.commitment !== undefined) {
      updates.push('commitment = ?');
      params.push(clamp(weight.commitment, 0.0, 1.0));
    }
    if (weight.uncertainty !== undefined) {
      updates.push('uncertainty = ?');
      params.push(clamp(weight.uncertainty, 0.0, 1.0));
    }
    if (weight.resonance !== undefined) {
      updates.push('resonance = ?');
      params.push(clamp(weight.resonance, 0.0, 1.0));
    }

    if (updates.length === 0) return;

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    updates.push('version = version + 1');

    params.push(nodeId); // For WHERE clause

    const sql = `UPDATE soul_nodes SET ${updates.join(', ')} WHERE node_id = ?`;
    this.db.prepare(sql).run(...params);
  }

  public updateNodeStatus(nodeId: string, status: NodeStatus): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE soul_nodes 
      SET status = ?, updated_at = ?, version = version + 1
      WHERE node_id = ?
    `);
    stmt.run(status, now, nodeId);
  }

  public getProvisionalNodes(limit: number = 100): SoulNode[] {
    const stmt = this.db.prepare(`
      SELECT * FROM soul_nodes 
      WHERE status = 'provisional' 
      ORDER BY salience DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.mapNode(row));
  }

  public searchNodes(query: string): SoulNode[] {
    // FTS search on premise
    // We join with the main table to get full node details
    const sql = `
      SELECT sn.* 
      FROM soul_nodes_fts fts
      JOIN soul_nodes sn ON sn.rowid = fts.rowid
      WHERE soul_nodes_fts MATCH ?
      ORDER BY rank
    `;
    
    const sanitizedQuery = query.replace(/[^\w\s]/gi, ' ').trim();
    if (!sanitizedQuery) return [];

    const rows = this.db.prepare(sql).all(sanitizedQuery) as any[];
    return rows.map(row => this.mapNode(row));
  }

  public getTopSalienceNodes(limit: number = 50): SoulNode[] {
    const stmt = this.db.prepare(`
      SELECT * FROM soul_nodes 
      WHERE status = 'active' 
      ORDER BY salience DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.mapNode(row));
  }

  // ─── Edges ──────────────────────────────────────────────────────

  public createEdge(params: {
    sourceId: string;
    targetId: string;
    relation: EdgeRelation;
    strength?: number;
  }): string {
    const edgeId = ulid();
    const now = new Date().toISOString();
    const strength = Math.min(Math.max(params.strength ?? 0.5, 0.0), 1.0);

    const stmt = this.db.prepare(`
      INSERT INTO soul_edges (
        edge_id, source_id, target_id, relation, strength, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(edgeId, params.sourceId, params.targetId, params.relation, strength, now);
    return edgeId;
  }

  public getEdges(nodeId: string): SoulEdge[] {
    const stmt = this.db.prepare(`
      SELECT * FROM soul_edges 
      WHERE source_id = ? OR target_id = ?
    `);
    
    const rows = stmt.all(nodeId, nodeId) as any[];
    return rows.map(row => ({
      edgeId: row.edge_id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relation: row.relation as EdgeRelation,
      strength: row.strength,
      createdAt: row.created_at
    }));
  }

  public getEdgesForNodes(nodeIds: string[]): SoulEdge[] {
    if (nodeIds.length === 0) return [];

    const placeholders = nodeIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`
      SELECT * FROM soul_edges 
      WHERE source_id IN (${placeholders}) 
      AND target_id IN (${placeholders})
    `);
    
    // We pass the array twice because we check both source and target? 
    // Wait, the query is "source IN (...) AND target IN (...)".
    // This finds edges WHERE BOTH ends are in the set.
    // This is good for internal consistency of the capsule.
    
    const rows = stmt.all(...nodeIds, ...nodeIds) as any[];
    return rows.map(row => ({
      edgeId: row.edge_id,
      sourceId: row.source_id,
      targetId: row.target_id,
      relation: row.relation as EdgeRelation,
      strength: row.strength,
      createdAt: row.created_at
    }));
  }

  // ─── Evidence ───────────────────────────────────────────────────

  public addEvidence(params: {
    nodeId: string;
    eventHash: string;
    linkType: EvidenceLinkType;
  }): string {
    const linkId = ulid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO evidence_links (
        link_id, node_id, event_hash, link_type, created_at
      ) VALUES (
        ?, ?, ?, ?, ?
      )
    `);

    stmt.run(linkId, params.nodeId, params.eventHash, params.linkType, now);
    return linkId;
  }

  public getEvidence(nodeId: string): EvidenceLink[] {
    const stmt = this.db.prepare('SELECT * FROM evidence_links WHERE node_id = ?');
    const rows = stmt.all(nodeId) as any[];
    
    return rows.map(row => ({
      linkId: row.link_id,
      nodeId: row.node_id,
      eventHash: row.event_hash,
      linkType: row.link_type as EvidenceLinkType,
      createdAt: row.created_at
    }));
  }

  // ─── Maintenance ────────────────────────────────────────────────

  /**
   * Performs database maintenance (VACUUM and ANALYZE).
   */
  public optimize(): void {
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private mapNode(row: any): SoulNode {
    return {
      nodeId: row.node_id,
      premise: row.premise,
      nodeType: row.node_type as NodeType,
      status: row.status as NodeStatus,
      weight: {
        salience: row.salience,
        valence: row.valence,
        arousal: row.arousal,
        commitment: row.commitment,
        uncertainty: row.uncertainty,
        resonance: row.resonance,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by,
      version: row.version
    };
  }
}

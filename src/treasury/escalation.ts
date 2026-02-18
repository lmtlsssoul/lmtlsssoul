import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { EscalationProposal } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class EscalationManager {
  private db: Database.Database;

  constructor(baseDirOrDb: string | Database.Database) {
    if (typeof baseDirOrDb === 'string') {
      const baseDir = baseDirOrDb;
      if (baseDir !== ':memory:') {
        if (!fs.existsSync(baseDir)) {
          fs.mkdirSync(baseDir, { recursive: true });
        }
      }

      const dbPath = baseDir === ':memory:' ? ':memory:' : path.join(baseDir, 'treasury.db');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');

      // Load schema
      const schemaPath = path.resolve(__dirname, '../schema/treasury.sql');
      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
      }
    } else {
      this.db = baseDirOrDb;
    }
  }

  /**
   * Creates a new escalation proposal.
   */
  public createProposal(params: Omit<EscalationProposal, 'proposalId' | 'status' | 'createdAt'>): string {
    const proposalId = ulid();
    const createdAt = new Date().toISOString();
    const status = 'pending';

    const stmt = this.db.prepare(`
      INSERT INTO escalation_proposals (
        proposal_id, reason, requested_cost_usd, current_budget_remaining,
        substrate, model_id, task_description, expected_value, status, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(
      proposalId,
      params.reason,
      params.requestedCostUsd,
      params.currentBudgetRemainingUsd,
      params.substrate,
      params.modelId,
      params.taskDescription,
      params.expectedValue,
      status,
      createdAt
    );

    return proposalId;
  }

  /**
   * Retrieves a proposal by ID.
   */
  public getProposal(proposalId: string): EscalationProposal | null {
    const stmt = this.db.prepare('SELECT * FROM escalation_proposals WHERE proposal_id = ?');
    const row = stmt.get(proposalId) as any;
    if (!row) return null;
    return this.mapProposal(row);
  }

  /**
   * Updates the status of a proposal.
   */
  public updateStatus(proposalId: string, status: 'approved' | 'rejected'): void {
    const stmt = this.db.prepare('UPDATE escalation_proposals SET status = ? WHERE proposal_id = ?');
    stmt.run(status, proposalId);
  }

  /**
   * Lists proposals by status.
   */
  public listProposals(status?: 'pending' | 'approved' | 'rejected'): EscalationProposal[] {
    let sql = 'SELECT * FROM escalation_proposals';
    const params: any[] = [];

    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.mapProposal(row));
  }

  private mapProposal(row: any): EscalationProposal {
    return {
      proposalId: row.proposal_id,
      reason: row.reason,
      requestedCostUsd: row.requested_cost_usd,
      currentBudgetRemainingUsd: row.current_budget_remaining,
      substrate: row.substrate,
      modelId: row.model_id,
      taskDescription: row.task_description,
      expectedValue: row.expected_value,
      status: row.status as any,
      createdAt: row.created_at
    };
  }
}

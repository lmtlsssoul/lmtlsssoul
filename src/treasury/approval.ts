import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { SpendApproval } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SpendApprovalManager {
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
   * Creates a new spend approval request.
   */
  public createRequest(params: { requestReason: string; amountUsd: number }): string {
    const approvalId = ulid();
    const now = new Date().toISOString();
    const status = 'pending';

    const stmt = this.db.prepare(`
      INSERT INTO spend_approvals (
        approval_id, request_reason, amount_usd, status, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?
      )
    `);

    stmt.run(approvalId, params.requestReason, params.amountUsd, status, now, now);
    return approvalId;
  }

  /**
   * Records a signature for an approval request.
   */
  public approve(approvalId: string, signature: string, approverId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE spend_approvals 
      SET status = 'approved', signature = ?, approver_id = ?, updated_at = ? 
      WHERE approval_id = ? AND status = 'pending'
    `);
    stmt.run(signature, approverId, now, approvalId);
  }

  /**
   * Rejects an approval request.
   */
  public reject(approvalId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE spend_approvals SET status = 'rejected', updated_at = ? WHERE approval_id = ? AND status = 'pending'
    `);
    stmt.run(now, approvalId);
  }

  /**
   * Marks an approved request as used.
   */
  public markUsed(approvalId: string): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE spend_approvals SET status = 'used', updated_at = ? WHERE approval_id = ? AND status = 'approved'
    `);
    stmt.run(now, approvalId);
  }

  /**
   * Retrieves an approval by ID.
   */
  public getApproval(approvalId: string): SpendApproval | null {
    const stmt = this.db.prepare('SELECT * FROM spend_approvals WHERE approval_id = ?');
    const row = stmt.get(approvalId) as any;
    if (!row) return null;
    return this.mapApproval(row);
  }

  /**
   * Lists approvals by status.
   */
  public listApprovals(status?: 'pending' | 'approved' | 'rejected' | 'used'): SpendApproval[] {
    let sql = 'SELECT * FROM spend_approvals';
    const params: any[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.mapApproval(row));
  }

  private mapApproval(row: any): SpendApproval {
    return {
      approvalId: row.approval_id,
      requestReason: row.request_reason,
      amountUsd: row.amount_usd,
      status: row.status as any,
      signature: row.signature,
      approverId: row.approver_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

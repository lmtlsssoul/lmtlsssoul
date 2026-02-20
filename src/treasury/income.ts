import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { RevenueGoal, IncomeRecord } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class IncomeManager {
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
   * Creates a new revenue goal.
   */
  public createGoal(params: Omit<RevenueGoal, 'goalId' | 'actualUsd' | 'status' | 'createdAt'>): string {
    const goalId = ulid();
    const createdAt = new Date().toISOString();
    const status = 'active';

    const stmt = this.db.prepare(`
      INSERT INTO revenue_goals (
        goal_id, description, target_usd, actual_usd, status, created_at, deadline
      ) VALUES (
        ?, ?, ?, 0.0, ?, ?, ?
      )
    `);

    stmt.run(goalId, params.description, params.targetUsd, status, createdAt, params.deadline ?? null);
    return goalId;
  }

  /**
   * Records received income and updates goal progress.
   */
  public recordIncome(params: Omit<IncomeRecord, 'recordId' | 'timestamp'>): string {
    const recordId = ulid();
    const timestamp = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      // 1. Insert income record
      const insertIncome = this.db.prepare(`
        INSERT INTO income_records (
          record_id, timestamp, amount_usd, source, goal_id, txid
        ) VALUES (
          ?, ?, ?, ?, ?, ?
        )
      `);
      insertIncome.run(recordId, timestamp, params.amountUsd, params.source, params.goalId ?? null, params.txid ?? null);

      // 2. Update goal if applicable
      if (params.goalId) {
        const updateGoal = this.db.prepare(`
          UPDATE revenue_goals 
          SET actual_usd = actual_usd + ? 
          WHERE goal_id = ?
        `);
        updateGoal.run(params.amountUsd, params.goalId);

        // Auto-complete goal if target reached
        const goal = this.getGoal(params.goalId);
        if (goal && goal.actualUsd >= goal.targetUsd && goal.status === 'active') {
          this.db.prepare("UPDATE revenue_goals SET status = 'completed' WHERE goal_id = ?").run(params.goalId);
        }
      }
    });

    transaction();
    return recordId;
  }

  public getGoal(goalId: string): RevenueGoal | null {
    const stmt = this.db.prepare('SELECT * FROM revenue_goals WHERE goal_id = ?');
    const row = stmt.get(goalId) as any;
    if (!row) return null;
    return this.mapGoal(row);
  }

  public listGoals(status?: 'active' | 'completed' | 'cancelled'): RevenueGoal[] {
    let sql = 'SELECT * FROM revenue_goals';
    const params: any[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.mapGoal(row));
  }

  public getTotalIncome(): number {
    const stmt = this.db.prepare('SELECT SUM(amount_usd) as total FROM income_records');
    const result = stmt.get() as { total: number | null };
    return result.total ?? 0;
  }

  private mapGoal(row: any): RevenueGoal {
    return {
      goalId: row.goal_id,
      description: row.description,
      targetUsd: row.target_usd,
      actualUsd: row.actual_usd,
      status: row.status as any,
      createdAt: row.created_at,
      deadline: row.deadline
    };
  }
}

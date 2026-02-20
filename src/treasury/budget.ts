import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BudgetPolicy } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BudgetManager {
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
   * Sets the current budget policy.
   */
  public setPolicy(policy: BudgetPolicy): void {
    const stmt = this.db.prepare(`
      INSERT INTO budget_policies (
        policy_id, daily_cap_usd, monthly_cap_usd, escalation_threshold_usd, require_approval_above, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?)
      ON CONFLICT(policy_id) DO UPDATE SET
        daily_cap_usd = excluded.daily_cap_usd,
        monthly_cap_usd = excluded.monthly_cap_usd,
        escalation_threshold_usd = excluded.escalation_threshold_usd,
        require_approval_above = excluded.require_approval_above,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      policy.dailyCapUsd,
      policy.monthlyCapUsd,
      policy.escalationThresholdUsd,
      policy.requireApprovalAboveUsd,
      new Date().toISOString()
    );
  }

  /**
   * Retrieves the current budget policy.
   */
  public getPolicy(): BudgetPolicy {
    const stmt = this.db.prepare("SELECT * FROM budget_policies WHERE policy_id = 'default'");
    const row = stmt.get() as any;

    if (!row) {
      // Default fallback policy
      return {
        dailyCapUsd: 10.0,
        monthlyCapUsd: 100.0,
        escalationThresholdUsd: 8.0,
        requireApprovalAboveUsd: 1.0
      };
    }

    return {
      dailyCapUsd: row.daily_cap_usd,
      monthlyCapUsd: row.monthly_cap_usd,
      escalationThresholdUsd: row.escalation_threshold_usd,
      requireApprovalAboveUsd: row.require_approval_above
    };
  }

  /**
   * Checks if a proposed cost is within budget limits.
   */
  public checkBudget(proposedCostUsd: number): { allowed: boolean; reason?: string } {
    const policy = this.getPolicy();
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);

    const dailySpend = this.getSpendForPeriod(today);
    const monthlySpend = this.getSpendForPeriod(month);

    if (dailySpend + proposedCostUsd > policy.dailyCapUsd) {
      return { allowed: false, reason: `Daily budget cap exceeded ($${policy.dailyCapUsd})` };
    }

    if (monthlySpend + proposedCostUsd > policy.monthlyCapUsd) {
      return { allowed: false, reason: `Monthly budget cap exceeded ($${policy.monthlyCapUsd})` };
    }

    return { allowed: true };
  }

  /**
   * Returns spend for a specific period (e.g., 'YYYY-MM-DD' or 'YYYY-MM').
   */
  private getSpendForPeriod(period: string): number {
    const stmt = this.db.prepare('SELECT SUM(cost_usd) as total FROM cost_entries WHERE timestamp LIKE ?');
    const result = stmt.get(`${period}%`) as { total: number | null };
    return result.total ?? 0;
  }

  /**
   * Forecasts the monthly burn rate based on spend in the last 24 hours.
   */
  public forecastMonthlyBurn(): number {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    
    const stmt = this.db.prepare('SELECT SUM(cost_usd) as total FROM cost_entries WHERE timestamp > ?');
    const result = stmt.get(yesterday) as { total: number | null };
    const last24hSpend = result.total ?? 0;

    return last24hSpend * 30; // Simple linear projection
  }
}

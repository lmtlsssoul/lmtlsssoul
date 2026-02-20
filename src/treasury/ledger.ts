import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { CostEntry } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class TreasuryLedger {
  private db: Database.Database;
  private dbDir: string;

  constructor(baseDir: string) {
    this.dbDir = baseDir;

    if (baseDir !== ':memory:') {
      if (!fs.existsSync(this.dbDir)) {
        fs.mkdirSync(this.dbDir, { recursive: true });
      }
    }

    const dbPath = baseDir === ':memory:' ? ':memory:' : path.join(this.dbDir, 'treasury.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Load schema
    const schemaPath = path.resolve(__dirname, '../schema/treasury.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    } else {
      console.warn(`Treasury schema file not found at ${schemaPath}.`);
    }
  }

  /**
   * Returns the underlying database instance.
   */
  public getDb(): Database.Database {
    return this.db;
  }

  /**
   * Records a new cost entry in the ledger.
   */
  public recordCost(entry: Omit<CostEntry, 'entryId' | 'timestamp'>): string {
    const entryId = ulid();
    const timestamp = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO cost_entries (
        entry_id, timestamp, category, substrate, model_id, role,
        input_tokens, output_tokens, cost_usd, job_id
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      entryId,
      timestamp,
      entry.category,
      entry.substrate ?? null,
      entry.modelId ?? null,
      entry.role ?? null,
      entry.inputTokens ?? null,
      entry.outputTokens ?? null,
      entry.costUsd,
      entry.jobId ?? null
    );

    return entryId;
  }

  /**
   * Retrieves a single cost entry by ID.
   */
  public getEntry(entryId: string): CostEntry | null {
    const stmt = this.db.prepare('SELECT * FROM cost_entries WHERE entry_id = ?');
    const row = stmt.get(entryId) as any;
    if (!row) return null;
    return this.mapEntry(row);
  }

  /**
   * Returns the total cost in USD.
   */
  public getTotalCost(): number {
    const stmt = this.db.prepare('SELECT SUM(cost_usd) as total FROM cost_entries');
    const result = stmt.get() as { total: number | null };
    return result.total ?? 0;
  }

  /**
   * Returns costs grouped by category.
   */
  public getCostsByCategory(): Record<string, number> {
    const stmt = this.db.prepare('SELECT category, SUM(cost_usd) as total FROM cost_entries GROUP BY category');
    const rows = stmt.all() as { category: string; total: number }[];
    
    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.category] = row.total;
    }
    return result;
  }

  /**
   * Performs database maintenance.
   */
  public optimize(): void {
    this.db.exec('VACUUM');
    this.db.exec('ANALYZE');
  }

  private mapEntry(row: any): CostEntry {
    return {
      entryId: row.entry_id,
      timestamp: row.timestamp,
      category: row.category as any,
      substrate: row.substrate,
      modelId: row.model_id,
      role: row.role,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      costUsd: row.cost_usd,
      jobId: row.job_id
    };
  }
}

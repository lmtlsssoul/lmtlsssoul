import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { LightningInvoice } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LightningManager {
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
   * Registers a new lightning invoice (created by an external node).
   */
  public registerInvoice(params: Omit<LightningInvoice, 'invoiceId' | 'status' | 'createdAt' | 'settledAt'>): string {
    const invoiceId = ulid();
    const createdAt = new Date().toISOString();
    const status = 'pending';

    const stmt = this.db.prepare(`
      INSERT INTO lightning_invoices (
        invoice_id, payment_hash, payment_request, amount_sats, description,
        status, created_at, expires_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    stmt.run(
      invoiceId,
      params.paymentHash,
      params.paymentRequest,
      params.amountSats,
      params.description,
      status,
      createdAt,
      params.expiresAt
    );

    return invoiceId;
  }

  /**
   * Marks an invoice as settled.
   */
  public settleInvoice(invoiceId: string): void {
    const settledAt = new Date().toISOString();
    const stmt = this.db.prepare("UPDATE lightning_invoices SET status = 'paid', settled_at = ? WHERE invoice_id = ?");
    stmt.run(settledAt, invoiceId);
  }

  /**
   * Marks an invoice as expired.
   */
  public expireInvoice(invoiceId: string): void {
    const stmt = this.db.prepare("UPDATE lightning_invoices SET status = 'expired' WHERE invoice_id = ?");
    stmt.run(invoiceId);
  }

  /**
   * Retrieves an invoice by ID.
   */
  public getInvoice(invoiceId: string): LightningInvoice | null {
    const stmt = this.db.prepare('SELECT * FROM lightning_invoices WHERE invoice_id = ?');
    const row = stmt.get(invoiceId) as any;
    if (!row) return null;
    return this.mapInvoice(row);
  }

  /**
   * Lists invoices by status.
   */
  public listInvoices(status?: 'pending' | 'paid' | 'expired'): LightningInvoice[] {
    let sql = 'SELECT * FROM lightning_invoices';
    const params: any[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(row => this.mapInvoice(row));
  }

  private mapInvoice(row: any): LightningInvoice {
    return {
      invoiceId: row.invoice_id,
      paymentHash: row.payment_hash,
      paymentRequest: row.payment_request,
      amountSats: row.amount_sats,
      description: row.description,
      status: row.status as any,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      settledAt: row.settled_at
    };
  }
}

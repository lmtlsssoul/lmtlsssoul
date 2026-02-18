import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from 'ulid';
import { fileURLToPath } from 'node:url';
import type { WalletInfo } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WalletManager {
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
   * Registers a new watch-only wallet.
   */
  public registerWallet(params: Omit<WalletInfo, 'walletId' | 'balanceSats' | 'createdAt' | 'updatedAt'>): string {
    const walletId = ulid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO wallets (
        wallet_id, label, btc_address, balance_sats, lightning_connector, created_at, updated_at
      ) VALUES (
        ?, ?, ?, 0, ?, ?, ?
      )
    `);

    stmt.run(walletId, params.label, params.btcAddress, params.lightningConnector ?? null, now, now);
    return walletId;
  }

  /**
   * Updates the balance of a wallet.
   */
  public updateBalance(walletId: string, balanceSats: number): void {
    const now = new Date().toISOString();
    const stmt = this.db.prepare('UPDATE wallets SET balance_sats = ?, updated_at = ? WHERE wallet_id = ?');
    stmt.run(balanceSats, now, walletId);
  }

  /**
   * Retrieves wallet information by ID.
   */
  public getWallet(walletId: string): WalletInfo | null {
    const stmt = this.db.prepare('SELECT * FROM wallets WHERE wallet_id = ?');
    const row = stmt.get(walletId) as any;
    if (!row) return null;
    return this.mapWallet(row);
  }

  /**
   * Lists all registered wallets.
   */
  public listWallets(): WalletInfo[] {
    const rows = this.db.prepare('SELECT * FROM wallets ORDER BY label ASC').all() as any[];
    return rows.map(row => this.mapWallet(row));
  }

  /**
   * Returns the total balance across all wallets.
   */
  public getTotalBalanceSats(): number {
    const stmt = this.db.prepare('SELECT SUM(balance_sats) as total FROM wallets');
    const result = stmt.get() as { total: number | null };
    return result.total ?? 0;
  }

  private mapWallet(row: any): WalletInfo {
    return {
      walletId: row.wallet_id,
      label: row.label,
      btcAddress: row.btc_address,
      balanceSats: row.balance_sats,
      lightningConnector: row.lightning_connector,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

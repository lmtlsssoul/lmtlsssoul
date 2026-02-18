
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { RawArchiveEvent, EventType } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type HydratedArchiveEvent = RawArchiveEvent & { payload: unknown };

export interface NewEventParams {
  parentHash: string | null;
  timestamp: string;
  sessionKey: string;
  eventType: string; // Relaxed to string to match usage, but should be EventType
  agentId: string;
  model?: string | null;
  channel?: string | null;
  peer?: string | null;
  payload: unknown;
}

export class ArchiveDB {
  private db: Database.Database;
  private archiveDir: string;
  private fileLineCounts: Map<string, number> = new Map();

  constructor(baseDir: string) {
    this.archiveDir = baseDir;
    
    // Ensure archive directory exists
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }

    // Initialize SQLite
    const dbPath = path.join(this.archiveDir, 'archive.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    // Load schema
    // Assuming schema is at ../schema/raw-archive.sql relative to this file
    const schemaPath = path.resolve(__dirname, '../schema/raw-archive.sql');
    if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf-8');
        this.db.exec(schema);
    } else {
        // Fallback or error if schema not found? 
        // For testing environment, schema might be elsewhere or we might need to handle it.
        // But in production structure it should be there.
        console.warn(`Schema file not found at ${schemaPath}. Assuming DB is initialized or will be initialized manually.`);
    }
  }

  private getDayFilename(timestamp: string): string {
    // timestamp is ISO 8601 (e.g. 2023-10-27T...)
    return `${timestamp.split('T')[0]}.jsonl`;
  }

  private getLineCount(filename: string): number {
    if (this.fileLineCounts.has(filename)) {
      return this.fileLineCounts.get(filename)!;
    }

    const filePath = path.join(this.archiveDir, filename);
    if (!fs.existsSync(filePath)) {
      this.fileLineCounts.set(filename, 0);
      return 0;
    }

    // Naive line counting. For huge files, this might be slow on startup.
    // Optimizations: store line count in a separate meta file or DB?
    // For now, read file.
    const content = fs.readFileSync(filePath, 'utf-8');
    // Count newlines. 
    // Note: if last line has no newline, it's still a line? 
    // JSONL usually implies newline at end of each record.
    const lines = content.split('\n').length - 1; // Subtract 1 because usually ends with \n

    // Check if file is empty
    if (content.length === 0) return 0;
    
    // If split gives ['{...}', ''] length is 2, so 1 line.
    // If split gives ['{...}', '{...}', ''] length is 3, so 2 lines.
    // Correct.
    this.fileLineCounts.set(filename, lines);
    return lines;
  }

  public appendEvent(params: NewEventParams): HydratedArchiveEvent {
    const {
      parentHash,
      timestamp,
      sessionKey,
      eventType,
      agentId,
      model = null,
      channel = null,
      peer = null,
      payload
    } = params;

    const payloadStr = JSON.stringify(payload);
    
    // Calculate hash
    // hash(parent_hash + timestamp + event_type + agent_id + payload)
    const hashInput = (parentHash || '') + timestamp + eventType + agentId + payloadStr;
    const eventHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    const filename = this.getDayFilename(timestamp);
    const filePath = path.join(this.archiveDir, filename);

    // Get current line count (1-based index for the new line)
    let currentLines = this.getLineCount(filename);
    const payloadLine = currentLines + 1;

    // Construct the full record for JSONL
    // We store the computed hash in the JSONL too for integrity? 
    // The whitepaper says "Full fidelity Raw Archive - Every event appended with SHA-256 hash..."
    const fullRecord = {
      eventHash,
      parentHash,
      timestamp,
      sessionKey,
      eventType,
      agentId,
      model,
      channel,
      peer,
      payload
    };

    // Append to file
    fs.appendFileSync(filePath, JSON.stringify(fullRecord) + '\n');
    
    // Update cache
    this.fileLineCounts.set(filename, payloadLine);

    // Insert into DB
    const insert = this.db.prepare(`
      INSERT INTO archive_events (
        event_hash, parent_hash, timestamp, session_key, event_type, 
        agent_id, model, channel, peer, 
        payload_file, payload_line, payload_text
      ) VALUES (
        ?, ?, ?, ?, ?, 
        ?, ?, ?, ?, 
        ?, ?, ?
      )
    `);

    // Truncate payload for preview
    const payloadText = payloadStr.length > 500 ? payloadStr.substring(0, 500) + '...' : payloadStr;

    insert.run(
      eventHash, parentHash, timestamp, sessionKey, eventType,
      agentId, model, channel, peer,
      filename, payloadLine, payloadText
    );

    return {
      eventHash,
      parentHash,
      timestamp,
      sessionKey,
      eventType: eventType as EventType,
      agentId,
      model,
      channel,
      peer,
      payloadFile: filename,
      payloadLine,
      payloadText,
      payload
    };
  }

  public getEventByHash(hash: string): HydratedArchiveEvent | null {
    const stmt = this.db.prepare('SELECT * FROM archive_events WHERE event_hash = ?');
    const row = stmt.get(hash);

    if (!row) return null;

    return this.hydrateEvent(this.mapRow(row));
  }

  public getEventsBySession(sessionKey: string): HydratedArchiveEvent[] {
    const stmt = this.db.prepare('SELECT * FROM archive_events WHERE session_key = ? ORDER BY timestamp ASC');
    const rows = stmt.all(sessionKey);
    return rows.map(row => this.hydrateEvent(this.mapRow(row)));
  }
  
  public getEventsByTimeRange(start: string, end: string): HydratedArchiveEvent[] {
      const stmt = this.db.prepare('SELECT * FROM archive_events WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC');
      const rows = stmt.all(start, end);
      return rows.map(row => this.hydrateEvent(this.mapRow(row)));
  }

  private mapRow(row: any): RawArchiveEvent {
    return {
      eventHash: row.event_hash,
      parentHash: row.parent_hash,
      timestamp: row.timestamp,
      sessionKey: row.session_key,
      eventType: row.event_type as EventType,
      agentId: row.agent_id,
      model: row.model,
      channel: row.channel,
      peer: row.peer,
      payloadFile: row.payload_file,
      payloadLine: row.payload_line,
      payloadText: row.payload_text
    };
  }

  private hydrateEvent(row: RawArchiveEvent): HydratedArchiveEvent {
    const filePath = path.join(this.archiveDir, row.payloadFile);
    
    try {
      // Reading specific line
      // This is inefficient for random access if we don't have byte offsets.
      // But for "getEventsBySession", if they are in the same file, we could optimize.
      // For now, simple implementation: read file, get line.
      // WARNING: This reads the whole file. 
      // Optimization TODO: Cache file contents or use byte offsets.
      // For a "day" file, it might be few MBs. Acceptable for prototype.
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const lineContent = lines[row.payloadLine - 1]; // 1-based index
      
      if (!lineContent) {
        throw new Error(`Line ${row.payloadLine} not found in ${row.payloadFile}`);
      }
      
      const fullRecord = JSON.parse(lineContent);
      return {
        ...row,
        payload: fullRecord.payload
      };
    } catch (err) {
      console.error(`Failed to hydrate event ${row.eventHash}:`, err);
      return {
        ...row,
        payload: null // Or throw?
      };
    }
  }
}

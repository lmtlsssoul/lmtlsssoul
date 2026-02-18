
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ArchiveDB } from './archive-db.js';
import { EventType } from './types.js';

describe('ArchiveDB', () => {
  let tmpDir: string;
  let dbPath: string;
  let archiveDB: ArchiveDB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-archive-test-'));
    dbPath = path.join(tmpDir, 'archive.db');
    archiveDB = new ArchiveDB(tmpDir); // Pass the root directory
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should initialize the database and tables', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
    // Verify tables exist
    // We can't easily access the private db instance, but we can try to perform an operation
    // or check the file size (it should be > 0)
    const stats = fs.statSync(dbPath);
    expect(stats.size).toBeGreaterThan(0);
  });

  it('should append an event and retrieve it', () => {
    const payload = { content: 'Hello, world!' };
    const eventType: EventType = 'author_message';
    const agentId = 'interface';

    const event = archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date().toISOString(),
      sessionKey: 'lmtlss:interface:123',
      eventType,
      agentId,
      model: 'gpt-4o',
      channel: 'cli',
      peer: 'author',
      payload,
    });

    expect(event.eventHash).toBeDefined();
    expect(event.payloadFile).toMatch(/\d{4}-\d{2}-\d{2}\.jsonl$/);

    // Verify retrieval by hash
    const retrieved = archiveDB.getEventByHash(event.eventHash);
    expect(retrieved).toBeDefined();
    expect(retrieved?.eventHash).toBe(event.eventHash);
    expect(retrieved?.payload).toEqual(payload);
  });

  it('should chain hashes correctly', () => {
    const event1 = archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date().toISOString(),
      sessionKey: 'lmtlss:interface:123',
      eventType: 'author_message',
      agentId: 'interface',
      payload: { msg: 1 },
    });

    const event2 = archiveDB.appendEvent({
      parentHash: event1.eventHash, // Chain to event1
      timestamp: new Date().toISOString(),
      sessionKey: 'lmtlss:interface:123',
      eventType: 'assistant_message',
      agentId: 'interface',
      payload: { msg: 2 },
    });

    expect(event2.parentHash).toBe(event1.eventHash);
    
    // Verify event2's hash depends on event1's hash (implicit in hash calculation, but we can check it's not null)
    expect(event2.eventHash).not.toBe(event1.eventHash);
  });

  it('should retrieve events by session', () => {
    const sessionKey = 'lmtlss:test:session';
    archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date().toISOString(),
      sessionKey,
      eventType: 'author_message',
      agentId: 'interface',
      payload: { msg: 1 },
    });

    archiveDB.appendEvent({
      parentHash: null, // Just for testing, doesn't have to be chained strictly here
      timestamp: new Date().toISOString(),
      sessionKey,
      eventType: 'assistant_message',
      agentId: 'interface',
      payload: { msg: 2 },
    });

    const events = archiveDB.getEventsBySession(sessionKey);
    expect(events).toHaveLength(2);
    expect(events[0].payload).toEqual({ msg: 1 });
    expect(events[1].payload).toEqual({ msg: 2 });
  });

  it('supports chronological retrieval filtered by agent', () => {
    archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date(Date.now() - 5000).toISOString(),
      sessionKey: 'lmtlss:author:a',
      eventType: 'author_message',
      agentId: 'author',
      payload: { text: 'A' },
    });
    archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date(Date.now() - 4000).toISOString(),
      sessionKey: 'lmtlss:interface:b',
      eventType: 'assistant_message',
      agentId: 'interface',
      payload: { text: 'B' },
    });

    const authorEvents = archiveDB.getRecentEvents('author', 5);
    expect(authorEvents).toHaveLength(1);
    expect(authorEvents[0].agentId).toBe('author');
  });
  
  it('should retrieve events by time range', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 10000);
      const future = new Date(now.getTime() + 10000);

      archiveDB.appendEvent({
          parentHash: null,
          timestamp: past.toISOString(),
          sessionKey: 's1',
          eventType: 'system_event',
          agentId: 'system',
          payload: { t: 'past' }
      });
      
      archiveDB.appendEvent({
          parentHash: null,
          timestamp: future.toISOString(),
          sessionKey: 's2',
          eventType: 'system_event',
          agentId: 'system',
          payload: { t: 'future' }
      });

      const rangeEvents = archiveDB.getEventsByTimeRange(
          new Date(now.getTime() - 20000).toISOString(),
          now.toISOString()
      );
      
      expect(rangeEvents).toHaveLength(1);
      expect(rangeEvents[0].payload).toEqual({ t: 'past' });
  });

  it('normalizes legacy event types to canonical lattice protocol names', () => {
    const event = archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date().toISOString(),
      sessionKey: 'lmtlss:interface:legacy',
      eventType: 'user_message',
      agentId: 'author',
      payload: { text: 'legacy write' },
    });

    expect(event.eventType).toBe('author_message');
  });

  it('requires explicit approval payload for world_action events', () => {
    expect(() =>
      archiveDB.appendEvent({
        parentHash: null,
        timestamp: new Date().toISOString(),
        sessionKey: 'lmtlss:interface:world-action',
        eventType: 'world_action',
        agentId: 'interface',
        payload: { action: 'deploy' },
      })
    ).toThrow('world_action events require explicit policy gating payload');
  });

  it('accepts policy-gated world_action events', () => {
    const event = archiveDB.appendEvent({
      parentHash: null,
      timestamp: new Date().toISOString(),
      sessionKey: 'lmtlss:interface:world-action-ok',
      eventType: 'world_action',
      agentId: 'interface',
      payload: { action: 'deploy', approvalId: 'appr_123', approved: true },
    });

    expect(event.eventType).toBe('world_action');
  });
});

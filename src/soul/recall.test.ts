
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ArchiveDB } from './archive-db.js';
import { GraphDB } from './graph-db.js';
import { SoulRecall } from './recall.js';
import { ulid } from 'ulid';

describe('SoulRecall', () => {
  let tmpDir: string;
  let archiveDB: ArchiveDB;
  let graphDB: GraphDB;
  let recall: SoulRecall;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-recall-test-'));
    archiveDB = new ArchiveDB(tmpDir);
    graphDB = new GraphDB(tmpDir);
    recall = new SoulRecall(archiveDB, graphDB);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createEvent = (timestamp: string, content: string, type: any = 'author_message') => {
    return archiveDB.appendEvent({
      parentHash: null,
      timestamp,
      sessionKey: 'test-session',
      eventType: type,
      agentId: 'author',
      payload: { content }
    });
  };

  it('should recall recent events chronologically', () => {
    // Add 5 events
    const events = [];
    for (let i = 0; i < 5; i++) {
      events.push(createEvent(new Date(Date.now() - (5 - i) * 1000).toISOString(), `msg ${i}`));
    }

    const results = recall.recall('irrelevant query', { recentCount: 3 });
    
    expect(results).toHaveLength(3);
    expect(results[0].payload).toEqual({ content: 'msg 2' });
    expect(results[1].payload).toEqual({ content: 'msg 3' });
    expect(results[2].payload).toEqual({ content: 'msg 4' });
  });

  it('should recall semantically relevant events', () => {
    // 1. Create a node about "cats"
    const nodeId = graphDB.createNode({
      premise: 'Author loves cats',
      nodeType: 'preference',
      createdBy: 'test'
    });

    // 2. Create an event about cats
    const catEvent = createEvent(new Date().toISOString(), 'I love cats very much');
    
    // 3. Link event to node
    graphDB.addEvidence({
      nodeId,
      eventHash: catEvent.eventHash,
      linkType: 'supports'
    });

    // 4. Create unrelated events
    createEvent(new Date().toISOString(), 'I like dogs too');
    createEvent(new Date().toISOString(), 'The weather is nice');

    // 5. Search for "cats"
    // Since we use FTS, we need to make sure the lattice search table is updated.
    // better-sqlite3 handles this automatically usually.
    
    // Using a query that matches the premise "Author loves cats"
    const results = recall.recall('cats', { recentCount: 0, semanticCount: 5 });

    expect(results).toHaveLength(1);
    expect(results[0].eventHash).toBe(catEvent.eventHash);
    expect((results[0].payload as any).content).toBe('I love cats very much');
  });

  it('should merge chronological and semantic results', () => {
    // 1. Create old relevant event (semantic)
    const oldDate = new Date(Date.now() - 100000).toISOString();
    const oldEvent = createEvent(oldDate, 'My secret code is 1234');
    
    const nodeId = graphDB.createNode({
      premise: 'Author secret code',
      nodeType: 'preference',
      createdBy: 'test'
    });
    
    graphDB.addEvidence({
      nodeId,
      eventHash: oldEvent.eventHash,
      linkType: 'supports'
    });

    // 2. Create recent irrelevant events (chronological)
    const recentDate1 = new Date(Date.now() - 2000).toISOString();
    const recentEvent1 = createEvent(recentDate1, 'Hello');
    
    const recentDate2 = new Date(Date.now() - 1000).toISOString();
    const recentEvent2 = createEvent(recentDate2, 'How are you?');

    // 3. Recall with query "secret"
    const results = recall.recall('secret', { recentCount: 2, semanticCount: 1 });

    // Should have 3 events: old relevant + 2 recent
    expect(results).toHaveLength(3);
    
    // Check order (oldest first)
    expect(results[0].eventHash).toBe(oldEvent.eventHash);
    expect(results[1].eventHash).toBe(recentEvent1.eventHash);
    expect(results[2].eventHash).toBe(recentEvent2.eventHash);
  });

  it('should deduplicate overlapping events', () => {
    // 1. Create a recent event that is also relevant
    const timestamp = new Date().toISOString();
    const event = createEvent(timestamp, 'I am learning TypeScript');
    
    const nodeId = graphDB.createNode({
      premise: 'Author learning TypeScript',
      nodeType: 'preference',
      createdBy: 'test'
    });
    
    graphDB.addEvidence({
      nodeId,
      eventHash: event.eventHash,
      linkType: 'supports'
    });

    // 2. Recall with query "TypeScript" and recentCount=1
    const results = recall.recall('TypeScript', { recentCount: 1, semanticCount: 1 });

    // Should return 1 event, not 2
    expect(results).toHaveLength(1);
    expect(results[0].eventHash).toBe(event.eventHash);
  });

  it('should respect time range', () => {
    const t1 = new Date('2023-01-01T10:00:00Z').toISOString();
    const t2 = new Date('2023-01-01T11:00:00Z').toISOString();
    const t3 = new Date('2023-01-01T12:00:00Z').toISOString();

    const e1 = createEvent(t1, 'one');
    const e2 = createEvent(t2, 'two');
    const e3 = createEvent(t3, 'three');

    const results = recall.recall('query', {
      timeRange: { start: t1, end: t2 },
      recentCount: 1 // Should be ignored
    });

    expect(results).toHaveLength(2);
    expect(results[0].eventHash).toBe(e1.eventHash);
    expect(results[1].eventHash).toBe(e2.eventHash);
  });
});

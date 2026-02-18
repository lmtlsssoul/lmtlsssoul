
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphDB } from './graph-db.js';
import { SoulCapsule } from './capsule.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SoulCapsule', () => {
  let tmpDir: string;
  let db: GraphDB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-capsule-test-'));
    db = new GraphDB(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should generate an empty capsule when no nodes exist', () => {
    const capsule = new SoulCapsule(db);
    const output = capsule.generate();
    expect(output).toContain('# Soul Capsule');
    expect(output).toContain('(No nodes active)');
  });

  it('should include high salience nodes', () => {
    db.createNode({
      premise: 'I am a test node',
      nodeType: 'identity',
      weight: { salience: 0.9 },
      createdBy: 'test'
    });

    const capsule = new SoulCapsule(db);
    const output = capsule.generate();
    
    expect(output).toContain('# Identity & Self');
    expect(output).toContain('I am a test node');
    expect(output).toContain('(0.90)');
  });

  it('should respect salience ordering', () => {
    db.createNode({
      premise: 'Low salience',
      nodeType: 'premise',
      weight: { salience: 0.1 },
      createdBy: 'test'
    });
    
    db.createNode({
      premise: 'High salience',
      nodeType: 'premise',
      weight: { salience: 0.9 },
      createdBy: 'test'
    });

    const capsule = new SoulCapsule(db);
    const output = capsule.generate();
    
    // High salience should appear before low salience
    const highIndex = output.indexOf('High salience');
    const lowIndex = output.indexOf('Low salience');
    
    expect(highIndex).toBeLessThan(lowIndex);
  });

  it('should group nodes by type', () => {
    db.createNode({
      premise: 'My goal',
      nodeType: 'goal',
      weight: { salience: 0.5 },
      createdBy: 'test'
    });

    db.createNode({
      premise: 'My belief',
      nodeType: 'premise',
      weight: { salience: 0.5 },
      createdBy: 'test'
    });

    const capsule = new SoulCapsule(db);
    const output = capsule.generate();

    expect(output).toContain('## Active Goals');
    expect(output).toContain('## Beliefs & Premises');
  });

  it('should show edges between nodes in the capsule', () => {
    const id1 = db.createNode({
      premise: 'Source Node',
      nodeType: 'premise',
      weight: { salience: 0.8 },
      createdBy: 'test'
    });

    const id2 = db.createNode({
      premise: 'Target Node',
      nodeType: 'premise',
      weight: { salience: 0.8 },
      createdBy: 'test'
    });

    db.createEdge({
      sourceId: id1,
      targetId: id2,
      relation: 'supports'
    });

    const capsule = new SoulCapsule(db);
    const output = capsule.generate();

    expect(output).toContain(`-> supports [${id2}]`);
  });

  it('should truncate output if it exceeds maxChars', () => {
    // Create a large node
    const longText = 'A'.repeat(1000);
    db.createNode({
      premise: longText,
      nodeType: 'premise',
      weight: { salience: 0.9 },
      createdBy: 'test'
    });
    
    // Set a small limit
    const limit = 500;
    const capsule = new SoulCapsule(db, limit);
    const output = capsule.generate();
    
    expect(output.length).toBeLessThanOrEqual(limit + 20); // allow for "... [truncated]"
    expect(output).toContain('[truncated]');
  });
});

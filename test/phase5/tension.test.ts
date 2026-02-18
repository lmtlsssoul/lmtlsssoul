import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GraphDB } from '../../src/soul/graph-db.js';
import { TensionDetector } from '../../src/soul/tension.js';

describe('TensionDetector', () => {
  let tmpDir: string;
  let graphDB: GraphDB;
  let detector: TensionDetector;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-tension-test-'));
    graphDB = new GraphDB(tmpDir);
    detector = new TensionDetector(graphDB);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should detect internal tension: commitment vs uncertainty', () => {
    graphDB.createNode({
      premise: 'I am certain of nothing.',
      nodeType: 'premise',
      createdBy: 'test',
      weight: {
        commitment: 0.9,
        uncertainty: 0.9,
        salience: 0.5
      }
    });

    const tensions = detector.detectAll();
    expect(tensions).toHaveLength(1);
    expect(tensions[0].type).toBe('internal');
    expect(tensions[0].description).toContain('High commitment with high uncertainty');
  });

  it('should detect internal tension: neglected urgency', () => {
    graphDB.createNode({
      premise: 'The house is on fire but I am distracted.',
      nodeType: 'premise',
      createdBy: 'test',
      weight: {
        arousal: 0.9,
        salience: 0.1
      }
    });

    const tensions = detector.detectAll();
    expect(tensions).toHaveLength(1);
    expect(tensions[0].type).toBe('internal');
    expect(tensions[0].description).toContain('neglected urgency');
  });

  it('should detect structural tension: contradictions', () => {
    const id1 = graphDB.createNode({
      premise: 'The sky is always blue.',
      nodeType: 'premise',
      createdBy: 'test',
      weight: { salience: 0.8 }
    });
    const id2 = graphDB.createNode({
      premise: 'The sky is often red.',
      nodeType: 'premise',
      createdBy: 'test',
      weight: { salience: 0.8 }
    });

    graphDB.createEdge({
      sourceId: id1,
      targetId: id2,
      relation: 'contradicts',
      strength: 1.0
    });

    const tensions = detector.detectAll();
    expect(tensions).toHaveLength(1);
    expect(tensions[0].type).toBe('structural');
    expect(tensions[0].description).toContain('Active contradiction');
    expect(tensions[0].severity).toBeGreaterThan(0.5);
  });

  it('should ignore weak structural tensions', () => {
    const id1 = graphDB.createNode({
      premise: 'A',
      nodeType: 'premise',
      createdBy: 'test',
      weight: { salience: 0.1 }
    });
    const id2 = graphDB.createNode({
      premise: 'B',
      nodeType: 'premise',
      createdBy: 'test',
      weight: { salience: 0.1 }
    });

    graphDB.createEdge({
      sourceId: id1,
      targetId: id2,
      relation: 'contradicts',
      strength: 0.5
    });

    const tensions = detector.detectAll();
    expect(tensions).toHaveLength(0);
  });

  it('should sort tensions by severity', () => {
    // Low severity
    graphDB.createNode({
      premise: 'Low',
      nodeType: 'premise',
      createdBy: 'test',
      weight: { commitment: 0.71, uncertainty: 0.71 }
    });
    // High severity
    graphDB.createNode({
      premise: 'High',
      nodeType: 'premise',
      createdBy: 'test',
      weight: { commitment: 0.95, uncertainty: 0.95 }
    });

    const tensions = detector.detectAll();
    expect(tensions).toHaveLength(2);
    expect(tensions[0].severity).toBeGreaterThan(tensions[1].severity);
    expect(tensions[0].description).toContain('High');
  });
});

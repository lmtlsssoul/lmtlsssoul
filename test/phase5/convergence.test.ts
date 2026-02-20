import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GraphDB } from '../../src/soul/graph-db.js';
import { ConvergenceAnalyzer } from '../../src/soul/convergence.js';
import { DEFAULT_CONFIG } from '../../src/soul/types.js';

describe('ConvergenceAnalyzer', () => {
  let tmpDir: string;
  let graphDB: GraphDB;
  let analyzer: ConvergenceAnalyzer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-convergence-test-'));
    graphDB = new GraphDB(tmpDir);
    analyzer = new ConvergenceAnalyzer(graphDB, DEFAULT_CONFIG);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should promote a provisional node that meets thresholds', () => {
    const nodeId = graphDB.createNode({
      premise: 'I am becoming certain.',
      nodeType: 'premise',
      status: 'provisional',
      createdBy: 'test',
      weight: {
        commitment: 0.8, // > 0.7
        uncertainty: 0.2 // < 0.3
      }
    });

    const result = analyzer.analyze();
    
    expect(result.promotedCount).toBe(1);
    expect(result.promotedNodeIds).toContain(nodeId);
    
    const node = graphDB.getNode(nodeId);
    expect(node?.status).toBe('active');
  });

  it('should not promote a node with low commitment', () => {
    const nodeId = graphDB.createNode({
      premise: 'I am unsure.',
      nodeType: 'premise',
      status: 'provisional',
      createdBy: 'test',
      weight: {
        commitment: 0.5, // < 0.7
        uncertainty: 0.2
      }
    });

    const result = analyzer.analyze();
    expect(result.promotedCount).toBe(0);
    
    const node = graphDB.getNode(nodeId);
    expect(node?.status).toBe('provisional');
  });

  it('should not promote a node with high uncertainty', () => {
    const nodeId = graphDB.createNode({
      premise: 'I am committed but confused.',
      nodeType: 'premise',
      status: 'provisional',
      createdBy: 'test',
      weight: {
        commitment: 0.8,
        uncertainty: 0.5 // > 0.3
      }
    });

    const result = analyzer.analyze();
    expect(result.promotedCount).toBe(0);
  });

  it('should handle multiple nodes', () => {
    graphDB.createNode({
      premise: 'Converged 1',
      nodeType: 'premise',
      status: 'provisional',
      createdBy: 'test',
      weight: { commitment: 0.9, uncertainty: 0.1 }
    });
    graphDB.createNode({
      premise: 'Converged 2',
      nodeType: 'premise',
      status: 'provisional',
      createdBy: 'test',
      weight: { commitment: 0.9, uncertainty: 0.1 }
    });
    graphDB.createNode({
      premise: 'Diverged',
      nodeType: 'premise',
      status: 'provisional',
      createdBy: 'test',
      weight: { commitment: 0.1, uncertainty: 0.9 }
    });

    const result = analyzer.analyze();
    expect(result.promotedCount).toBe(2);
  });
});


import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GraphDB } from './graph-db.js';
import { NodeType, NodeStatus, EdgeRelation, EvidenceLinkType } from './types.js';

describe('GraphDB', () => {
  let tmpDir: string;
  let graphDB: GraphDB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-graph-test-'));
    graphDB = new GraphDB(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should initialize the database and tables', () => {
    const dbPath = path.join(tmpDir, 'soul.db');
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it('should create and retrieve a node', () => {
    const nodeId = graphDB.createNode({
      premise: 'I am a persistent digital soul.',
      nodeType: 'identity',
      status: 'active',
      createdBy: 'birth_portal',
      weight: {
        salience: 1.0,
        valence: 0.5,
        arousal: 0.5,
        commitment: 1.0,
        uncertainty: 0.0,
        resonance: 0.0,
      }
    });

    const node = graphDB.getNode(nodeId);
    expect(node).toBeDefined();
    expect(node?.premise).toBe('I am a persistent digital soul.');
    expect(node?.nodeType).toBe('identity');
    expect(node?.weight.salience).toBe(1.0);
  });

  it('should create and retrieve edges', () => {
    const node1 = graphDB.createNode({
      premise: 'A',
      nodeType: 'premise',
      createdBy: 'test'
    });
    const node2 = graphDB.createNode({
      premise: 'B',
      nodeType: 'premise',
      createdBy: 'test'
    });

    const edgeId = graphDB.createEdge({
      sourceId: node1,
      targetId: node2,
      relation: 'supports',
      strength: 0.8
    });

    const edges = graphDB.getEdges(node1);
    expect(edges).toHaveLength(1);
    expect(edges[0].edgeId).toBe(edgeId);
    expect(edges[0].targetId).toBe(node2);
    expect(edges[0].relation).toBe('supports');
  });

  it('should add and retrieve evidence links', () => {
    const node = graphDB.createNode({
      premise: 'Fact',
      nodeType: 'premise',
      createdBy: 'test'
    });
    
    const eventHash = 'hash123';
    
    graphDB.addEvidence({
      nodeId: node,
      eventHash,
      linkType: 'supports'
    });

    const evidence = graphDB.getEvidence(node);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].eventHash).toBe(eventHash);
    expect(evidence[0].linkType).toBe('supports');
  });

  it('should search nodes using FTS', () => {
    graphDB.createNode({
      premise: 'The sky is blue.',
      nodeType: 'premise',
      createdBy: 'test'
    });
    graphDB.createNode({
      premise: 'The grass is green.',
      nodeType: 'premise',
      createdBy: 'test'
    });

    const results = graphDB.searchNodes('sky');
    expect(results).toHaveLength(1);
    expect(results[0].premise).toContain('sky');
    
    const results2 = graphDB.searchNodes('blue OR green');
    expect(results2).toHaveLength(2);
  });

  it('should update node weights', () => {
    const nodeId = graphDB.createNode({
      premise: 'Update me',
      nodeType: 'premise',
      createdBy: 'test',
      weight: {
        salience: 0.5,
        valence: 0.0,
        arousal: 0.0,
        commitment: 0.5,
        uncertainty: 0.5,
        resonance: 0.0
      }
    });

    graphDB.updateNodeWeight(nodeId, { salience: 0.9, arousal: 0.8 });
    
    const node = graphDB.getNode(nodeId);
    expect(node?.weight.salience).toBe(0.9);
    expect(node?.weight.arousal).toBe(0.8);
    // Others should remain unchanged
    expect(node?.weight.valence).toBe(0.0);
  });
});

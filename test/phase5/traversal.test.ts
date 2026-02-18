import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { GraphDB } from '../../src/soul/graph-db.js';
import { GraphTraversal } from '../../src/soul/traversal.js';

describe('GraphTraversal', () => {
  let tmpDir: string;
  let graphDB: GraphDB;
  let traversal: GraphTraversal;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-traversal-test-'));
    graphDB = new GraphDB(tmpDir);
    traversal = new GraphTraversal(graphDB);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Setup a simple graph:
   * A -> B (supports)
   * B -> C (refines)
   * A -> D (contradicts)
   * E -> A (related_to)
   */
  const setupGraph = () => {
    const nodeA = graphDB.createNode({ premise: 'A', nodeType: 'premise', createdBy: 'test' });
    const nodeB = graphDB.createNode({ premise: 'B', nodeType: 'premise', createdBy: 'test' });
    const nodeC = graphDB.createNode({ premise: 'C', nodeType: 'premise', createdBy: 'test' });
    const nodeD = graphDB.createNode({ premise: 'D', nodeType: 'premise', createdBy: 'test' });
    const nodeE = graphDB.createNode({ premise: 'E', nodeType: 'premise', createdBy: 'test' });

    graphDB.createEdge({ sourceId: nodeA, targetId: nodeB, relation: 'supports' });
    graphDB.createEdge({ sourceId: nodeB, targetId: nodeC, relation: 'refines' });
    graphDB.createEdge({ sourceId: nodeA, targetId: nodeD, relation: 'contradicts' });
    graphDB.createEdge({ sourceId: nodeE, targetId: nodeA, relation: 'related_to' });

    return { nodeA, nodeB, nodeC, nodeD, nodeE };
  };

  it('should traverse BFS outbound from A', () => {
    const { nodeA, nodeB, nodeC, nodeD } = setupGraph();
    
    const result = traversal.bfs(nodeA, { direction: 'outbound' });
    
    expect(result.nodeIds.has(nodeA)).toBe(true);
    expect(result.nodeIds.has(nodeB)).toBe(true);
    expect(result.nodeIds.has(nodeC)).toBe(true);
    expect(result.nodeIds.has(nodeD)).toBe(true);
    expect(result.nodeIds.size).toBe(4);
    expect(result.edges).toHaveLength(3);
  });

  it('should traverse BFS inbound from A', () => {
    const { nodeA, nodeE } = setupGraph();
    
    const result = traversal.bfs(nodeA, { direction: 'inbound' });
    
    expect(result.nodeIds.has(nodeA)).toBe(true);
    expect(result.nodeIds.has(nodeE)).toBe(true);
    expect(result.nodeIds.size).toBe(2);
    expect(result.edges).toHaveLength(1);
  });

  it('should traverse BFS both directions from A', () => {
    const { nodeA, nodeB, nodeC, nodeD, nodeE } = setupGraph();
    
    const result = traversal.bfs(nodeA, { direction: 'both' });
    
    expect(result.nodeIds.size).toBe(5);
    expect(result.edges).toHaveLength(4);
  });

  it('should respect maxDepth in BFS', () => {
    const { nodeA, nodeB, nodeC } = setupGraph();
    
    const result = traversal.bfs(nodeA, { direction: 'outbound', maxDepth: 1 });
    
    expect(result.nodeIds.has(nodeA)).toBe(true);
    expect(result.nodeIds.has(nodeB)).toBe(true);
    expect(result.nodeIds.has(nodeC)).toBe(false); // C is at depth 2
    expect(result.nodeIds.size).toBe(3); // A, B, D
  });

  it('should filter by relation', () => {
    const { nodeA, nodeB, nodeD } = setupGraph();
    
    const result = traversal.bfs(nodeA, { 
      direction: 'outbound', 
      relations: ['supports'] 
    });
    
    expect(result.nodeIds.has(nodeA)).toBe(true);
    expect(result.nodeIds.has(nodeB)).toBe(true);
    expect(result.nodeIds.has(nodeD)).toBe(false); // D is connected via 'contradicts'
    expect(result.nodeIds.size).toBe(2);
  });

  it('should traverse DFS outbound from A', () => {
    const { nodeA, nodeB, nodeC, nodeD } = setupGraph();
    
    const result = traversal.dfs(nodeA, { direction: 'outbound' });
    
    expect(result.nodeIds.has(nodeA)).toBe(true);
    expect(result.nodeIds.has(nodeB)).toBe(true);
    expect(result.nodeIds.has(nodeC)).toBe(true);
    expect(result.nodeIds.has(nodeD)).toBe(true);
    expect(result.nodeIds.size).toBe(4);
  });

  it('should include nodes in result', () => {
    const { nodeA, nodeB } = setupGraph();
    
    const result = traversal.bfs(nodeA, { 
      direction: 'outbound', 
      maxDepth: 1,
      includeNodes: true 
    });
    
    expect(result.nodes).toBeDefined();
    expect(result.nodes?.length).toBe(3); // A, B, D
    expect(result.nodes?.find(n => n.nodeId === nodeA)).toBeDefined();
    expect(result.nodes?.find(n => n.nodeId === nodeB)).toBeDefined();
  });
});


import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GraphDB } from './graph-db.js';
import { SoulCompiler } from './compiler.js';
import { latticeUpdateProposal } from './types.js';

describe('SoulCompiler', () => {
  let tmpDir: string;
  let graph: GraphDB;
  let compiler: SoulCompiler;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'compiler-test-'));
    graph = new GraphDB(tmpDir);
    compiler = new SoulCompiler(graph);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should validate a valid proposal', () => {
    const proposal: latticeUpdateProposal = {
      add: [
        { premise: 'Test premise', nodeType: 'premise', weight: { salience: 0.8 } }
      ],
      reinforce: [],
      contradict: [],
      edges: []
    };

    const errors = compiler.validateProposal(proposal);
    expect(errors).toHaveLength(0);
  });

  it('should reject invalid node types', () => {
    const proposal: latticeUpdateProposal = {
      add: [
        { premise: 'Test', nodeType: 'invalid_type' as any, weight: {} }
      ],
      reinforce: [],
      contradict: [],
      edges: []
    };

    const errors = compiler.validateProposal(proposal);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('Invalid or missing nodeType');
  });

  it('should compile additions correctly', () => {
    const proposal: latticeUpdateProposal = {
      add: [
        { premise: 'Sky is blue', nodeType: 'premise', weight: { salience: 0.9 } }
      ],
      reinforce: [],
      contradict: [],
      edges: []
    };

    compiler.compile(proposal, 'agent-007');

    const nodes = graph.searchNodes('Sky is blue');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].premise).toBe('Sky is blue');
    expect(nodes[0].weight.salience).toBe(0.9);
    expect(nodes[0].createdBy).toBe('agent-007');
  });

  it('should compile reinforcements correctly', () => {
    // Setup: create a node first
    const nodeId = graph.createNode({
      premise: 'Existing premise',
      nodeType: 'premise',
      weight: { salience: 0.5, commitment: 0.5, uncertainty: 0.5 },
      createdBy: 'setup'
    });

    const proposal: latticeUpdateProposal = {
      add: [],
      reinforce: [nodeId],
      contradict: [],
      edges: []
    };

    compiler.compile(proposal, 'agent-007');

    const updatedNode = graph.getNode(nodeId);
    expect(updatedNode).not.toBeNull();
    // Reinforce: salience +0.1, commitment +0.1, uncertainty -0.1
    expect(updatedNode!.weight.salience).toBeCloseTo(0.6);
    expect(updatedNode!.weight.commitment).toBeCloseTo(0.6);
    expect(updatedNode!.weight.uncertainty).toBeCloseTo(0.4);
  });

  it('should compile contradictions correctly', () => {
    // Setup: create a node first
    const nodeId = graph.createNode({
      premise: 'Wrong premise',
      nodeType: 'premise',
      weight: { salience: 0.5, commitment: 0.8, uncertainty: 0.2 },
      createdBy: 'setup'
    });

    const proposal: latticeUpdateProposal = {
      add: [],
      reinforce: [],
      contradict: [nodeId],
      edges: []
    };

    compiler.compile(proposal, 'agent-007');

    const updatedNode = graph.getNode(nodeId);
    expect(updatedNode).not.toBeNull();
    // Contradict: commitment -0.3, salience -0.1, uncertainty +0.3
    expect(updatedNode!.weight.commitment).toBeCloseTo(0.5);
    expect(updatedNode!.weight.salience).toBeCloseTo(0.4);
    expect(updatedNode!.weight.uncertainty).toBeCloseTo(0.5);
  });

  it('should compile edges correctly', () => {
    const sourceId = graph.createNode({ premise: 'Source', nodeType: 'premise', createdBy: 'setup' });
    const targetId = graph.createNode({ premise: 'Target', nodeType: 'premise', createdBy: 'setup' });

    const proposal: latticeUpdateProposal = {
      add: [],
      reinforce: [],
      contradict: [],
      edges: [
        { source: sourceId, target: targetId, relation: 'supports' }
      ]
    };

    compiler.compile(proposal, 'agent-007');

    const edges = graph.getEdges(sourceId);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceId).toBe(sourceId);
    expect(edges[0].targetId).toBe(targetId);
    expect(edges[0].relation).toBe('supports');
  });

  it('should regenerate capsule', () => {
    // Add some nodes to make capsule non-empty
    graph.createNode({ premise: 'Core Identity', nodeType: 'identity', weight: { salience: 1.0 }, createdBy: 'setup' });
    
    const outputPath = path.join(tmpDir, 'SOUL.md');
    const content = compiler.regenerateCapsule(outputPath);

    expect(content).toContain('# Soul Capsule');
    expect(content).toContain('Core Identity');
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.readFileSync(outputPath, 'utf-8')).toBe(content);
  });
});

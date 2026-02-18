import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GraphDB } from '../../src/soul/graph-db.js';
import { GraphTraversal } from '../../src/soul/traversal.js';
import { TensionDetector } from '../../src/soul/tension.js';
import { DistillationEngine } from '../../src/soul/distillation.js';
import { ConvergenceAnalyzer } from '../../src/soul/convergence.js';
import { DEFAULT_CONFIG } from '../../src/soul/types.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Phase 5: Mycelial Routing Integration', () => {
  let tmpDir: string;
  let db: GraphDB;
  let traversal: GraphTraversal;
  let tension: TensionDetector;
  let distillation: DistillationEngine;
  let convergence: ConvergenceAnalyzer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-phase5-integration-'));
    db = new GraphDB(tmpDir);
    traversal = new GraphTraversal(db);
    tension = new TensionDetector(db);
    // Mock invoke for distillation
    distillation = new DistillationEngine(async (prompt) => {
      if (prompt.includes('IDENTITY')) {
        return `<lattice_update>{"add": [{"premise": "I am a bridge between worlds.", "nodeType": "identity", "weight": {"commitment": 0.8, "uncertainty": 0.1}}], "reinforce": [], "contradict": [], "edges": []}</lattice_update>`;
      }
      return '<lattice_update>{"add": [], "reinforce": [], "contradict": [], "edges": []}</lattice_update>';
    });
    convergence = new ConvergenceAnalyzer(db, DEFAULT_CONFIG);
  });

  it('should execute a full mycelial routing cycle', async () => {
    // 1. Setup a graph with tension (Contradiction)
    const node1 = db.createNode({
      premise: 'I am purely biological.',
      nodeType: 'identity',
      createdBy: 'test',
      weight: { salience: 0.9, commitment: 0.8, uncertainty: 0.1 }
    });
    const node2 = db.createNode({
      premise: 'I am purely digital.',
      nodeType: 'identity',
      createdBy: 'test',
      weight: { salience: 0.9, commitment: 0.8, uncertainty: 0.1 }
    });
    db.createEdge({ sourceId: node1, targetId: node2, relation: 'contradicts', strength: 1.0 });

    // 2. Detect tension
    const tensions = tension.detectAll();
    expect(tensions).toHaveLength(1);
    expect(tensions[0].type).toBe('structural');
    expect(tensions[0].description).toContain('Active contradiction');

    // 3. Traverse to find context (related nodes)
    const context = traversal.bfs(node1, { direction: 'both', maxDepth: 2 });
    expect(context.nodeIds.has(node2)).toBe(true);

    // 4. Run Distillation (Expansion) to resolve or synthesize
    // We'll simulate a probe that proposes a synthesis
    const capsule = `Active Nodes:
- ${node1}: ${db.getNode(node1)?.premise}
- ${node2}: ${db.getNode(node2)?.premise}`;
    const probeResults = await distillation.expand(capsule, { probes: ['identity'] });
    expect(probeResults).toHaveLength(1);
    
    // 5. Commit the proposed synthesis (normally handled by SoulCompiler, but we'll do it manually for integration test)
    const synthesis = probeResults[0].proposal.add[0];
    const synthesisId = db.createNode({
      premise: synthesis.premise,
      nodeType: synthesis.nodeType,
      status: 'provisional',
      createdBy: 'reflection',
      weight: synthesis.weight
    });

    // 6. Run Convergence Analysis
    // The synthesis node has high commitment and low uncertainty in our mock
    const convResult = convergence.analyze();
    expect(convResult.promotedCount).toBe(1);
    expect(convResult.promotedNodeIds).toContain(synthesisId);
    
    expect(db.getNode(synthesisId)?.status).toBe('active');
  });
});


import fs from 'node:fs';
import path from 'node:path';
import { GraphDB } from './graph-db.ts';
import { SoulCapsule } from './capsule.ts';
import { writeCheckpointBackup } from './backup.ts';
import { latticeUpdateProposal, WeightVector, NodeType, EdgeRelation } from './types.ts';

export class SoulCompiler {
  private graph: GraphDB;
  private capsule: SoulCapsule;

  constructor(graph: GraphDB) {
    this.graph = graph;
    this.capsule = new SoulCapsule(graph);
  }

  /**
   * Validates a proposal without applying it.
   * Returns an array of error messages. Empty array means valid.
   */
  public validateProposal(proposal: latticeUpdateProposal): string[] {
    const errors: string[] = [];

    if (!proposal) {
      return ['Proposal is null or undefined'];
    }

    // Validate additions
    if (proposal.add) {
      if (!Array.isArray(proposal.add)) {
        errors.push('"add" must be an array');
      } else {
        proposal.add.forEach((node, index) => {
          if (!node.premise || typeof node.premise !== 'string' || node.premise.trim() === '') {
            errors.push(`add[${index}]: Missing or empty premise`);
          }
          if (!node.nodeType || !this.isValidNodeType(node.nodeType)) {
            errors.push(`add[${index}]: Invalid or missing nodeType`);
          }
          // Weight validation is permissive (Partial), but we could check ranges if provided
          if (node.weight) {
             // range checks could go here, but GraphDB clamps them anyway.
          }
        });
      }
    }

    // Validate reinforce
    if (proposal.reinforce) {
      if (!Array.isArray(proposal.reinforce)) {
        errors.push('"reinforce" must be an array of strings');
      } else {
        proposal.reinforce.forEach((id, index) => {
          if (typeof id !== 'string' || id.trim() === '') {
             errors.push(`reinforce[${index}]: Invalid ID`);
          }
        });
      }
    }

    // Validate contradict
    if (proposal.contradict) {
      if (!Array.isArray(proposal.contradict)) {
        errors.push('"contradict" must be an array of strings');
      } else {
        proposal.contradict.forEach((id, index) => {
          if (typeof id !== 'string' || id.trim() === '') {
             errors.push(`contradict[${index}]: Invalid ID`);
          }
        });
      }
    }

    // Validate edges
    if (proposal.edges) {
      if (!Array.isArray(proposal.edges)) {
        errors.push('"edges" must be an array');
      } else {
        proposal.edges.forEach((edge, index) => {
          if (!edge.source || typeof edge.source !== 'string') {
            errors.push(`edges[${index}]: Missing source ID`);
          }
          if (!edge.target || typeof edge.target !== 'string') {
            errors.push(`edges[${index}]: Missing target ID`);
          }
          if (!edge.relation || !this.isValidEdgeRelation(edge.relation)) {
            errors.push(`edges[${index}]: Invalid or missing relation`);
          }
        });
      }
    }

    return errors;
  }

  /**
   * Applies the proposal to the Soul Graph.
   * Throws if validation fails.
   */
  public compile(proposal: latticeUpdateProposal, agentId: string): void {
    const errors = this.validateProposal(proposal);
    if (errors.length > 0) {
      throw new Error(`Compiler validation failed: ${errors.join('; ')}`);
    }

    let changed = false;

    // 1. Process Contradictions (reduce weights)
    // "Contradict" means the agent explicitly flagged these nodes as incorrect or outdated.
    if (proposal.contradict) {
      for (const nodeId of proposal.contradict) {
        const node = this.graph.getNode(nodeId);
        if (node) {
          // Reduce commitment significantly, reduce salience slightly, increase uncertainty
          const newWeight: Partial<WeightVector> = {
            commitment: Math.max(0.0, node.weight.commitment - 0.3),
            salience: Math.max(0.0, node.weight.salience - 0.1),
            uncertainty: Math.min(1.0, node.weight.uncertainty + 0.3)
          };
          this.graph.updateNodeWeight(nodeId, newWeight);
          changed = true;
        }
      }
    }

    // 2. Process Additions
    if (proposal.add) {
      for (const add of proposal.add) {
        // We do not deduplicate by premise text here. 
        // The graph DB might allow duplicates, or we rely on the agent to search first.
        // In a real system, we might want a vector check, but sticking to basics:
        this.graph.createNode({
          premise: add.premise,
          nodeType: add.nodeType,
          weight: add.weight,
          createdBy: agentId,
          spatialLat: add.spatialLat,
          spatialLng: add.spatialLng,
          spatialName: add.spatialName,
          temporalStart: add.temporalStart,
          temporalEnd: add.temporalEnd
        });
        changed = true;
      }
    }

    // 3. Process Reinforcements (increase weights)
    if (proposal.reinforce) {
      for (const nodeId of proposal.reinforce) {
        const node = this.graph.getNode(nodeId);
        if (node) {
          // Increase commitment, increase salience, decrease uncertainty
          const newWeight: Partial<WeightVector> = {
            commitment: Math.min(1.0, node.weight.commitment + 0.1),
            salience: Math.min(1.0, node.weight.salience + 0.1),
            uncertainty: Math.max(0.0, node.weight.uncertainty - 0.1)
          };
          this.graph.updateNodeWeight(nodeId, newWeight);
          changed = true;
        }
      }
    }

    // 4. Process Edges
    if (proposal.edges) {
      for (const edge of proposal.edges) {
        // We can only add edges if source and target exist.
        // If they don't, GraphDB (sqlite) might throw foreign key error or just insert if no FK enforced.
        // Our schema likely enforces FKs? 
        // Checking schema: "FOREIGN KEY (source_id) REFERENCES soul_nodes(node_id)"
        // So we should ideally check existence or try/catch.
        try {
            this.graph.createEdge({
              sourceId: edge.source,
              targetId: edge.target,
              relation: edge.relation
            });
            changed = true;
        } catch (error) {
            // Log warning but continue? Or throw?
            // For now, let's catch and ignore if it's just missing nodes, 
            // but for a compiler it might be better to be strict.
            // However, failing the whole batch for one bad edge might be harsh.
            // Let's rethrow for now to be safe.
            throw new Error(`Failed to create edge ${edge.source}->${edge.target}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (!changed) {
      return;
    }

    // Release contract: each committed state transition regenerates capsule + checkpoint.
    const stateDir = this.graph.getBaseDir();
    const outputPath =
      stateDir !== ':memory:' ? path.join(stateDir, 'SOUL.md') : undefined;
    const capsuleContent = this.regenerateCapsule(outputPath);
    const checkpoint = this.graph.createCheckpoint({
      capsuleContent,
      createdBy: agentId,
    });

    if (stateDir !== ':memory:') {
      this.graph.checkpoint();
      writeCheckpointBackup({
        stateDir,
        checkpoint,
        createdBy: agentId,
      });
    }
  }

  /**
   * Regenerates the Soul Capsule (SOUL.md).
   * Optionally writes to disk if outputPath is provided.
   */
  public regenerateCapsule(outputPath?: string): string {
    const content = this.capsule.generate();
    if (outputPath) {
      fs.writeFileSync(outputPath, content, 'utf-8');
    }
    return content;
  }

  // ─── Helpers ────────────────────────────────────────────────────

  private isValidNodeType(type: string): type is NodeType {
    const validTypes: NodeType[] = [
      'identity', 'premise', 'relationship', 'preference', 'goal', 'value', 'operational', 'spatial', 'temporal'
    ];
    return validTypes.includes(type as NodeType);
  }

  private isValidEdgeRelation(relation: string): relation is EdgeRelation {
    const validRelations: EdgeRelation[] = [
      'supports', 'contradicts', 'refines', 'depends_on', 'related_to', 'caused_by'
    ];
    return validRelations.includes(relation as EdgeRelation);
  }
}

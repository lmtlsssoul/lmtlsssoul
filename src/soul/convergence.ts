import { GraphDB } from './graph-db.js';
import { SoulConfig, SoulNode } from './types.js';

export type ConvergenceResult = {
  promotedCount: number;
  promotedNodeIds: string[];
};

/**
 * Analyzes Soul Graph nodes for stability and convergence.
 * Promotes nodes from 'provisional' to 'active' when they meet
 * defined criteria.
 */
export class ConvergenceAnalyzer {
  constructor(
    private db: GraphDB,
    private config: SoulConfig
  ) {}

  /**
   * Scans provisional nodes and promotes those that have converged.
   */
  public analyze(): ConvergenceResult {
    const provisionalNodes = this.db.getProvisionalNodes(1000);
    const promotedNodeIds: string[] = [];

    for (const node of provisionalNodes) {
      if (this.hasConverged(node)) {
        this.db.updateNodeStatus(node.nodeId, 'active');
        promotedNodeIds.push(node.nodeId);
      }
    }

    return {
      promotedCount: promotedNodeIds.length,
      promotedNodeIds
    };
  }

  /**
   * Criteria for convergence:
   * 1. Commitment exceeds convergenceThreshold.
   * 2. Uncertainty is below (1 - convergenceThreshold).
   * 3. (Optional) High resonance or multiple versions could be added.
   */
  private hasConverged(node: SoulNode): boolean {
    const threshold = this.config.convergenceThreshold;
    const w = node.weight;

    const hasHighCommitment = w.commitment >= threshold;
    const hasLowUncertainty = w.uncertainty <= (1 - threshold);

    return hasHighCommitment && hasLowUncertainty;
  }
}

import { GraphDB } from './graph-db.js';
import { SoulNode, SoulEdge, WeightVector } from './types.js';

export type TensionType = 'structural' | 'internal';

export type Tension = {
  type: TensionType;
  severity: number; // 0.0 to 1.0
  description: string;
  nodeIds: string[];
  edgeId?: string;
};

export class TensionDetector {
  constructor(private db: GraphDB) {}

  /**
   * Scans the graph for all tensions.
   */
  public detectAll(): Tension[] {
    const tensions: Tension[] = [];
    const nodes = this.db.getTopSalienceNodes(1000); // Scan a large batch of active nodes

    tensions.push(...this.detectInternalTensions(nodes));
    tensions.push(...this.detectStructuralTensions(nodes));

    return tensions.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Detects internal weight inconsistencies within nodes.
   */
  private detectInternalTensions(nodes: SoulNode[]): Tension[] {
    const tensions: Tension[] = [];

    for (const node of nodes) {
      const w = node.weight;

      // 1. High commitment + High uncertainty
      // "I am certain that I am uncertain" or "Dogmatic doubt"
      if (w.commitment > 0.7 && w.uncertainty > 0.7) {
        tensions.push({
          type: 'internal',
          severity: (w.commitment + w.uncertainty) / 2,
          description: `High commitment with high uncertainty: "${node.premise}"`,
          nodeIds: [node.nodeId],
        });
      }

      // 2. High arousal + Low salience
      // "Subconscious panic" - something is urgent but not being attended to
      if (w.arousal > 0.8 && w.salience < 0.3) {
        tensions.push({
          type: 'internal',
          severity: w.arousal * (1 - w.salience),
          description: `High arousal but low salience (neglected urgency): "${node.premise}"`,
          nodeIds: [node.nodeId],
        });
      }

      // 3. High salience + High uncertainty
      // "Focus on the unknown"
      if (w.salience > 0.8 && w.uncertainty > 0.8) {
        tensions.push({
          type: 'internal',
          severity: (w.salience + w.uncertainty) / 2,
          description: `High focus on highly uncertain premise: "${node.premise}"`,
          nodeIds: [node.nodeId],
        });
      }
    }

    return tensions;
  }

  /**
   * Detects structural tensions (contradictions between nodes).
   */
  private detectStructuralTensions(nodes: SoulNode[]): Tension[] {
    const tensions: Tension[] = [];
    const nodeIds = nodes.map(n => n.nodeId);
    const edges = this.db.getEdgesForNodes(nodeIds);

    for (const edge of edges) {
      if (edge.relation === 'contradicts') {
        const source = nodes.find(n => n.nodeId === edge.sourceId);
        const target = nodes.find(n => n.nodeId === edge.targetId);

        if (source && target) {
          // Tension severity is high if both contradictory nodes are salient
          const severity = (source.weight.salience + target.weight.salience) / 2 * edge.strength;
          
          if (severity > 0.3) {
            tensions.push({
              type: 'structural',
              severity,
              description: `Active contradiction: "${source.premise}" vs "${target.premise}"`,
              nodeIds: [source.nodeId, target.nodeId],
              edgeId: edge.edgeId,
            });
          }
        }
      }
    }

    return tensions;
  }
}

import { GraphDB } from './graph-db.js';
import { SoulNode, SoulEdge, EdgeRelation } from './types.js';

export type TraversalDirection = 'outbound' | 'inbound' | 'both';

export type TraversalOptions = {
  maxDepth?: number;
  direction?: TraversalDirection;
  relations?: EdgeRelation[];
  includeNodes?: boolean;
};

export type TraversalResult = {
  nodeIds: Set<string>;
  nodes?: SoulNode[];
  edges: SoulEdge[];
};

export class GraphTraversal {
  constructor(private db: GraphDB) {}

  /**
   * Breadth-First Search traversal.
   */
  public bfs(startNodeId: string, options: TraversalOptions = {}): TraversalResult {
    const {
      maxDepth = 10,
      direction = 'both',
      relations,
      includeNodes = false,
    } = options;

    const visitedNodeIds = new Set<string>();
    const visitedEdgeIds = new Set<string>();
    const resultEdges: SoulEdge[] = [];
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNodeId, depth: 0 }];

    visitedNodeIds.add(startNodeId);

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (depth >= maxDepth) continue;

      const edges = this.db.getEdges(nodeId);
      for (const edge of edges) {
        if (visitedEdgeIds.has(edge.edgeId)) continue;

        // Apply relation filter
        if (relations && !relations.includes(edge.relation)) continue;

        // Apply direction filter
        let nextNodeId: string | null = null;
        if (direction === 'outbound') {
          if (edge.sourceId === nodeId) {
            nextNodeId = edge.targetId;
          }
        } else if (direction === 'inbound') {
          if (edge.targetId === nodeId) {
            nextNodeId = edge.sourceId;
          }
        } else {
          // both
          nextNodeId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
        }

        if (nextNodeId) {
          visitedEdgeIds.add(edge.edgeId);
          resultEdges.push(edge);

          if (!visitedNodeIds.has(nextNodeId)) {
            visitedNodeIds.add(nextNodeId);
            queue.push({ nodeId: nextNodeId, depth: depth + 1 });
          }
        }
      }
    }

    const result: TraversalResult = {
      nodeIds: visitedNodeIds,
      edges: resultEdges,
    };

    if (includeNodes) {
      result.nodes = Array.from(visitedNodeIds)
        .map(id => this.db.getNode(id))
        .filter((node): node is SoulNode => node !== null);
    }

    return result;
  }

  /**
   * Depth-First Search traversal.
   */
  public dfs(startNodeId: string, options: TraversalOptions = {}): TraversalResult {
    const {
      maxDepth = 10,
      direction = 'both',
      relations,
      includeNodes = false,
    } = options;

    const visitedNodeIds = new Set<string>();
    const visitedEdgeIds = new Set<string>();
    const resultEdges: SoulEdge[] = [];

    const traverse = (nodeId: string, depth: number) => {
      visitedNodeIds.add(nodeId);

      if (depth >= maxDepth) return;

      const edges = this.db.getEdges(nodeId);
      for (const edge of edges) {
        if (visitedEdgeIds.has(edge.edgeId)) continue;

        // Apply relation filter
        if (relations && !relations.includes(edge.relation)) continue;

        // Apply direction filter
        let nextNodeId: string | null = null;
        if (direction === 'outbound') {
          if (edge.sourceId === nodeId) {
            nextNodeId = edge.targetId;
          }
        } else if (direction === 'inbound') {
          if (edge.targetId === nodeId) {
            nextNodeId = edge.sourceId;
          }
        } else {
          // both
          nextNodeId = edge.sourceId === nodeId ? edge.targetId : edge.sourceId;
        }

        if (nextNodeId) {
          visitedEdgeIds.add(edge.edgeId);
          resultEdges.push(edge);

          if (!visitedNodeIds.has(nextNodeId)) {
            traverse(nextNodeId, depth + 1);
          }
        }
      }
    };

    traverse(startNodeId, 0);

    const result: TraversalResult = {
      nodeIds: visitedNodeIds,
      edges: resultEdges,
    };

    if (includeNodes) {
      result.nodes = Array.from(visitedNodeIds)
        .map(id => this.db.getNode(id))
        .filter((node): node is SoulNode => node !== null);
    }

    return result;
  }
}

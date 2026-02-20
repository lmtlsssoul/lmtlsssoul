import { GraphDB } from './graph-db.js';
import { SoulNode, SoulEdge, NodeType } from './types.js';

export class SoulCapsule {
  private db: GraphDB;
  private maxChars: number;

  constructor(db: GraphDB, maxChars: number = 8000) {
    this.db = db;
    this.maxChars = maxChars;
  }

  public generate(): string {
    // 1. Fetch top nodes by salience
    // We fetch a bit more than we might need to ensure we have candidates
    // if we need to filter or if the graph is small.
    const nodes = this.db.getTopSalienceNodes(100);

    if (nodes.length === 0) {
      return this.formatEmptyCapsule();
    }

    // 2. Fetch edges strictly within this set
    const nodeIds = nodes.map(n => n.nodeId);
    const edges = this.db.getEdgesForNodes(nodeIds);

    // 3. Group nodes by type
    const grouped = this.groupNodes(nodes);

    // 4. Build Markdown
    let content = `# Soul Capsule\nGenerated: ${new Date().toISOString()}\n\n`;

    // Order of presentation matters for LLM attention?
    // Identity > Goals > Values > Others
    const order: NodeType[] = [
      'identity',
      'goal',
      'value',
      'premise',
      'relationship',
      'preference',
      'spatial',
      'temporal',
      'operational'
    ];

    for (const type of order) {
      if (grouped[type] && grouped[type].length > 0) {
        content += `## ${this.formatTypeHeader(type)}\n`;
        for (const node of grouped[type]) {
          content += this.formatNode(node, edges);
        }
        content += '\n';
      }
    }

    // 5. Truncate if necessary (naive truncation for now, can be smarter later)
    if (content.length > this.maxChars) {
        // Find the last newline before the limit to avoid cutting a line
        const cutOff = this.findLastNewline(content, this.maxChars);
        content = content.substring(0, cutOff > 0 ? cutOff : this.maxChars);
        content += '\n... [truncated]';
    }

    return content;
  }

  private formatEmptyCapsule(): string {
    return `# Soul Capsule\nGenerated: ${new Date().toISOString()}\n\n(No nodes active)`;
  }

  private groupNodes(nodes: SoulNode[]): Record<NodeType, SoulNode[]> {
    const groups: Record<NodeType, SoulNode[]> = {
      identity: [],
      premise: [],
      relationship: [],
      preference: [],
      goal: [],
      value: [],
      operational: [],
      spatial: [],
      temporal: []
    };

    for (const node of nodes) {
      if (groups[node.nodeType]) {
        groups[node.nodeType].push(node);
      }
    }

    return groups;
  }

  private formatTypeHeader(type: NodeType): string {
    switch (type) {
        case 'identity': return 'Identity & Self';
        case 'goal': return 'Active Goals';
        case 'value': return 'Core Values';
        case 'premise': return 'Beliefs & Premises';
        case 'relationship': return 'Relationships';
        case 'preference': return 'Preferences';
        case 'operational': return 'Operational Knowledge';
        case 'spatial': return 'Spatial Awareness';
        case 'temporal': return 'Temporal Awareness';
        default: return 'Other';
    }
  }

  private formatNode(node: SoulNode, allEdges: SoulEdge[]): string {
    // Format: - [ID] (Salience) Premise
    let line = `- [${node.nodeId}] (${node.weight.salience.toFixed(2)}) ${node.premise}`;
    
    // Add spatiotemporal metadata if present
    if (node.spatialName || (node.spatialLat !== undefined && node.spatialLng !== undefined)) {
        const parts: string[] = [];
        if (node.spatialName) parts.push(node.spatialName);
        if (node.spatialLat !== undefined && node.spatialLng !== undefined) {
            parts.push(`${node.spatialLat.toFixed(4)}, ${node.spatialLng.toFixed(4)}`);
        }
        line += ` (@ ${parts.join(' ')})`;
    }

    if (node.temporalStart || node.temporalEnd) {
        const parts: string[] = [];
        if (node.temporalStart) parts.push(`from: ${node.temporalStart}`);
        if (node.temporalEnd) parts.push(`to: ${node.temporalEnd}`);
        line += ` (# ${parts.join(' ')})`;
    }

    line += '\n';
    
    // Find outgoing edges from this node
    const relevantEdges = allEdges.filter(e => e.sourceId === node.nodeId);
    
    if (relevantEdges.length > 0) {
        for (const edge of relevantEdges) {
            line += `  -> ${edge.relation} [${edge.targetId}]\n`;
        }
    }

    return line;
  }

  private findLastNewline(text: string, from: number): number {
    const start = Math.min(from, text.length - 1);
    for (let i = start; i >= 0; i -= 1) {
      if (text[i] === '\n') {
        return i;
      }
    }
    return -1;
  }
}

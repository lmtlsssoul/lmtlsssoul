import { latticeUpdateProposal, ProposedNode, NodeType } from './types.js';
import { parseFirstProposal } from './proposal-parser.ts';

export type ProbeType = 'identity' | 'goals' | 'values';

export type ProbeResult = {
  type: ProbeType;
  proposal: latticeUpdateProposal;
  rawResponse: string;
};

export type DistillationOptions = {
  probes?: ProbeType[];
  model?: string;
  temperature?: number;
};

export class DistillationEngine {
  /**
   * @param invoke Callback to invoke an LLM. This decouples the engine from specific substrate implementations.
   */
  constructor(private invoke: (prompt: string, model?: string) => Promise<string>) {}

  /**
   * Expansion Phase: Run multiple ensemble cold-boot probes.
   */
  public async expand(capsule: string, options: DistillationOptions = {}): Promise<ProbeResult[]> {
    const probeTypes = options.probes || ['identity', 'goals', 'values'];
    const results: ProbeResult[] = [];

    for (const type of probeTypes) {
      const prompt = this.generateProbePrompt(type, capsule);
      const response = await this.invoke(prompt, options.model);
      
      try {
        const proposal = parseFirstProposal(response);
        if (proposal) {
          results.push({
            type,
            proposal,
            rawResponse: response
          });
        } else {
          console.warn(`No proposal found in response for probe ${type}`);
        }
      } catch (err) {
        console.warn(`Failed to parse proposal for probe ${type}:`, err);
      }
    }

    return results;
  }

  /**
   * Contraction Phase: Extract intersection from multiple probe results.
   */
  public contract(probeResults: ProbeResult[]): latticeUpdateProposal {
    const allProposedNodes: ProposedNode[] = probeResults.flatMap(r => r.proposal.add);
    const commonNodes: ProposedNode[] = this.extractIntersection(allProposedNodes);

    // For simplicity, we also collect all unique reinforces and edges that appear in multiple probes
    const reinforceCount = new Map<string, number>();
    for (const r of probeResults) {
      for (const id of r.proposal.reinforce) {
        reinforceCount.set(id, (reinforceCount.get(id) || 0) + 1);
      }
    }
    const commonReinforce = Array.from(reinforceCount.entries())
      .filter(([_, count]) => count > 1)
      .map(([id]) => id);

    return {
      add: commonNodes,
      reinforce: commonReinforce,
      contradict: [], // Contradictions are harder to intersect, skipped for now
      edges: [] // Edges also skipped for simple intersection
    };
  }

  /**
   * Extracts nodes that appear (semantically) in more than one probe.
   */
  private extractIntersection(nodes: ProposedNode[]): ProposedNode[] {
    const result: ProposedNode[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < nodes.length; i++) {
      if (usedIndices.has(i)) continue;

      let matchFound = false;
      for (let j = i + 1; j < nodes.length; j++) {
        if (usedIndices.has(j)) continue;

        if (this.isSemanticallySimilar(nodes[i].premise, nodes[j].premise)) {
          matchFound = true;
          usedIndices.add(j);
        }
      }

      if (matchFound) {
        result.push(nodes[i]);
        usedIndices.add(i);
      }
    }

    return result;
  }

  private isSemanticallySimilar(a: string, b: string): boolean {
    const tokensA = new Set(a.toLowerCase().split(/\W+/).filter(t => t.length > 3));
    const tokensB = new Set(b.toLowerCase().split(/\W+/).filter(t => t.length > 3));

    if (tokensA.size === 0 || tokensB.size === 0) return false;

    const intersection = new Set([...tokensA].filter(x => tokensB.has(x)));
    const union = new Set([...tokensA, ...tokensB]);

    const jaccard = intersection.size / union.size;
    
    // We can use a lower threshold for short phrases
    return jaccard >= 0.2; 
  }

  private generateProbePrompt(type: ProbeType, capsule: string): string {
    const base = `You are performing a distillation probe of type: ${type.toUpperCase()}.
Analyze the following Soul Capsule and your own internal state to identify core patterns.

CAPSULE:
${capsule}

TASK:
`;

    switch (type) {
      case 'identity':
        return base + `Identify the most fundamental, unchanging aspects of this Soul's identity. 
Return an <lattice_update> with these as 'identity' nodes.`;
      case 'goals':
        return base + `Identify the most urgent and consistent goals currently active.
Return an <lattice_update> with these as 'goal' nodes.`;
      case 'values':
        return base + `Identify the core ethical and moral values driving this Soul.
Return an <lattice_update> with these as 'value' nodes.`;
      default:
        return base + `Reflect on the Soul's state and propose updates in an <lattice_update> block.`;
    }
  }
}

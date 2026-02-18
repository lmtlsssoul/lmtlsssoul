import { Agent, AgentRole } from './types.ts';
import { ArchiveDB } from '../soul/archive-db.ts';
import { GraphDB } from '../soul/graph-db.ts';
import { getStateDir, type IndexUpdateProposal } from '../soul/types.ts';

type ReflectionContext = {
  mode?: 'cron' | 'manual';
  limit?: number;
};

type ReflectionResult = {
  message: string;
  proposals: IndexUpdateProposal[];
  inspectedEvents: number;
  generatedAt: string;
};

export class Reflection implements Agent {
  public readonly role: AgentRole = 'reflection';
  private readonly archive: ArchiveDB;
  private readonly graph: GraphDB;

  constructor(archive?: ArchiveDB, graph?: GraphDB) {
    const stateDir = getStateDir();
    this.archive = archive ?? new ArchiveDB(stateDir);
    this.graph = graph ?? new GraphDB(stateDir);
  }

  public async execute(context: ReflectionContext = {}): Promise<ReflectionResult> {
    const limit = context.limit ?? 25;
    const events = this.archive.getRecentEvents(limit);
    const proposals = this.buildProposals(events.map((event) => event.payloadText ?? ''));

    return {
      message:
        proposals.length > 0
          ? `Reflection generated ${proposals.length} proposal(s).`
          : 'Reflection complete. No new durable patterns detected.',
      proposals,
      inspectedEvents: events.length,
      generatedAt: new Date().toISOString(),
    };
  }

  private buildProposals(snippets: string[]): IndexUpdateProposal[] {
    const tokens = extractCandidatePhrases(snippets);
    const proposals: IndexUpdateProposal[] = [];

    for (const phrase of tokens.slice(0, 3)) {
      if (this.graph.searchNodes(phrase).length > 0) {
        continue;
      }

      proposals.push({
        add: [
          {
            premise: `Recurring reflection motif: ${phrase}`,
            nodeType: 'premise',
            weight: {
              salience: 0.35,
              commitment: 0.25,
              uncertainty: 0.45,
            },
          },
        ],
        reinforce: [],
        contradict: [],
        edges: [],
      });
    }

    return proposals;
  }
}

function extractCandidatePhrases(snippets: string[]): string[] {
  const counts = new Map<string, number>();

  for (const snippet of snippets) {
    const words = snippet
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 5);

    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token);
}

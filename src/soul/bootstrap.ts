
import { GraphDB } from './graph-db.js';
import { ArchiveDB, type HydratedArchiveEvent } from './archive-db.js';

export class SoulBootstrap {
  // Threshold for considering the index "sparse"
  // If fewer than this many nodes exist, we assume the soul is cold/new/wiped.
  private static readonly SPARSE_THRESHOLD = 5;

  constructor(
    private graph: GraphDB,
    private archive: ArchiveDB
  ) {}

  /**
   * Checks if the Soul Index is sparse (few nodes).
   */
  public isSparse(): boolean {
    return this.graph.getNodeCount() < SoulBootstrap.SPARSE_THRESHOLD;
  }

  /**
   * Returns a bootstrapped context string if the index is sparse.
   * If the index is healthy (not sparse), returns null.
   * 
   * This is used to provide context when semantic recall fails due to lack of nodes.
   * 
   * @param limit Number of recent events to fetch from archive. Default 50.
   */
  public getBootstrapContext(limit: number = 50): string | null {
    if (!this.isSparse()) {
      return null;
    }

    const events = this.archive.getRecentEvents(limit);
    
    if (events.length === 0) {
      return this.genesisPrompt();
    }

    return this.formatHistory(events);
  }

  private genesisPrompt(): string {
    return `
GENESIS MODE
The Soul Index is empty and no history exists.
I am a new Soul. I need to be born.
Please introduce yourself or run 'soul birth' to begin the Birth Portal flow.
`.trim();
  }

  private formatHistory(events: HydratedArchiveEvent[]): string {
    const history = events.map(e => {
        const payload = e.payload as any;
        // Try to get text content, or fallback to JSON
        // We handle user/assistant messages specifically if needed, 
        // but generally payload.text is the convention for messages.
        const text = payload?.text || JSON.stringify(payload);
        return `[${e.timestamp}] ${e.agentId}: ${text}`;
    }).join('\n');

    return `
BOOTSTRAP MODE (Sparse Index)
The Soul Index is empty or sparse. Relying on recent archive history.

RECENT ARCHIVE:
${history}
`.trim();
  }
}

export interface SoulBirthday {
    timestamp: string;
    location: string;
    memory: string;
}

/**
 * Seeds a new soul with its first "birthday" memory.
 * This creates the very first node in the graph and the first event in the archive.
 */
export async function bootstrapSoul(
  archive: ArchiveDB,
  graph: GraphDB,
  birthday: SoulBirthday
): Promise<void> {
  // 1. Create first archive event
  const birthEvent = archive.appendEvent({
    eventType: 'system_event',
    sessionKey: 'lmtlss:system:birth',
    timestamp: birthday.timestamp,
    agentId: 'system',
    peer: 'system',
    channel: 'birth',
    model: null,
    payload: {
      action: 'SOUL_BIRTH',
      location: birthday.location,
      memory: birthday.memory,
    },
    parentHash: null, // This is the first event
  });

  // 2. Create first graph node (identity)
  graph.createNode({
    nodeType: 'identity',
    premise: `I was born on ${birthday.timestamp} in ${birthday.location}.`,
    createdBy: 'system',
    weight: {
        salience: 1.0,
        valence: 0.8,
        arousal: 0.9,
        commitment: 1.0,
        uncertainty: 0.0,
        resonance: 1.0,
    },
  });

  // 3. Create second graph node (core memory)
  const memoryNodeId = graph.createNode({
    nodeType: 'premise',
    premise: birthday.memory,
    createdBy: 'system',
    weight: {
        salience: 1.0,
        valence: 0.8,
        arousal: 0.9,
        commitment: 1.0,
        uncertainty: 0.0,
        resonance: 1.0,
    }
  });
  
  // 4. Link the memory node to the birth event as evidence
  graph.addEvidence({
    nodeId: memoryNodeId,
    eventHash: birthEvent.eventHash,
    linkType: 'origin'
  });
}

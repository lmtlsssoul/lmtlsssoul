import { GraphDB } from './graph-db.js';
import { ArchiveDB, HydratedArchiveEvent } from './archive-db.js';

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

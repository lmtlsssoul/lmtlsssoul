import type { ArchiveDB, HydratedArchiveEvent } from './archive-db.js';
import type { GraphDB } from './graph-db.js';

export interface RecallOptions {
  /** Number of recent messages to fetch from ArchiveDB (Chronological). Default: 10. */
  recentCount?: number;
  /** Optional agent ID filter for chronological recall. */
  agentId?: string;
  /** Max number of semantic matches (events) to fetch from GraphDB (Semantic). Default: 10. */
  semanticCount?: number;
  /** Number of top nodes to consider for semantic search. Default: 5. */
  semanticNodeLimit?: number;
  /** Time range for chronological recall. If provided, overrides recentCount. */
  timeRange?: {
    start: string;
    end: string;
  };
}

export class SoulRecall {
  constructor(
    private archive: ArchiveDB,
    private graph: GraphDB
  ) {}

  /**
   * Dual path recall:
   * 1. Chronological: Recent messages from ArchiveDB.
   * 2. Semantic: FTS search on Soul Graph -> Evidence -> ArchiveDB.
   *
   * Merges results by relevance and returns sorted by timestamp.
   */
  public recall(query: string, options: RecallOptions = {}): HydratedArchiveEvent[] {
    const recentCount = options.recentCount ?? 10;
    const semanticCount = options.semanticCount ?? 10;
    const semanticNodeLimit = options.semanticNodeLimit ?? 5;

    // 1. Chronological Path
    let chronoEvents: HydratedArchiveEvent[] = [];
    if (options.timeRange) {
      chronoEvents = this.archive.getEventsByTimeRange(
        options.timeRange.start,
        options.timeRange.end
      );
    } else {
      chronoEvents =
        options.agentId && options.agentId.trim().length > 0
          ? this.archive.getRecentEvents(options.agentId, recentCount)
          : this.archive.getRecentEvents(recentCount);
    }

    // 2. Semantic Path
    let semanticEvents: HydratedArchiveEvent[] = [];
    if (query && query.trim().length > 0) {
      // Search nodes by FTS
      const nodes = this.graph.searchNodes(query);
      
      // Take top matching nodes
      const topNodes = nodes.slice(0, semanticNodeLimit);

      // Collect evidence for each node
      const eventHashes = new Set<string>();
      for (const node of topNodes) {
        const evidenceLinks = this.graph.getEvidence(node.nodeId);
        for (const link of evidenceLinks) {
          eventHashes.add(link.eventHash);
        }
      }

      // Fetch full events
      const rawSemanticEvents: HydratedArchiveEvent[] = [];
      for (const hash of eventHashes) {
        const event = this.archive.getEventByHash(hash);
        if (event) {
          rawSemanticEvents.push(event);
        }
      }
      
      // Sort semantic events by recency (newest first) to pick the best ones
      rawSemanticEvents.sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });
      
      // Take top N semantic events
      semanticEvents = rawSemanticEvents.slice(0, semanticCount);
    }

    // 3. Merge and Dedup
    const uniqueEvents = new Map<string, HydratedArchiveEvent>();

    // Add semantic events first (so they are present)
    for (const event of semanticEvents) {
      uniqueEvents.set(event.eventHash, event);
    }
    
    // Add chrono events (they might overwrite, but same object)
    for (const event of chronoEvents) {
      uniqueEvents.set(event.eventHash, event);
    }

    // 4. Sort by timestamp (oldest first) for coherent history
    return Array.from(uniqueEvents.values()).sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }
}

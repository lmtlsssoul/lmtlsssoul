
import { describe, it, expect, beforeEach } from 'vitest';
import { SoulCirculation } from '../../src/soul/circulation.ts';
import { ArchiveDB } from '../../src/soul/archive-db.ts';
import { GraphDB } from '../../src/soul/graph-db.ts';
import { SoulRecall } from '../../src/soul/recall.ts';
import { SoulCompiler } from '../../src/soul/compiler.ts';
import { IdentityDigest } from '../../src/soul/identity-digest.ts';
import { bootstrapSoul } from '../../src/soul/bootstrap.ts';
import { SoulConfig } from '../../src/soul/types.ts';

describe('Phase 1 End-to-End', () => {
  let archiveDb: ArchiveDB;
  let graphDb: GraphDB;
  let recall: SoulRecall;
  let compiler: SoulCompiler;
  let identityDigest: IdentityDigest;
  let circulation: SoulCirculation;
  let config: SoulConfig;

  beforeEach(async () => {
    // Use in-memory databases for true end-to-end testing
    archiveDb = new ArchiveDB(':memory:');
    graphDb = new GraphDB(':memory:');
    
    config = {
        name: 'Test Soul',
        birthday: '2026-02-18',
        soul_path: ':memory:',
    };

    // Bootstrap the soul with an initial memory
    await bootstrapSoul(archiveDb, graphDb, {
        timestamp: new Date().toISOString(),
        location: 'Test City',
        memory: 'This is the first memory of the soul.'
    });

    recall = new SoulRecall(archiveDb, graphDb);
    compiler = new SoulCompiler(graphDb);
    identityDigest = new IdentityDigest(config);
    
    circulation = new SoulCirculation(
      archiveDb,
      graphDb,
      recall,
      compiler,
      identityDigest
    );
  });

  it('should complete a single interaction, update the graph, and recall the memory', async () => {
    const context = {
      agentId: 'interface',
      channel: 'e2e-test',
      peer: 'e2e-user',
      model: 'e2e-model',
    };
    
    // --- First Interaction: Learn a new fact ---
    const newFact = 'The sun is a star.';
    const proposal = {
        add: [{ nodeType: 'premise', premise: newFact, weight: { salience: 0.9 } }],
        reinforce: [],
        contradict: [],
        edges: [],
    };
    const llmResponse1 = `That's an interesting fact. The sun is indeed a star.\n\n<index_update>${JSON.stringify({ add: proposal.add })}</index_update>`;
    const mind1 = async () => llmResponse1;

    const result1 = await circulation.run('Tell me a fact.', context, mind1);

    expect(result1.reply).toBe(llmResponse1);
    expect(result1.proposal).toBeDefined();

    // Verify the fact was added to the graph
    const searchResults = graphDb.searchNodes(newFact);
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].premise).toBe(newFact);
    expect(searchResults[0].weight.salience).toBe(0.9);


    // --- Second Interaction: Recall the fact ---
    const mind2 = async (prompt: string) => {
        // Simple mock LLM that checks if the fact is in the prompt
        if (prompt.includes(newFact)) {
            return "Yes, I remember you told me that the sun is a star.";
        }
        return "I don't recall that fact.";
    };

    const result2 = await circulation.run('Do you remember what I told you about the sun?', context, mind2);
    
    // The recall step should have pulled the new fact into the prompt
    expect(result2.reply).toBe("Yes, I remember you told me that the sun is a star.");

    // Verify recall history
    const recalledEvents = recall.recall('sun');
    // We expect the bootstrap event and the first interaction events
    expect(recalledEvents.length).toBeGreaterThan(0);
  });
});

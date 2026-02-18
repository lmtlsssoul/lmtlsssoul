import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoulCirculation } from '../../src/soul/circulation';
import { ArchiveDB } from '../../src/soul/archive-db';
import { GraphDB } from '../../src/soul/graph-db';
import { SoulRecall } from '../../src/soul/recall';
import { SoulCompiler } from '../../src/soul/compiler';
import { IdentityDigest } from '../../src/soul/identity-digest';
import { latticeUpdateProposal } from '../../src/soul/types';

// Mock the dependencies
vi.mock('../../src/soul/archive-db');
vi.mock('../../src/soul/graph-db');
vi.mock('../../src/soul/recall');
vi.mock('../../src/soul/compiler');
vi.mock('../../src/soul/identity-digest');

describe('SoulCirculation - Phase 1 Integration', () => {
  let archiveDbMock: InstanceType<typeof ArchiveDB>;
  let graphDbMock: InstanceType<typeof GraphDB>;
  let recallMock: InstanceType<typeof SoulRecall>;
  let compilerMock: InstanceType<typeof SoulCompiler>;
  let identityDigestMock: InstanceType<typeof IdentityDigest>;
  let circulation: SoulCirculation;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Create instances of the mocked classes
    archiveDbMock = new ArchiveDB(':memory:') as any;
    graphDbMock = new GraphDB(':memory:') as any;
    recallMock = new SoulRecall(archiveDbMock, graphDbMock) as any;
    compilerMock = new SoulCompiler(graphDbMock) as any;
    identityDigestMock = new IdentityDigest() as any;

    // Mock specific methods
    vi.spyOn(archiveDbMock, 'appendEvent').mockImplementation((event) => ({
      ...event,
      eventHash: `hash_${Math.random()}`,
      payloadText: JSON.stringify(event.payload),
    }));
    vi.spyOn(archiveDbMock, 'getEventCount').mockReturnValue(0);
    vi.spyOn(graphDbMock, 'getNodeCount').mockReturnValue(0);
    vi.spyOn(graphDbMock, 'getBaseDir').mockReturnValue(':memory:');
    vi.spyOn(recallMock, 'recall').mockReturnValue([]);
    vi.spyOn(compilerMock, 'regenerateCapsule').mockReturnValue('SOUL CAPSULE TEXT');
    vi.spyOn(compilerMock, 'compile').mockImplementation(() => {});
    vi.spyOn(identityDigestMock, 'generate').mockReturnValue('SYSTEM PROMPT');
    
    circulation = new SoulCirculation(
      archiveDbMock,
      graphDbMock,
      recallMock,
      compilerMock,
      identityDigestMock
    );
  });

  it('should successfully run the entire circulation cycle without a proposal', async () => {
    const mind = vi.fn().mockResolvedValue('Hello, world!');
    const context = {
      agentId: 'interface',
      channel: 'test',
      peer: 'author1',
      model: 'test-model',
    };

    const result = await circulation.run('Hi there', context, mind);

    expect(result.reply).toBe('Hello, world!');
    expect(result.proposal).toBeUndefined();

    // [A] Cold Boot checks
    expect(compilerMock.regenerateCapsule).toHaveBeenCalledOnce();
    expect(identityDigestMock.generate).toHaveBeenCalledWith(
      'SOUL CAPSULE TEXT',
      'interface',
      expect.any(String)
    );

    // [B] Recall check
    expect(recallMock.recall).toHaveBeenCalledWith('Hi there');

    // [C] Inference check
    expect(mind).toHaveBeenCalledOnce();
    const prompt = mind.mock.calls[0][0];
    expect(prompt).toContain('SYSTEM PROMPT');
    expect(prompt).toContain('AUTHOR:\nHi there');

    // [D] Persist checks
    expect(archiveDbMock.appendEvent).toHaveBeenCalledTimes(3);
    expect(archiveDbMock.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'identity_check' })
    );
    expect(archiveDbMock.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'author_message' })
    );
    expect(archiveDbMock.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'assistant_message' })
    );

    // [E] Compile check (should not be called)
    expect(compilerMock.compile).not.toHaveBeenCalled();
  });

  it('should run the cycle and process an latticeUpdateProposal', async () => {
    const proposal: latticeUpdateProposal = {
      add: [{ nodeType: 'premise', premise: 'The sky is blue.', weight: { salience: 0.8 } }],
      reinforce: [],
      contradict: [],
      edges: [],
    };
    const responseWithProposal = `The sky is indeed blue.\n\n<lattice_update>${JSON.stringify(proposal)}</lattice_update>`;
    const mind = vi.fn().mockResolvedValue(responseWithProposal);
    const context = {
      agentId: 'interface',
      channel: 'test',
      peer: 'author1',
      model: 'test-model',
    };

    const result = await circulation.run('What color is the sky?', context, mind);

    expect(result.reply).toBe(responseWithProposal);
    expect(result.proposal).toEqual(proposal);

    // [D] Persist checks (5 events: identity_check, author, assistant, lattice_update_proposal, lattice_commit)
    expect(archiveDbMock.appendEvent).toHaveBeenCalledTimes(5);
    expect(archiveDbMock.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'lattice_update_proposal' })
    );
    expect(archiveDbMock.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'lattice_commit' })
    );

    // [E] Compile check
    expect(compilerMock.compile).toHaveBeenCalledWith(proposal, 'interface');
    // Capsule generation is called once at cold boot.
    expect(compilerMock.regenerateCapsule).toHaveBeenCalledTimes(1);
  });
});

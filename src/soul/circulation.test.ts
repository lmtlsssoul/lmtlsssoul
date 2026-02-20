
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ArchiveDB } from './archive-db.js';
import { GraphDB } from './graph-db.js';
import { SoulRecall } from './recall.js';
import { SoulCompiler } from './compiler.js';
import { IdentityDigest } from './identity-digest.js';
import { SoulCirculation, CirculationContext } from './circulation.js';
import { DEFAULT_CONFIG } from './types.js';

describe('SoulCirculation', () => {
  let tmpDir: string;
  let archive: ArchiveDB;
  let graph: GraphDB;
  let recall: SoulRecall;
  let compiler: SoulCompiler;
  let identity: IdentityDigest;
  let circulation: SoulCirculation;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(process.cwd(), 'circulation-test-'));
    archive = new ArchiveDB(tmpDir);
    graph = new GraphDB(tmpDir);
    recall = new SoulRecall(archive, graph);
    compiler = new SoulCompiler(graph);
    identity = new IdentityDigest(DEFAULT_CONFIG);

    circulation = new SoulCirculation(archive, graph, recall, compiler, identity);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should run a full cycle', async () => {
    const context: CirculationContext = {
      agentId: 'interface',
      channel: 'cli',
      peer: 'author1',
      model: 'gpt-4o'
    };

    const mockMind = async (prompt: string) => {
      expect(prompt).toContain('Identity Digest');
      expect(prompt).toContain('System Presence Check');
      expect(prompt).toContain('AUTHOR:\nHello world');
      return 'Hello! <lattice_update>{"add":[{"premise":"Author says hello","nodeType":"premise","weight":{}}]}</lattice_update>';
    };

    const result = await circulation.run('Hello world', context, mockMind);

    expect(result.reply).toContain('Hello!');
    expect(result.presenceEventHash).toBeDefined();
    expect(result.proposal).toBeDefined();
    expect(result.proposal?.add).toHaveLength(1);

    const presenceEvent = archive.getEventByHash(result.presenceEventHash);
    expect(presenceEvent).not.toBeNull();
    expect(presenceEvent?.eventType).toBe('identity_check');
    
    // Verify persistence
    const authorEvent = archive.getEventByHash(result.authorEventHash);
    expect(authorEvent).not.toBeNull();
    expect(authorEvent?.eventType).toBe('author_message');
    expect((authorEvent?.payload as any).text).toBe('Hello world');
    expect(authorEvent?.parentHash).toBe(result.presenceEventHash);

    const asstEvent = archive.getEventByHash(result.assistantEventHash);
    expect(asstEvent).not.toBeNull();
    expect(asstEvent?.eventType).toBe('assistant_message');
    expect((asstEvent?.payload as any).text).toContain('Hello!');
    
    // Verify graph update
    const nodes = graph.searchNodes('Author says hello');
    expect(nodes).toHaveLength(1);
  });

  it('should handle recall history', async () => {
    // Seed some history
    archive.appendEvent({
        eventType: 'author_message',
        sessionKey: 'old-session',
        timestamp: new Date(Date.now() - 10000).toISOString(),
        agentId: 'author',
        peer: 'author1',
        payload: { text: 'Previous message' },
        parentHash: null
    });

    const context: CirculationContext = {
      agentId: 'interface',
      channel: 'cli',
      peer: 'author1',
      model: 'gpt-4o'
    };

    const mockMind = async (prompt: string) => {
      expect(prompt).toContain('author1: Previous message');
      return 'I remember.';
    };

    await circulation.run('Follow up', context, mockMind);
  });

  it('should handle compilation errors gracefully', async () => {
    const context: CirculationContext = {
        agentId: 'interface',
        channel: 'cli',
        peer: 'author1',
        model: 'gpt-4o'
      };
  
      const mockMind = async (prompt: string) => {
        // Invalid JSON in proposal
        return 'Ok. <lattice_update>{ invalid json </lattice_update>';
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  
      // Should not throw, and should return result with no proposal
      const result = await circulation.run('Break it', context, mockMind);
      expect(result.reply).toContain('Ok.');
      expect(result.proposal).toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
  });
});

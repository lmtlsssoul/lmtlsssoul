import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoulBootstrap } from './bootstrap.js';
import { GraphDB } from './graph-db.js';
import { ArchiveDB, HydratedArchiveEvent } from './archive-db.js';

// Mock dependencies
vi.mock('./graph-db.js');
vi.mock('./archive-db.js');

describe('SoulBootstrap', () => {
  let bootstrap: SoulBootstrap;
  let mockGraph: any;
  let mockArchive: any;

  beforeEach(() => {
    // Reset mocks
    mockGraph = {
      getNodeCount: vi.fn(),
    };
    mockArchive = {
      getRecentEvents: vi.fn(),
    };

    bootstrap = new SoulBootstrap(mockGraph as GraphDB, mockArchive as ArchiveDB);
  });

  it('should return null if index is not sparse', () => {
    mockGraph.getNodeCount.mockReturnValue(10); // > 5
    expect(bootstrap.isSparse()).toBe(false);
    expect(bootstrap.getBootstrapContext()).toBe(null);
  });

  it('should return genesis prompt if index is sparse and archive is empty', () => {
    mockGraph.getNodeCount.mockReturnValue(0);
    mockArchive.getRecentEvents.mockReturnValue([]);

    expect(bootstrap.isSparse()).toBe(true);
    const result = bootstrap.getBootstrapContext();
    expect(result).not.toBeNull();
    expect(result).toContain('GENESIS MODE');
  });

  it('should return archive history if index is sparse and archive has events', () => {
    mockGraph.getNodeCount.mockReturnValue(0);
    const mockEvents: Partial<HydratedArchiveEvent>[] = [
      {
        timestamp: '2023-01-01T00:00:00Z',
        agentId: 'user',
        payload: { text: 'Hello world' }
      },
      {
        timestamp: '2023-01-01T00:00:01Z',
        agentId: 'assistant',
        payload: { text: 'Hi there' }
      }
    ];
    mockArchive.getRecentEvents.mockReturnValue(mockEvents);

    expect(bootstrap.isSparse()).toBe(true);
    const context = bootstrap.getBootstrapContext();
    expect(context).not.toBeNull();
    expect(context).toContain('BOOTSTRAP MODE');
    expect(context).toContain('Hello world');
    expect(context).toContain('Hi there');
  });

  it('should use limit parameter', () => {
    mockGraph.getNodeCount.mockReturnValue(0);
    mockArchive.getRecentEvents.mockReturnValue([]);
    
    bootstrap.getBootstrapContext(25);
    expect(mockArchive.getRecentEvents).toHaveBeenCalledWith(25);
  });
});

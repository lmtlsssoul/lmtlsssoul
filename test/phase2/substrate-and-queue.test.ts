/**
 * @file Unit tests for Phase 2 modules.
 * @author Gemini
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRegistry } from '../../src/substrate/registry.js';
import { refreshModelRegistry } from '../../src/substrate/refresh.js';
import {
  resolveModelForRole,
  roleAssignments,
} from '../../src/substrate/assignment.js';
import { JobQueue } from '../../src/queue/runner.js';
import { saveQueueState, loadQueueState } from '../../src/queue/resume.js';
import { promises as fs } from 'fs';

describe('Phase 2: Substrate Layer + Registry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ModelRegistry should discover and deduplicate models', async () => {
    const registry = new ModelRegistry();
    const models = await registry.discoverAllModels();
    expect(models.length).toBeGreaterThan(0);

    const modelIds = models.map(m => m.id);
    const uniqueModelIds = new Set(modelIds);
    expect(modelIds.length).toBe(uniqueModelIds.size);
  });

  it('refreshModelRegistry should return a new registry state', async () => {
    const newState = await refreshModelRegistry();
    expect(newState.models.length).toBeGreaterThan(0);
    expect(newState.lastRefreshed).toBeDefined();
  });

  it('resolveModelForRole should resolve the correct model', async () => {
    const registry = new ModelRegistry();
    const availableModels = await registry.discoverAllModels();

    const interfaceModel = resolveModelForRole('interface', availableModels);
    expect(interfaceModel).toBeDefined();
    expect(interfaceModel?.id).toBe(roleAssignments.interface);
  });

  it('JobQueue should process a job conceptually', async () => {
    const queue = new JobQueue();
    const consoleSpy = vi.spyOn(console, 'log');

    queue.addJob({
      jobId: 'test-job-1',
      role: 'interface',
      substrate: 'openai',
      modelId: 'gpt-4o',
      inputs: {
        kernelSnapshotRef: 'ref1',
        memorySlicesRef: [],
        taskRef: 'ref2',
        toolPolicyRef: 'ref3',
      },
      outputs: {
        artifactPaths: [],
        archiveAppendRef: 'ref4',
      },
      verify: {
        commands: [],
      },
      createdAt: new Date().toISOString(),
    });

    // We can't easily test the async private method, so we'll check the logs
    // This is a limitation of the conceptual implementation
    // A more robust implementation would use events or callbacks
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for logs
    expect(consoleSpy).toHaveBeenCalledWith('Processing job test-job-1 for role interface');
  });

  it('saveQueueState and loadQueueState should handle queue persistence', async () => {
    const mockQueue = [
      { jobId: 'job-1', status: 'pending' },
      { jobId: 'job-2', status: 'completed' },
    ] as any;

    const writeFileSpy = vi.spyOn(fs, 'writeFile').mockResolvedValue();
    const readFileSpy = vi
      .spyOn(fs, 'readFile')
      .mockResolvedValue(JSON.stringify(mockQueue));

    await saveQueueState(mockQueue);
    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(mockQueue, null, 2),
      'utf-8'
    );

    const loadedQueue = await loadQueueState();
    expect(readFileSpy).toHaveBeenCalledWith(expect.any(String), 'utf-8');
    expect(loadedQueue).toEqual(mockQueue);
  });
});

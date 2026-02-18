/**
 * @file Unit tests for Phase 2 modules.
 * @author Gemini
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRegistry } from '../../src/substrate/registry.js';
import { refreshModelRegistry } from '../../src/substrate/refresh.js';
import {
  resolveModelForRole,
  DEFAULT_ROLE_ASSIGNMENTS,
} from '../../src/substrate/assignment.js';
import { JobQueue } from '../../src/queue/runner.js';
import { saveQueueState, loadQueueState } from '../../src/queue/resume.js';
import { promises as fs } from 'fs';
import { normalizeModelDescriptor } from '../../src/substrate/types.js';

describe('Phase 2: Substrate Layer + Registry', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('ModelRegistry should discover and deduplicate models', async () => {
    const registry = new ModelRegistry([
      {
        id: 'openai',
        health: async () => ({ ok: true, lastCheckedAt: new Date().toISOString() }),
        discoverModels: async () => [
          normalizeModelDescriptor({
            substrate: 'openai',
            modelId: 'gpt-4o',
            displayName: 'GPT-4o',
          }),
        ],
        invoke: async () => ({
          content: 'ok',
          model: 'gpt-4o',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as any,
      {
        id: 'openai',
        health: async () => ({ ok: true, lastCheckedAt: new Date().toISOString() }),
        discoverModels: async () => [
          normalizeModelDescriptor({
            substrate: 'openai',
            modelId: 'gpt-4o',
            displayName: 'GPT-4o',
          }),
        ],
        invoke: async () => ({
          content: 'ok',
          model: 'gpt-4o',
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as any,
    ]);

    const models = await registry.discoverAllModels();
    expect(models).toHaveLength(1);

    const uniqueKeys = new Set(models.map((m) => `${m.provider}:${m.id}`));
    expect(uniqueKeys.size).toBe(models.length);
  });

  it('refreshModelRegistry should return a new registry state', async () => {
    vi.spyOn(ModelRegistry.prototype, 'discoverAllModels').mockResolvedValue([
      normalizeModelDescriptor({
        substrate: 'openai',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
      }),
    ]);

    const currentState = {
      lastRefreshed: new Date().toISOString(),
      models: [
        normalizeModelDescriptor({
          substrate: 'anthropic',
          modelId: 'claude-legacy',
          displayName: 'Legacy',
        }),
      ],
    };

    const newState = await refreshModelRegistry(currentState);
    expect(newState.models.length).toBeGreaterThan(0);
    expect(newState.lastRefreshed).toBeDefined();
    expect(newState.models.some((m) => m.id === 'claude-legacy' && m.stale)).toBe(true);
  });

  it('resolveModelForRole should resolve the correct model', async () => {
    const availableModels = [
      normalizeModelDescriptor({
        substrate: 'anthropic',
        modelId: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
      }),
      normalizeModelDescriptor({
        substrate: 'openai',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
      }),
    ];

    const interfaceModel = resolveModelForRole('interface', availableModels);
    expect(interfaceModel).toBeDefined();
    expect(interfaceModel?.provider).toBe('anthropic');
    expect(`${interfaceModel?.provider}:${interfaceModel?.id}`).toBe(DEFAULT_ROLE_ASSIGNMENTS.interface);
  });

  it('JobQueue should process a job with verify/checkpoint flow', async () => {
    const queue = new JobQueue({
      executor: async () => {},
      verifyRunner: async (command) => ({
        command,
        ok: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
      }),
      checkpoint: async () => {},
    });

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
        commands: ['echo "verify"'],
      },
      createdAt: new Date().toISOString(),
    });

    const drained = await queue.waitForIdle(2000);
    expect(drained).toBe(true);
    const processed = queue.getProcessedJobs();
    expect(processed).toHaveLength(1);
    expect(processed[0].status).toBe('completed');
  });

  it('saveQueueState and loadQueueState should handle queue persistence', async () => {
    const mockQueue = [
      { jobId: 'job-1', status: 'queued' },
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

import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanForModels, setModelForRole } from './models-scan.js';
import { ModelRegistry } from '../substrate/registry.js';
import { normalizeModelDescriptor } from '../substrate/types.js';
import { getRoleAssignmentsPath } from '../substrate/assignment.js';

describe('scanForModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns discovered models grouped by substrate', async () => {
    vi.spyOn(ModelRegistry.prototype, 'discoverAllModels').mockResolvedValue([
      normalizeModelDescriptor({
        substrate: 'openai',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
      }),
      normalizeModelDescriptor({
        substrate: 'anthropic',
        modelId: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
      }),
    ]);

    const models = await scanForModels({ persist: false });
    expect(Object.keys(models)).toEqual(['openai', 'anthropic', 'xai', 'ollama']);
    expect(models.openai[0].id).toBe('gpt-4o');
    expect(models.anthropic[0].id).toBe('claude-3-opus-20240229');
    expect(models.xai).toEqual([]);
    expect(models.ollama).toEqual([]);
  });
});

describe('setModelForRole', () => {
  it('persists a grounded model assignment', async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-model-set-test-'));
    const availableModels = [
      normalizeModelDescriptor({
        substrate: 'openai',
        modelId: 'gpt-4o',
        displayName: 'GPT-4o',
      }),
    ];

    await setModelForRole('interface', 'openai:gpt-4o', {
      stateDir,
      availableModels,
    });

    const assignmentPath = getRoleAssignmentsPath(stateDir);
    const saved = JSON.parse(fs.readFileSync(assignmentPath, 'utf-8')) as Record<string, string>;
    expect(saved.interface).toBe('openai:gpt-4o');
  });
});

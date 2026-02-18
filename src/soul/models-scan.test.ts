
import { describe, it, expect } from 'vitest';
import { scanForModels, setModelForRole } from './models-scan.js';

describe('scanForModels', () => {
  it('should return a map of mocked models for each substrate', async () => {
    const models = await scanForModels();
    expect(models).toBeTypeOf('object');
    expect(Object.keys(models)).toEqual(['openai', 'anthropic', 'xai', 'ollama']);
    expect(models.openai.length).toBeGreaterThan(0);
    expect(models.anthropic.length).toBeGreaterThan(0);
    expect(models.xai.length).toBeGreaterThan(0);
    expect(models.ollama.length).toBeGreaterThan(0);

    const openaiModel = models.openai[0];
    expect(openaiModel).toHaveProperty('id');
    expect(openaiModel).toHaveProperty('name');
    expect(openaiModel).toHaveProperty('provider', 'openai');
    expect(openaiModel).toHaveProperty('context_length');
  });
});

describe('setModelForRole', () => {
  it('should not throw an error', async () => {
    await expect(setModelForRole('interface', 'gpt-4o')).resolves.toBeUndefined();
  });
});

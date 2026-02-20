import { describe, it, expect } from 'vitest';
import { resolveInvokeModel, resolveInvokePrompt } from './types.js';

describe('substrate invoke resolution helpers', () => {
  it('prefers model when provided and falls back to modelId', () => {
    expect(resolveInvokeModel({ model: 'openai:gpt-4o' })).toBe('openai:gpt-4o');
    expect(resolveInvokeModel({ modelId: 'gpt-4o' })).toBe('gpt-4o');
  });

  it('resolves prompt from prompt first, then promptEnvelope text', () => {
    expect(resolveInvokePrompt({ prompt: 'hello' })).toBe('hello');
    expect(resolveInvokePrompt({ promptEnvelope: 'hello envelope' })).toBe('hello envelope');
    expect(resolveInvokePrompt({ promptEnvelope: { text: 'hello object' } })).toBe('hello object');
    expect(resolveInvokePrompt({})).toBe('');
  });
});

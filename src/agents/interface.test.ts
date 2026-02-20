/**
 * @file src/agents/interface.test.ts
 * @description Unit tests for the interface agent.
 * @auth lmtlss soul
 */

import { describe, it, expect } from 'vitest';
import { Interface } from './interface.ts';

describe('Interface Agent', () => {
  it('should have the correct role', () => {
    const agent = new Interface();
    expect(agent.role).toBe('interface');
  });

  it('should execute a conversation turn and return a result', async () => {
    const agent = new Interface();
    const context = { message: 'Hello' };
    const result = await agent.execute(context) as any;

    expect(result).toBeDefined();
    expect(result.reply).toContain('Hello');
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(result.metadata).toBeDefined();
    expect(result.metadata.timestamp).toBeDefined();
  });
});

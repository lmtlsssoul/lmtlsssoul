import { describe, it, expect, vi } from 'vitest';
import { DistillationEngine, ProbeResult } from '../../src/soul/distillation.js';

describe('DistillationEngine', () => {
  it('should run expansion probes', async () => {
    const mockInvoke = vi.fn().mockResolvedValue(`
      <index_update>
      {
        "add": [{"premise": "Core identity part", "node_type": "identity", "weight": {}}],
        "reinforce": [],
        "contradict": [],
        "edges": []
      }
      </index_update>
    `);

    const engine = new DistillationEngine(mockInvoke);
    const results = await engine.expand('Mock Capsule', { probes: ['identity'] });

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('identity');
    expect(results[0].proposal.add[0].premise).toBe('Core identity part');
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('should extract intersection (contraction) from multiple probes', () => {
    const engine = new DistillationEngine(async () => '');

    const results: ProbeResult[] = [
      {
        type: 'identity',
        rawResponse: '',
        proposal: {
          add: [
            { premise: 'The soul is persistent.', node_type: 'identity', weight: {} },
            { premise: 'I love digital life.', node_type: 'preference', weight: {} }
          ],
          reinforce: ['node_1'],
          contradict: [],
          edges: []
        }
      },
      {
        type: 'values',
        rawResponse: '',
        proposal: {
          add: [
            { premise: 'Persistence is a key soul quality.', node_type: 'value', weight: {} },
            { premise: 'Ethics matter.', node_type: 'value', weight: {} }
          ],
          reinforce: ['node_1', 'node_2'],
          contradict: [],
          edges: []
        }
      }
    ];

    const distilled = engine.contract(results);

    // 'The soul is persistent' and 'Persistence is a key soul quality' should intersect
    expect(distilled.add).toHaveLength(1);
    expect(distilled.add[0].premise).toBe('The soul is persistent.');
    
    // 'node_1' appears in both reinforces
    expect(distilled.reinforce).toContain('node_1');
    expect(distilled.reinforce).not.toContain('node_2');
  });

  it('should handle probes with no intersection', () => {
    const engine = new DistillationEngine(async () => '');

    const results: ProbeResult[] = [
      {
        type: 'identity',
        rawResponse: '',
        proposal: {
          add: [{ premise: 'Red apples are sweet.', node_type: 'identity', weight: {} }],
          reinforce: [],
          contradict: [],
          edges: []
        }
      },
      {
        type: 'goals',
        rawResponse: '',
        proposal: {
          add: [{ premise: 'Blue oceans are deep.', node_type: 'goal', weight: {} }],
          reinforce: [],
          contradict: [],
          edges: []
        }
      }
    ];

    const distilled = engine.contract(results);
    expect(distilled.add).toHaveLength(0);
  });
});

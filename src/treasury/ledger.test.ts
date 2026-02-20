import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';

describe('TreasuryLedger', () => {
  let ledger: TreasuryLedger;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
  });

  it('should record an inference cost entry', () => {
    const entryId = ledger.recordCost({
      category: 'inference',
      substrate: 'openai',
      modelId: 'gpt-4o',
      role: 'interface',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.0015
    });

    expect(entryId).toBeDefined();
    const entry = ledger.getEntry(entryId);
    expect(entry).toBeDefined();
    expect(entry?.category).toBe('inference');
    expect(entry?.costUsd).toBe(0.0015);
    expect(entry?.modelId).toBe('gpt-4o');
  });

  it('should record a tool cost entry', () => {
    const entryId = ledger.recordCost({
      category: 'tool',
      costUsd: 0.05,
      jobId: 'job-123'
    });

    const entry = ledger.getEntry(entryId);
    expect(entry?.category).toBe('tool');
    expect(entry?.costUsd).toBe(0.05);
    expect(entry?.jobId).toBe('job-123');
  });

  it('should calculate total cost', () => {
    ledger.recordCost({ category: 'inference', costUsd: 0.1 });
    ledger.recordCost({ category: 'storage', costUsd: 0.2 });
    ledger.recordCost({ category: 'network', costUsd: 0.3 });

    expect(ledger.getTotalCost()).toBeCloseTo(0.6);
  });

  it('should group costs by category', () => {
    ledger.recordCost({ category: 'inference', costUsd: 0.1 });
    ledger.recordCost({ category: 'inference', costUsd: 0.15 });
    ledger.recordCost({ category: 'storage', costUsd: 0.5 });

    const byCategory = ledger.getCostsByCategory();
    expect(byCategory.inference).toBeCloseTo(0.25);
    expect(byCategory.storage).toBeCloseTo(0.5);
  });

  it('should return 0 for total cost when empty', () => {
    expect(ledger.getTotalCost()).toBe(0);
  });

  it('should return null for non-existent entry', () => {
    expect(ledger.getEntry('non-existent')).toBeNull();
  });
});

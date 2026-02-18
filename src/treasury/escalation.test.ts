import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';
import { EscalationManager } from './escalation.js';

describe('EscalationManager', () => {
  let ledger: TreasuryLedger;
  let escalation: EscalationManager;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
    escalation = new EscalationManager(ledger.getDb());
  });

  it('should create and retrieve a proposal', () => {
    const proposalId = escalation.createProposal({
      reason: 'Compute limit reached',
      requestedCostUsd: 2.5,
      currentBudgetRemainingUsd: 0.1,
      substrate: 'openai',
      modelId: 'gpt-4o',
      taskDescription: 'Deep research on Bitcoin L3s',
      expectedValue: 'High quality research report'
    });

    expect(proposalId).toBeDefined();
    const proposal = escalation.getProposal(proposalId);
    expect(proposal).toBeDefined();
    expect(proposal?.status).toBe('pending');
    expect(proposal?.requestedCostUsd).toBe(2.5);
  });

  it('should update proposal status', () => {
    const proposalId = escalation.createProposal({
      reason: 'Test',
      requestedCostUsd: 1.0,
      currentBudgetRemainingUsd: 0.0,
      substrate: 'anthropic',
      modelId: 'claude-3-5-sonnet',
      taskDescription: 'Test task',
      expectedValue: 'Test value'
    });

    escalation.updateStatus(proposalId, 'approved');
    const proposal = escalation.getProposal(proposalId);
    expect(proposal?.status).toBe('approved');
  });

  it('should list proposals by status', () => {
    escalation.createProposal({
      reason: 'R1',
      requestedCostUsd: 1.0,
      currentBudgetRemainingUsd: 0.0,
      substrate: 's1',
      modelId: 'm1',
      taskDescription: 't1',
      expectedValue: 'v1'
    });
    const p2 = escalation.createProposal({
      reason: 'R2',
      requestedCostUsd: 2.0,
      currentBudgetRemainingUsd: 0.0,
      substrate: 's2',
      modelId: 'm2',
      taskDescription: 't2',
      expectedValue: 'v2'
    });
    escalation.updateStatus(p2, 'rejected');

    const pending = escalation.listProposals('pending');
    expect(pending.length).toBe(1);
    expect(pending[0].reason).toBe('R1');

    const rejected = escalation.listProposals('rejected');
    expect(rejected.length).toBe(1);
    expect(rejected[0].reason).toBe('R2');
  });
});

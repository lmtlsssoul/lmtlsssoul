import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';
import { SpendApprovalManager } from './approval.js';

describe('SpendApprovalManager', () => {
  let ledger: TreasuryLedger;
  let manager: SpendApprovalManager;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
    manager = new SpendApprovalManager(ledger.getDb());
  });

  it('should create and retrieve an approval request', () => {
    const id = manager.createRequest({
      requestReason: 'Buy more GPU credits',
      amountUsd: 50.0
    });

    const approval = manager.getApproval(id);
    expect(approval).toBeDefined();
    expect(approval?.requestReason).toBe('Buy more GPU credits');
    expect(approval?.status).toBe('pending');
  });

  it('should approve a request with a signature', () => {
    const id = manager.createRequest({ requestReason: 'Test', amountUsd: 1.0 });
    manager.approve(id, 'sig123', 'admin');
    
    const approval = manager.getApproval(id);
    expect(approval?.status).toBe('approved');
    expect(approval?.signature).toBe('sig123');
    expect(approval?.approverId).toBe('admin');
  });

  it('should mark an approved request as used', () => {
    const id = manager.createRequest({ requestReason: 'Test', amountUsd: 1.0 });
    manager.approve(id, 'sig123', 'admin');
    manager.markUsed(id);
    
    const approval = manager.getApproval(id);
    expect(approval?.status).toBe('used');
  });

  it('should reject a request', () => {
    const id = manager.createRequest({ requestReason: 'Test', amountUsd: 1.0 });
    manager.reject(id);
    
    const approval = manager.getApproval(id);
    expect(approval?.status).toBe('rejected');
  });
});

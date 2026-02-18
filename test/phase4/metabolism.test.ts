import { describe, it, expect, beforeEach } from 'vitest';
import { 
  TreasuryLedger, 
  BudgetManager, 
  EscalationManager, 
  IncomeManager, 
  WalletManager,
  LightningManager,
  SpendApprovalManager
} from '../../src/index.ts';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Phase 4: Metabolism Integration', () => {
  let stateDir: string;
  let ledger: TreasuryLedger;
  let budget: BudgetManager;
  let escalation: EscalationManager;
  let income: IncomeManager;
  let wallet: WalletManager;
  let lightning: LightningManager;
  let approval: SpendApprovalManager;

  beforeEach(() => {
    stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lmtlss-metabolism-test-'));
    ledger = new TreasuryLedger(stateDir);
    const db = ledger.getDb();
    budget = new BudgetManager(db);
    escalation = new EscalationManager(db);
    income = new IncomeManager(db);
    wallet = new WalletManager(db);
    lightning = new LightningManager(db);
    approval = new SpendApprovalManager(db);
  });

  it('should handle a full metabolism cycle', () => {
    // 1. Setup tight budget
    budget.setPolicy({
      dailyCapUsd: 1.0,
      monthlyCapUsd: 10.0,
      escalationThresholdUsd: 0.8,
      requireApprovalAboveUsd: 0.5
    });

    // 2. Register income goal
    const goalId = income.createGoal({
      description: 'Sustainment Fund',
      targetUsd: 100.0
    });

    // 3. Record some cost
    ledger.recordCost({ category: 'inference', costUsd: 0.9 });
    
    // 4. Check budget (should fail for next 0.2 spend)
    const check = budget.checkBudget(0.2);
    expect(check.allowed).toBe(false);

    // 5. Create escalation proposal
    const propId = escalation.createProposal({
      reason: 'Exceeded daily cap but need to finish goal',
      requestedCostUsd: 5.0,
      currentBudgetRemainingUsd: -0.1,
      substrate: 'openai',
      modelId: 'gpt-4o',
      taskDescription: 'Generating revenue content',
      expectedValue: 'Will complete revenue goal'
    });

    // 6. Approve escalation
    escalation.updateStatus(propId, 'approved');
    expect(escalation.getProposal(propId)?.status).toBe('approved');

    // 7. Receive income to satisfy goal
    income.recordIncome({
      amountUsd: 150.0,
      source: 'Client Payment',
      goalId
    });

    expect(income.getGoal(goalId)?.status).toBe('completed');
    expect(income.getTotalIncome()).toBe(150.0);

    // 8. Register wallet and update balance
    const walletId = wallet.registerWallet({
      label: 'Cold Storage',
      btcAddress: 'bc1q_integration_test'
    });
    wallet.updateBalance(walletId, 25000000); // 0.25 BTC
    expect(wallet.getTotalBalanceSats()).toBe(25000000);

    // 9. Request spend approval for a tool
    const approvalId = approval.createRequest({
      requestReason: 'Software License',
      amountUsd: 49.99
    });
    approval.approve(approvalId, 'SIG_HARDCODED', 'owner');
    approval.markUsed(approvalId);
    expect(approval.getApproval(approvalId)?.status).toBe('used');
  });
});

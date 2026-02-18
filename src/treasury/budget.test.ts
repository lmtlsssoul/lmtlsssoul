import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';
import { BudgetManager } from './budget.js';

describe('BudgetManager', () => {
  let ledger: TreasuryLedger;
  let budget: BudgetManager;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
    budget = new BudgetManager(ledger.getDb(), ledger);
  });

  it('should set and get policy', () => {
    const policy = {
      dailyCapUsd: 5.0,
      monthlyCapUsd: 50.0,
      escalationThresholdUsd: 4.0,
      requireApprovalAboveUsd: 0.5
    };
    budget.setPolicy(policy);
    expect(budget.getPolicy()).toEqual(policy);
  });

  it('should allow spend within budget', () => {
    const result = budget.checkBudget(0.1);
    expect(result.allowed).toBe(true);
  });

  it('should reject spend exceeding daily budget', () => {
    budget.setPolicy({
      dailyCapUsd: 1.0,
      monthlyCapUsd: 100.0,
      escalationThresholdUsd: 0.8,
      requireApprovalAboveUsd: 0.1
    });
    
    // Record some spend
    ledger.recordCost({ category: 'inference', costUsd: 0.9 });
    
    const result = budget.checkBudget(0.2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily budget cap exceeded');
  });

  it('should reject spend exceeding monthly budget', () => {
    budget.setPolicy({
      dailyCapUsd: 100.0,
      monthlyCapUsd: 1.0,
      escalationThresholdUsd: 0.8,
      requireApprovalAboveUsd: 0.1
    });

    ledger.recordCost({ category: 'inference', costUsd: 0.9 });

    const result = budget.checkBudget(0.2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Monthly budget cap exceeded');
  });

  it('should forecast monthly burn rate', () => {
    // Record $0.1 spend in the last hour
    ledger.recordCost({ category: 'inference', costUsd: 0.1 });
    
    const forecast = budget.forecastMonthlyBurn();
    expect(forecast).toBeCloseTo(3.0); // 0.1 * 30
  });
});

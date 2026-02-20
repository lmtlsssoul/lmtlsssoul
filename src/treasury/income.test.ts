import { describe, it, expect, beforeEach } from 'vitest';
import { TreasuryLedger } from './ledger.js';
import { IncomeManager } from './income.js';

describe('IncomeManager', () => {
  let ledger: TreasuryLedger;
  let income: IncomeManager;

  beforeEach(() => {
    ledger = new TreasuryLedger(':memory:');
    income = new IncomeManager(ledger.getDb());
  });

  it('should create and retrieve a revenue goal', () => {
    const goalId = income.createGoal({
      description: 'Monthly API Subs',
      targetUsd: 100.0
    });

    const goal = income.getGoal(goalId);
    expect(goal).toBeDefined();
    expect(goal?.targetUsd).toBe(100.0);
    expect(goal?.actualUsd).toBe(0.0);
    expect(goal?.status).toBe('active');
  });

  it('should record income and update goal progress', () => {
    const goalId = income.createGoal({
      description: 'Sponsorship',
      targetUsd: 50.0
    });

    income.recordIncome({
      amountUsd: 20.0,
      source: 'GitHub Sponsors',
      goalId
    });

    const goal = income.getGoal(goalId);
    expect(goal?.actualUsd).toBe(20.0);
    expect(goal?.status).toBe('active');

    income.recordIncome({
      amountUsd: 40.0,
      source: 'Patreon',
      goalId
    });

    const updatedGoal = income.getGoal(goalId);
    expect(updatedGoal?.actualUsd).toBe(60.0);
    expect(updatedGoal?.status).toBe('completed');
  });

  it('should calculate total income', () => {
    income.recordIncome({ amountUsd: 10.0, source: 'A' });
    income.recordIncome({ amountUsd: 25.0, source: 'B' });
    expect(income.getTotalIncome()).toBe(35.0);
  });
});

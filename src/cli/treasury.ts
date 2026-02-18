import { Command } from 'commander';
import { log, success, error, warn } from '../soul/branding.ts';
import { getStateDir } from '../soul/types.ts';
import { TreasuryLedger } from '../treasury/ledger.ts';
import { BudgetManager } from '../treasury/budget.ts';
import { WalletManager } from '../treasury/wallet.ts';
import { SpendApprovalManager } from '../treasury/approval.ts';
import { EscalationManager } from '../treasury/escalation.ts';
import { IncomeManager } from '../treasury/income.ts';

/**
 * Registers treasury commands to the main program.
 */
export function registerTreasuryCommands(program: Command) {
  const stateDir = getStateDir();
  const ledger = new TreasuryLedger(stateDir);
  const budget = new BudgetManager(stateDir, ledger);
  const wallet = new WalletManager(stateDir);
  const approval = new SpendApprovalManager(stateDir);
  const escalation = new EscalationManager(stateDir);
  const income = new IncomeManager(stateDir);

  const treasury = program.command('treasury')
    .description('Manage soul metabolism and budget');

  treasury.command('status')
    .description('Show treasury and budget status')
    .action(() => {
      log('--- Treasury Status ---');
      const totalCost = ledger.getTotalCost();
      const totalIncome = income.getTotalIncome();
      const balance = totalIncome - totalCost;
      const policy = budget.getPolicy();
      
      console.log(`Total Income: $${totalIncome.toFixed(4)}`);
      console.log(`Total Cost:   $${totalCost.toFixed(4)}`);
      console.log(`Net Balance:  $${balance.toFixed(4)}`);
      console.log(`Daily Cap:    $${policy.dailyCapUsd.toFixed(2)}`);
      console.log(`Monthly Cap:  $${policy.monthlyCapUsd.toFixed(2)}`);
      
      const costsByCategory = ledger.getCostsByCategory();
      if (Object.keys(costsByCategory).length > 0) {
        console.log('\n--- Costs by Category ---');
        console.table(costsByCategory);
      }

      const pendingEscalations = escalation.listProposals('pending');
      if (pendingEscalations.length > 0) {
        warn(`\nAlert: ${pendingEscalations.length} pending escalation proposals!`);
      }
    });

  const walletCmd = program.command('wallet')
    .description('Manage watch-only bitcoin wallets');

  walletCmd.command('status')
    .description('Show wallet balances')
    .action(() => {
      log('--- Wallet Status ---');
      const wallets = wallet.listWallets();
      if (wallets.length === 0) {
        warn('No wallets registered.');
        return;
      }
      console.table(wallets.map(w => ({
        Label: w.label,
        Address: w.btcAddress,
        'Balance (Sats)': w.balanceSats,
        Updated: w.updatedAt
      })));
      console.log(`Total Balance: ${wallet.getTotalBalanceSats()} Sats`);
    });

  program.command('approve')
    .description('Approve a pending spend request')
    .argument('<approvalId>', 'The ID of the approval request')
    .argument('<signature>', 'The cryptographic signature for approval')
    .argument('<approverId>', 'The ID of the approver')
    .action((approvalId, signature, approverId) => {
      const request = approval.getApproval(approvalId);
      if (!request) {
        error(`Approval request ${approvalId} not found.`);
        return;
      }
      if (request.status !== 'pending') {
        error(`Request ${approvalId} is already ${request.status}.`);
        return;
      }

      approval.approve(approvalId, signature, approverId);
      success(`Request ${approvalId} approved.`);
    });
}

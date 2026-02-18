/**
 * Treasury / Metabolism types.
 * Derived from whitepaper.pdf Section 18.
 *
 * Any living creature requires energy. In lmtlss soul, energy is compute,
 * time, storage, and money. Bitcoin and Lightning are the native currency rails.
 */

/** A single cost entry in the treasury ledger. */
export type CostEntry = {
  entryId: string;
  timestamp: string;
  category: 'inference' | 'tool' | 'storage' | 'network';
  substrate?: string;
  modelId?: string;
  role?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd: number;
  jobId?: string;
};

/** Budget policy for the treasury. */
export type BudgetPolicy = {
  dailyCapUsd: number;
  monthlyCapUsd: number;
  escalationThresholdUsd: number;
  requireApprovalAboveUsd: number;
};

/** An escalation proposal when compute exceeds budget. */
export type EscalationProposal = {
  proposalId: string;
  reason: string;
  requestedCostUsd: number;
  currentBudgetRemainingUsd: number;
  substrate: string;
  modelId: string;
  taskDescription: string;
  expectedValue: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
};

/** Wallet information (watch-only, keys never on device). */
export type WalletInfo = {
  /** Bitcoin address (hardcoded in archive, not mutable via prompts). */
  btcAddress: string;
  /** Optional Lightning node connection string. */
  lightningConnector?: string;
};

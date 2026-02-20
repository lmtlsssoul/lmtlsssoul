/**
 * Public package entrypoint.
 * Keep this file stable so builds remain valid as milestones are completed.
 */

export { ArchiveDB } from './soul/archive-db.ts';
export type { HydratedArchiveEvent, NewEventParams } from './soul/archive-db.ts';

export { GraphDB } from './soul/graph-db.ts';

export { SoulCapsule } from './soul/capsule.ts';
export { IdentityDigest, SINGULARITY_ROOT_KEY } from './soul/identity-digest.ts';
export {
  collectPresenceSnapshot,
  formatPresenceSnapshot,
  runDeterministicSystemsCheck,
} from './soul/presence.ts';
export { generateSessionKey, parseSessionKey, isValidSessionKey } from './soul/session-key.ts';
export { SoulRecall } from './soul/recall.ts';
export type { RecallOptions } from './soul/recall.ts';
export {
  extractProposalBlocks,
  parseProposalJson,
  parseAllProposals,
  parseFirstProposal,
} from './soul/proposal-parser.ts';
export { SoulCompiler } from './soul/compiler.ts';
export { CronAutonomics } from './soul/cron.ts';
export {
  SoulCirculation,
} from './soul/circulation.ts';
export type {
  CirculationContext,
  CirculationResult,
  MindFunction,
} from './soul/circulation.ts';
export { SoulBootstrap } from './soul/bootstrap.ts';
export { writeCheckpointBackup } from './soul/backup.ts';
export {
  WEIGHT_RANGES,
  clampVector,
  reinforce,
  contradict,
  decay,
  capsulePromotion,
  updateResonance,
} from './soul/weights.ts';
export { GraphTraversal } from './soul/traversal.ts';
export type { TraversalDirection, TraversalOptions, TraversalResult } from './soul/traversal.ts';
export { TensionDetector } from './soul/tension.ts';
export type { Tension, TensionType } from './soul/tension.ts';
export { DistillationEngine } from './soul/distillation.ts';
export type { DistillationOptions, ProbeResult, ProbeType } from './soul/distillation.ts';
export { ConvergenceAnalyzer } from './soul/convergence.ts';
export type { ConvergenceResult } from './soul/convergence.ts';
export {
  getGrownupModePath,
  readGrownupMode,
  setGrownupMode,
  deriveGrownupCapabilities,
} from './soul/modes.ts';
export type { GrownupModeState, GrownupCapabilities } from './soul/modes.ts';
export { GoalDecompositionEngine } from './agents/goals.ts';
export type {
  Goal as DecomposedGoal,
  Task as DecomposedTask,
} from './agents/goals.ts';
export { Orchestrator } from './agents/orchestrator.ts';
export { Scraper } from './agents/scraper.ts';
export { Reflection } from './agents/reflection.ts';
export { Interface } from './agents/interface.ts';
export {
  DialogueProtocol,
  DIALOGUE_CHANNEL,
  DIALOGUE_PROTOCOL,
} from './agents/dialogue.ts';
export type {
  DialogueKind,
  DialoguePayload,
  DialoguePriority,
  DialogueRecord,
  SendDialogueParams,
} from './agents/dialogue.ts';

export {
  VerifyBeforeCommit,
  VerifyError,
  buildArtifact,
  computeContentHash,
  VERIFY_CHANNEL,
  VERIFY_PROTOCOL,
} from './agents/verify.ts';
export type {
  ArtifactType,
  CheckKind,
  CheckOutcome,
  CheckResult,
  TaskArtifact,
  VerificationCheck,
  VerificationResult,
  VerificationSet,
} from './agents/verify.ts';
export {
  ConsequenceMeasurement,
  CONSEQUENCE_CHANNEL,
  CONSEQUENCE_PROTOCOL,
} from './agents/consequence.ts';
export type {
  ConsequenceAnalysis,
  ConsequenceMeasurementInput,
  ConsequenceMeasurementResult,
  ConsequenceOutcome,
} from './agents/consequence.ts';

export { BRAND, EPIGRAPH, BANNER } from './soul/branding.ts';
export { main as cliMain } from './cli/index.ts';

export * from './soul/types.ts';
export * from './substrate/types.ts';
export * from './queue/types.ts';
export { JobQueue, createResumedJobQueue } from './queue/runner.ts';
export { loadQueueState, saveQueueState } from './queue/resume.ts';
export { TreasuryLedger } from './treasury/ledger.ts';
export { BudgetManager } from './treasury/budget.ts';
export { EscalationManager } from './treasury/escalation.ts';
export { IncomeManager } from './treasury/income.ts';
export { WalletManager } from './treasury/wallet.ts';
export { LightningManager } from './treasury/lightning.ts';
export { SpendApprovalManager } from './treasury/approval.ts';
export * from './treasury/types.ts';

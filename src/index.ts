/**
 * Public package entrypoint.
 * Keep this file stable so builds remain valid as milestones are completed.
 */

export { ArchiveDB } from './soul/archive-db.ts';
export type { HydratedArchiveEvent, NewEventParams } from './soul/archive-db.ts';

export { GraphDB } from './soul/graph-db.ts';

export { SoulCapsule } from './soul/capsule.ts';
export { IdentityDigest } from './soul/identity-digest.ts';
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
export {
  SoulCirculation,
} from './soul/circulation.ts';
export type {
  CirculationContext,
  CirculationResult,
  MindFunction,
} from './soul/circulation.ts';
export { SoulBootstrap } from './soul/bootstrap.ts';
export {
  WEIGHT_RANGES,
  clampVector,
  reinforce,
  contradict,
  decay,
  capsulePromotion,
  updateResonance,
} from './soul/weights.ts';
export { GoalDecompositionEngine } from './agents/goals.ts';
export type {
  Goal as DecomposedGoal,
  Task as DecomposedTask,
} from './agents/goals.ts';
export { Orchestrator } from './agents/orchestrator.ts';

export { BRAND, EPIGRAPH, BANNER } from './soul/branding.ts';

export * from './soul/types.ts';
export * from './substrate/types.ts';
export * from './queue/types.ts';
export * from './treasury/types.ts';

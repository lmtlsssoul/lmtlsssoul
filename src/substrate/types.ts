/**
 * Unified Substrate Compute types.
 * Derived from whitepaper.pdf Section 16.
 *
 * A substrate is any compute backend that can list models and run inference.
 * The adapter interface makes them interchangeable while making their
 * differences explicit.
 */

import type { AgentRole } from '../soul/types.ts';

// ─── Substrate Identity ─────────────────────────────────────────

/** Supported substrate providers. Extensible as new providers emerge. */
export type SubstrateId = 'openai' | 'anthropic' | 'xai' | 'ollama';

// ─── Model Descriptor ───────────────────────────────────────────

/** Describes a model discovered from a substrate. */
export type ModelDescriptor = {
  substrate: SubstrateId;
  modelId: string;
  displayName: string;
  contextTokens?: number;
  toolCalling?: 'native' | 'mediated' | 'none';
  vision?: boolean;
  lastSeenAt: string;
};

// ─── Substrate Adapter Interface ────────────────────────────────

/** Health check result for a substrate. */
export type SubstrateHealth = {
  ok: boolean;
  detail?: string;
  lastCheckedAt: string;
};

/** Parameters for an inference invocation. */
export type InvokeParams = {
  modelId: string;
  role: AgentRole;
  promptEnvelope: unknown;
  toolEnvelope: unknown;
};

/** Result of an inference invocation. */
export type InvokeResult = {
  outputText: string;
  trace: Record<string, unknown>;
};

/**
 * The substrate adapter interface.
 * Every compute backend implements this contract.
 */
export interface SubstrateAdapter {
  readonly id: SubstrateId;

  /** Check if the substrate is reachable and authenticated. */
  health(): Promise<SubstrateHealth>;

  /** Discover all models currently available on this substrate. */
  discoverModels(): Promise<ModelDescriptor[]>;

  /** Run inference on a specific model. */
  invoke(params: InvokeParams): Promise<InvokeResult>;
}

// ─── Model Assignment ───────────────────────────────────────────

/** Maps an agent role to a specific model on a specific substrate. */
export type ModelAssignment = {
  role: AgentRole;
  substrate: SubstrateId;
  modelId: string;
  assignedAt: string;
  stale: boolean;
};

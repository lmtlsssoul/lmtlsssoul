/**
 * @file Defines the interfaces for substrate adapters, which provide a unified
 * interface for interacting with different LLM providers.
 * @author Gemini
 */

/**
 * A unique identifier for a substrate provider.
 */
export type SubstrateId = 'openai' | 'anthropic' | 'xai' | 'ollama';

/**
 * Describes a model available from a substrate.
 */
export type ModelDescriptor = {
  /**
   * Canonical substrate/model coordinates used by routing and assignment.
   */
  substrate: SubstrateId;
  modelId: string;
  displayName: string;
  lastSeenAt: string;
  contextTokens?: number;
  toolCalling?: 'native' | 'mediated' | 'none';
  vision?: boolean;
  stale?: boolean;

  /**
   * The unique identifier for the model, specific to the substrate.
   * e.g., 'gpt-4-turbo-preview'
   */
  id: string;

  /**
   * The human-readable name of the model.
   * e.g., 'GPT-4 Omni'
   */
  name: string;

  /**
   * The substrate that provides this model.
   */
  provider: SubstrateId;

  /**
   * The maximum number of tokens the model can process in a single context.
   */
  context_length: number;

  /**
   * The author or creator of the model.
   * e.g., 'openai'
   */
  owned_by?: string;

  /**
   * The timestamp when the model was created.
   */
  created?: number;

  /**
   * The maximum number of tokens the model can process in a single context.
   */
  max_context_window?: number;

  /**
   * The timestamp of the last health check for this model.
   */
  lastCheckedAt?: string;
};

/**
 * Canonical model reference format:
 *   "<substrate>:<modelId>"
 */
export type ModelReference = `${SubstrateId}:${string}`;

/**
 * Parameters for invoking an LLM on a substrate.
 */
export type InvokeParams = {
  model: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
};

/**
 * The result of an LLM invocation on a substrate.
 */
export type InvokeResult = {
  content: string;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

/**
 * An interface for a substrate adapter, providing a unified way to interact
 * with different LLM providers.
 */
export interface SubstrateAdapter {
  /**
   * The unique identifier for the substrate.
   */
  id: SubstrateId;

  /**
   * Checks the health of the substrate, ensuring it is reachable and operational.
   * @returns A promise that resolves to an object indicating the health status.
   */
  health(): Promise<{ ok: boolean; detail?: string; lastCheckedAt: string }>;

  /**
   * Discovers the models available from the substrate.
   * @returns A promise that resolves to an array of model descriptors.
   */
  discoverModels(): Promise<ModelDescriptor[]>;

  /**
   * Invokes a model on the substrate with the given parameters.
   * @param params - The parameters for the invocation.
   * @returns A promise that resolves to the result of the invocation.
   */
  invoke(params: InvokeParams): Promise<InvokeResult>;
}

/**
 * Normalizes a descriptor into the project-wide canonical shape while keeping
 * legacy fields intact for compatibility with existing callers/tests.
 */
export function normalizeModelDescriptor(input: {
  substrate: SubstrateId;
  modelId: string;
  displayName?: string;
  contextTokens?: number;
  toolCalling?: 'native' | 'mediated' | 'none';
  vision?: boolean;
  lastSeenAt?: string;
  stale?: boolean;
  author?: string;
  created?: number;
}): ModelDescriptor {
  const lastSeenAt = input.lastSeenAt ?? new Date().toISOString();
  const contextTokens = input.contextTokens ?? 0;
  const displayName = input.displayName ?? input.modelId;

  return {
    substrate: input.substrate,
    modelId: input.modelId,
    displayName,
    lastSeenAt,
    contextTokens,
    toolCalling: input.toolCalling,
    vision: input.vision,
    stale: input.stale ?? false,
    id: input.modelId,
    name: displayName,
    provider: input.substrate,
    context_length: contextTokens,
    owned_by: input.author,
    created: input.created,
    max_context_window: contextTokens,
    lastCheckedAt: lastSeenAt,
  };
}

export function toModelReference(model: Pick<ModelDescriptor, 'provider' | 'id'>): ModelReference {
  return `${model.provider}:${model.id}`;
}

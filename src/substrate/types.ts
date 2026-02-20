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
   * Display name of the model.
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
   * Upstream creator label provided by the substrate API.
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
  /**
   * Backward-compatible model selector.
   */
  model?: string;
  /**
   * Canonical whitepaper selector.
   */
  modelId?: string;
  /**
   * Optional role context for adapter-side telemetry/routing.
   */
  role?: string;
  /**
   * Backward-compatible prompt payload.
   */
  prompt?: string;
  /**
   * Canonical whitepaper prompt envelope.
   */
  promptEnvelope?: unknown;
  /**
   * Canonical whitepaper tool envelope.
   */
  toolEnvelope?: unknown;
  temperature?: number;
  max_tokens?: number;
  stop?: string[];
};

/**
 * The result of an LLM invocation on a substrate.
 */
export type InvokeResult = {
  /**
   * Canonical whitepaper output field.
   */
  outputText: string;
  /**
   * Adapter call trace payload for auditability.
   */
  trace: Record<string, unknown>;
  /**
   * Backward-compatible output field.
   */
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

export function resolveInvokeModel(params: InvokeParams): string {
  return (params.model ?? params.modelId ?? '').trim();
}

export function resolveInvokePrompt(params: InvokeParams): string {
  if (typeof params.prompt === 'string' && params.prompt.trim().length > 0) {
    return params.prompt;
  }

  const envelope = params.promptEnvelope;
  if (typeof envelope === 'string' && envelope.trim().length > 0) {
    return envelope;
  }

  if (envelope && typeof envelope === 'object') {
    const text = (envelope as Record<string, unknown>).text;
    if (typeof text === 'string' && text.trim().length > 0) {
      return text;
    }
  }

  return '';
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

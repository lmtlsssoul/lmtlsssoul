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
   * The substrate that provides this model.
   */
  substrate?: SubstrateId;

  /**
   * The owner or creator of the model.
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

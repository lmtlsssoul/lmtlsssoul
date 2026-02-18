/**
 * @file Implements the SubstrateAdapter for the xAI API.
 * @author Gemini
 */

import {
  SubstrateAdapter,
  SubstrateId,
  ModelDescriptor,
  InvokeParams,
  InvokeResult,
} from './types.js';

/**
 * A mock implementation of the SubstrateAdapter for the xAI API.
 * This class is intended for testing and development purposes and does not
 * make actual API calls to xAI.
 */
export class XaiAdapter implements SubstrateAdapter {
  public readonly id: SubstrateId = 'xai';

  /**
   * Checks the health of the xAI API.
   * For this mock implementation, it always returns a healthy status.
   * @returns A promise that resolves to an object indicating the health status.
   */
  public async health(): Promise<{ ok: boolean; detail?: string; lastCheckedAt: string }> {
    return {
      ok: true,
      detail: 'Mock health check successful.',
      lastCheckedAt: new Date().toISOString(),
    };
  }

  /**
   * Discovers the models available from the xAI API.
   * For this mock implementation, it returns a static list of models.
   * @returns A promise that resolves to an array of model descriptors.
   */
  public async discoverModels(): Promise<ModelDescriptor[]> {
    const now = new Date().toISOString();
    return [
      {
        id: 'grok-1.5',
        name: 'Grok 1.5',
        provider: 'xai',
        context_length: 128000,
        lastCheckedAt: now,
      },
    ];
  }

  /**
   * Invokes a model on the xAI API.
   * For this mock implementation, it returns a static response.
   * @param params - The parameters for the invocation.
   * @returns A promise that resolves to the result of the invocation.
   */
  public async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { model, prompt } = params;

    if (!model || !prompt) {
      throw new Error('Model and prompt are required for invocation.');
    }

    const prompt_tokens = Math.ceil(prompt.length / 4);
    const completion_tokens = 50; // A static value for mock completion

    return {
      content: `Mock response from ${model}: The prompt was "${prompt}"`,
      model: model,
      usage: {
        prompt_tokens: prompt_tokens,
        completion_tokens: completion_tokens,
        total_tokens: prompt_tokens + completion_tokens,
      },
    };
  }
}

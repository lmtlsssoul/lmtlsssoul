/**
 * @file Implements the multi-substrate model registry.
 * @author Gemini
 */

import type { SubstrateAdapter, ModelDescriptor } from './types.ts';
import { OpenaiAdapter } from './openai.ts';
import { AnthropicAdapter } from './anthropic.ts';
import { XaiAdapter } from './xai.ts';
import { OllamaAdapter } from './ollama.ts';

/**
 * Manages the discovery and aggregation of models from multiple substrates.
 */
export class ModelRegistry {
  private adapters: SubstrateAdapter[];

  /**
   * Initializes the registry with all available substrate adapters.
   */
  constructor(adapters?: SubstrateAdapter[]) {
    this.adapters = adapters ?? [new OpenaiAdapter(), new AnthropicAdapter(), new XaiAdapter(), new OllamaAdapter()];
  }

  /**
   * Discovers all models from all registered substrates, aggregates them, and
   * handles potential duplicates.
   * @returns A promise that resolves to an array of unique model descriptors.
   */
  public async discoverAllModels(): Promise<ModelDescriptor[]> {
    const allModelsPromises = this.adapters.map(async (adapter) => {
      try {
        return await adapter.discoverModels();
      } catch (err) {
        console.warn(`[Registry] Failed to discover models from ${adapter.id}:`, err);
        return [] as ModelDescriptor[];
      }
    });

    const allModelsArrays = await Promise.all(allModelsPromises);
    const allModels = allModelsArrays.flat();

    // Deduplicate models by substrate+id to preserve strict routing semantics.
    const modelMap = new Map<string, ModelDescriptor>();
    for (const model of allModels) {
      const key = `${model.substrate}:${model.modelId}`;
      if (!modelMap.has(key)) {
        modelMap.set(key, model);
      }
    }

    return Array.from(modelMap.values());
  }

  public getAdapters(): readonly SubstrateAdapter[] {
    return this.adapters;
  }
}

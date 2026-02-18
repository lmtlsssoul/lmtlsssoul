/**
 * @file Implements the multi-substrate model registry.
 * @author Gemini
 */

import { SubstrateAdapter, ModelDescriptor } from './types.js';
import { OpenaiAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { XaiAdapter } from './xai.js';
import { OllamaAdapter } from './ollama.js';

/**
 * Manages the discovery and aggregation of models from multiple substrates.
 */
export class ModelRegistry {
  private adapters: SubstrateAdapter[];

  /**
   * Initializes the registry with all available substrate adapters.
   */
  constructor() {
    this.adapters = [
      new OpenaiAdapter(),
      new AnthropicAdapter(),
      new XaiAdapter(),
      new OllamaAdapter(),
    ];
  }

  /**
   * Discovers all models from all registered substrates, aggregates them, and
   * handles potential duplicates.
   * @returns A promise that resolves to an array of unique model descriptors.
   */
  public async discoverAllModels(): Promise<ModelDescriptor[]> {
    const allModelsPromises = this.adapters.map(adapter => adapter.discoverModels());
    const allModelsArrays = await Promise.all(allModelsPromises);
    const allModels = allModelsArrays.flat();

    // Deduplicate models based on their unique ID
    const modelMap = new Map<string, ModelDescriptor>();
    for (const model of allModels) {
      if (!modelMap.has(model.id)) {
        modelMap.set(model.id, model);
      }
    }

    return Array.from(modelMap.values());
  }
}

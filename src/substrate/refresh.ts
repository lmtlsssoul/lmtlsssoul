/**
 * @file Implements the daily refresh mechanism for the model registry.
 * @author Gemini
 */

import { ModelRegistry } from './registry.js';
import { ModelDescriptor } from './types.js';

/**
 * Represents the state of the model registry, including fresh and stale models.
 */
export type RegistryState = {
  models: ModelDescriptor[];
  lastRefreshed: string;
};

/**
 * Refreshes the model registry by discovering all models and identifying
 * stale entries.
 *
 * @param currentState - The current state of the registry.
 * @returns A promise that resolves to the new state of the registry.
 */
export async function refreshModelRegistry(
  currentState?: RegistryState
): Promise<RegistryState> {
  const registry = new ModelRegistry();
  const discoveredModels = await registry.discoverAllModels();

  // In a real implementation, we would persist the list of models and their
  // lastCheckedAt timestamps. For now, we'll just return the newly
  // discovered models.

  // The concept of "staleness" would be implemented by comparing the
  // `lastCheckedAt` timestamp of each model in the persisted registry state
  // with the current time. If a model hasn't been seen in a while (e.g., 24 hours),
  // it would be marked as stale.

  // This is a placeholder for where staleness marking logic would go.
  // For now, we consider all discovered models as fresh.
  if (currentState) {
    // Conceptual logic:
    // const now = Date.now();
    // for (const model of currentState.models) {
    //   const lastSeen = new Date(model.lastCheckedAt).getTime();
    //   if (now - lastSeen > 24 * 60 * 60 * 1000) {
    //     // Mark model as stale
    //   }
    // }
  }

  return {
    models: discoveredModels,
    lastRefreshed: new Date().toISOString(),
  };
}


import { SubstrateId, ModelDescriptor } from '../substrate/types.js';

// Mocked data for now, until substrate adapters are implemented in Phase 2
const MOCK_MODELS: Record<SubstrateId, ModelDescriptor[]> = {
  openai: [
    { id: 'gpt-4o', name: 'GPT-4 Omni', provider: 'openai', context_length: 128000 },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', context_length: 128000 },
  ],
  anthropic: [
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', provider: 'anthropic', context_length: 200000 },
    { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', provider: 'anthropic', context_length: 200000 },
  ],
  xai: [
    { id: 'grok-1.5', name: 'Grok 1.5', provider: 'xai', context_length: 128000 },
  ],
  ollama: [
    { id: 'llama3:latest', name: 'Llama 3 (local)', provider: 'ollama', context_length: 8000 },
    { id: 'mistral:latest', name: 'Mistral (local)', provider: 'ollama', context_length: 8000 },
  ],
};

/**
 * Scans for available models from all substrates.
 * In the future, this will call the discoverModels() method on each substrate adapter.
 * For now, it returns mocked data.
 * @returns A promise that resolves to a map of substrate IDs to their available models.
 */
export async function scanForModels(): Promise<Record<SubstrateId, ModelDescriptor[]>> {
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 500));
  return MOCK_MODELS;
}

/**
 * Sets the model for a given role.
 * For now, this is a placeholder and does not persist the setting.
 * @param role The role to set the model for.
 * @param modelId The ID of the model to assign to the role.
 * @returns A promise that resolves when the operation is complete.
 */
export async function setModelForRole(role: string, modelId: string): Promise<void> {
  console.log(`Setting model for role "${role}" to "${modelId}"`);
  // In the future, this will update the configuration.
  await new Promise(resolve => setTimeout(resolve, 100));
}

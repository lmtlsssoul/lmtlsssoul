/**
 * @file Implements the role assignment resolver.
 * @author Gemini
 */

import { ModelDescriptor } from './types.js';

/**
 * Defines the roles for the different agents in the system.
 */
export type AgentRole =
  | 'interface'
  | 'compiler'
  | 'orchestrator'
  | 'scraper'
  | 'reflection';

/**
 * A map that defines the desired model for each agent role.
 * In a real implementation, this would be loaded from a configuration file.
 */
export const roleAssignments: Record<AgentRole, string> = {
  interface: 'claude-3-opus-20240229', // Largest available model for user interaction
  compiler: 'gpt-4-turbo', // Fast and precise model for code validation
  orchestrator: 'gpt-4o', // Strong reasoning for goal decomposition
  scraper: 'llama3:latest', // Cost-effective model for web scraping
  reflection: 'claude-3-opus-20240229', // Deep thinker for reflection
};

/**
 * Resolves the model for a given role based on the current assignments and
 * the list of available models.
 *
 * @param role - The role to resolve the model for.
 * @param availableModels - The list of currently available models.
 * @returns The model descriptor for the assigned model, or null if not found.
 */
export function resolveModelForRole(
  role: AgentRole,
  availableModels: ModelDescriptor[]
): ModelDescriptor | null {
  const modelId = roleAssignments[role];
  if (!modelId) {
    return null;
  }

  const model = availableModels.find(m => m.id === modelId);
  return model || null;
}

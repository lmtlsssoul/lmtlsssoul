/**
 * @file src/agents/types.ts
 * @description Defines common types and interfaces for all agent roles.
 * @auth lmtlss soul
 */

/**
 * Represents the unique identifier for an agent role.
 */
export type AgentRole =
  | 'interface'
  | 'compiler'
  | 'orchestrator'
  | 'scraper'
  | 'reflection';

/**
 * A standard interface for all agents to implement.
 */
export interface Agent {
  /**
   * The role of the agent.
   */
  role: AgentRole;

  /**
   * Executes the agent's primary task.
   * @param context - The context required for the agent to perform its task.
   * @returns A promise that resolves with the result of the task.
   */
  execute(context: unknown): Promise<unknown>;
}

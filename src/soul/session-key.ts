import { ulid } from 'ulid';

/**
 * Generates a stateless, ephemeral session key for a single LLM interaction.
 * Format: `lmtlss:<agentId>:<msgId>`
 * 
 * @param agentId The identifier of the agent (e.g., 'interface', 'compiler').
 * @returns A unique session key string.
 */
export function generateSessionKey(agentId: string): string {
  const msgId = ulid();
  return `lmtlss:${agentId}:${msgId}`;
}

/**
 * Parses a session key into its constituent parts.
 * 
 * @param sessionKey The session key string to parse.
 * @returns An object containing agentId and msgId, or null if invalid.
 */
export function parseSessionKey(sessionKey: string): { agentId: string; msgId: string } | null {
  if (!sessionKey.startsWith('lmtlss:')) {
    return null;
  }

  const parts = sessionKey.split(':');
  if (parts.length !== 3) {
    return null;
  }

  const [, agentId, msgId] = parts;
  
  if (!agentId || !msgId) {
    return null;
  }

  return { agentId, msgId };
}

/**
 * Validates if a string is a well-formed session key.
 * 
 * @param sessionKey The string to check.
 * @returns True if valid, false otherwise.
 */
export function isValidSessionKey(sessionKey: string): boolean {
  return parseSessionKey(sessionKey) !== null;
}

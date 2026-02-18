import { latticeUpdateProposal } from './types.js';

/**
 * Extracts and parses <lattice_update> blocks from LLM output.
 * The content of each block MUST be a valid JSON representation of an latticeUpdateProposal.
 * Legacy <index_update> tags are accepted for backward compatibility.
 */

/**
 * Parses a single JSON string into an latticeUpdateProposal, ensuring all fields exist.
 */
export function parseProposalJson(jsonText: string): latticeUpdateProposal {
  try {
    const parsed = JSON.parse(jsonText);
    
    return {
      add: Array.isArray(parsed.add) ? parsed.add : [],
      reinforce: Array.isArray(parsed.reinforce) ? parsed.reinforce : [],
      contradict: Array.isArray(parsed.contradict) ? parsed.contradict : [],
      edges: Array.isArray(parsed.edges) ? parsed.edges : [],
    };
  } catch (error) {
    throw new Error(`Failed to parse proposal JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extracts all content between <lattice_update> and </lattice_update> tags.
 * Legacy <index_update> and </index_update> tags are also accepted.
 */
export function extractProposalBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /<(?:lattice|index)_update>([\s\S]*?)<\/(?:lattice|index)_update>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      blocks.push(match[1].trim());
    }
  }

  return blocks;
}

/**
 * Extracts and parses all <lattice_update> blocks from a text string.
 */
export function parseAllProposals(text: string): latticeUpdateProposal[] {
  const blocks = extractProposalBlocks(text);
  return blocks.map(parseProposalJson);
}

/**
 * Extracts and parses the first <lattice_update> block from a text string.
 * Returns null if no block is found.
 */
export function parseFirstProposal(text: string): latticeUpdateProposal | null {
  const blocks = extractProposalBlocks(text);
  if (blocks.length === 0) return null;
  return parseProposalJson(blocks[0]);
}

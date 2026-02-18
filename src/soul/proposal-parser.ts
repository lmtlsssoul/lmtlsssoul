import { IndexUpdateProposal } from './types.js';

/**
 * Extracts and parses <index_update> blocks from LLM output.
 * The content of each block MUST be a valid JSON representation of an IndexUpdateProposal.
 */

/**
 * Parses a single JSON string into an IndexUpdateProposal, ensuring all fields exist.
 */
export function parseProposalJson(jsonText: string): IndexUpdateProposal {
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
 * Extracts all content between <index_update> and </index_update> tags.
 */
export function extractProposalBlocks(text: string): string[] {
  const blocks: string[] = [];
  const regex = /<index_update>([\s\S]*?)<\/index_update>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      blocks.push(match[1].trim());
    }
  }

  return blocks;
}

/**
 * Extracts and parses all <index_update> blocks from a text string.
 */
export function parseAllProposals(text: string): IndexUpdateProposal[] {
  const blocks = extractProposalBlocks(text);
  return blocks.map(parseProposalJson);
}

/**
 * Extracts and parses the first <index_update> block from a text string.
 * Returns null if no block is found.
 */
export function parseFirstProposal(text: string): IndexUpdateProposal | null {
  const blocks = extractProposalBlocks(text);
  if (blocks.length === 0) return null;
  return parseProposalJson(blocks[0]);
}

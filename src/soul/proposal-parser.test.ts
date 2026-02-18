import { describe, it, expect } from 'vitest';
import { extractProposalBlocks, parseProposalJson, parseAllProposals, parseFirstProposal } from './proposal-parser.js';

describe('Proposal Parser', () => {
  describe('extractProposalBlocks', () => {
    it('should extract a single block', () => {
      const text = 'Some text <index_update>{"add": []}</index_update> more text';
      expect(extractProposalBlocks(text)).toEqual(['{"add": []}']);
    });

    it('should extract multiple blocks', () => {
      const text = '<index_update>block1</index_update> random <index_update>block2</index_update>';
      expect(extractProposalBlocks(text)).toEqual(['block1', 'block2']);
    });

    it('should handle multi-line blocks', () => {
      const text = '<index_update>\n{\n  "add": []\n}\n</index_update>';
      expect(extractProposalBlocks(text)).toEqual(['{\n  "add": []\n}']);
    });

    it('should return empty array if no blocks found', () => {
      const text = 'No tags here';
      expect(extractProposalBlocks(text)).toEqual([]);
    });
  });

  describe('parseProposalJson', () => {
    it('should parse a valid proposal', () => {
      const json = '{"add": [{"premise": "test", "nodeType": "premise", "weight": {}}], "reinforce": ["id1"], "contradict": [], "edges": []}';
      const result = parseProposalJson(json);
      expect(result.add).toHaveLength(1);
      expect(result.add[0].premise).toBe('test');
      expect(result.reinforce).toEqual(['id1']);
      expect(result.contradict).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should fill in missing fields with empty arrays', () => {
      const json = '{"add": []}';
      const result = parseProposalJson(json);
      expect(result.add).toEqual([]);
      expect(result.reinforce).toEqual([]);
      expect(result.contradict).toEqual([]);
      expect(result.edges).toEqual([]);
    });

    it('should throw error on invalid JSON', () => {
      const json = '{invalid}';
      expect(() => parseProposalJson(json)).toThrow('Failed to parse proposal JSON');
    });
  });

  describe('parseAllProposals', () => {
    it('should parse all blocks in text', () => {
      const text = `
        <index_update>{"add": [{"premise": "p1"}]}</index_update>
        middle
        <index_update>{"reinforce": ["id2"]}</index_update>
      `;
      const results = parseAllProposals(text);
      expect(results).toHaveLength(2);
      expect((results[0].add[0] as any).premise).toBe('p1');
      expect(results[1].reinforce).toEqual(['id2']);
    });
  });

  describe('parseFirstProposal', () => {
    it('should return the first parsed proposal', () => {
      const text = '<index_update>{"add": []}</index_update><index_update>{"reinforce": []}</index_update>';
      const result = parseFirstProposal(text);
      expect(result).not.toBeNull();
      expect(result?.add).toEqual([]);
    });

    it('should return null if no block found', () => {
      expect(parseFirstProposal('none')).toBeNull();
    });
  });
});

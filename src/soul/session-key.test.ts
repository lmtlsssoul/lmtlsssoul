import { describe, it, expect } from 'vitest';
import { generateSessionKey, parseSessionKey, isValidSessionKey } from './session-key.js';

describe('Session Key', () => {
  describe('generateSessionKey', () => {
    it('should generate a valid session key string', () => {
      const agentId = 'interface';
      const key = generateSessionKey(agentId);
      
      expect(key).toMatch(/^lmtlss:[a-zA-Z0-9_-]+:[0-9A-Z]{26}$/); // ULID is 26 chars
      expect(key.startsWith('lmtlss:')).toBe(true);
      expect(key.includes(agentId)).toBe(true);
    });

    it('should generate unique keys', () => {
      const agentId = 'compiler';
      const key1 = generateSessionKey(agentId);
      const key2 = generateSessionKey(agentId);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('parseSessionKey', () => {
    it('should correctly parse a valid session key', () => {
      const key = 'lmtlss:my-agent:01HRZ81P5ZJXW145G7X7Z3G7X';
      const parsed = parseSessionKey(key);
      
      expect(parsed).toEqual({
        agentId: 'my-agent',
        msgId: '01HRZ81P5ZJXW145G7X7Z3G7X'
      });
    });

    it('should return null for invalid prefix', () => {
      expect(parseSessionKey('invalid:my-agent:123')).toBe(null);
    });

    it('should return null for malformed structure', () => {
      expect(parseSessionKey('lmtlss:my-agent')).toBe(null);
      expect(parseSessionKey('lmtlss:my-agent:123:extra')).toBe(null);
    });

    it('should return null for missing parts', () => {
      expect(parseSessionKey('lmtlss::123')).toBe(null);
      expect(parseSessionKey('lmtlss:agent:')).toBe(null);
    });
  });

  describe('isValidSessionKey', () => {
    it('should return true for valid keys', () => {
      expect(isValidSessionKey('lmtlss:test:01HRZ81P5ZJXW145G7X7Z3G7X')).toBe(true);
    });

    it('should return false for invalid keys', () => {
      expect(isValidSessionKey('bad:key')).toBe(false);
    });
  });
});

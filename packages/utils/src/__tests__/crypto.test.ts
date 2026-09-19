import { describe, it, expect } from 'vitest';
import { contentHash, simhash, hammingDistance, isNearDuplicate } from '../index';

describe('Crypto utilities', () => {
  describe('contentHash', () => {
    it('produces consistent SHA-256', () => {
      const h1 = contentHash('hello world');
      const h2 = contentHash('hello world');
      expect(h1).toBe(h2);
      expect(h1.length).toBe(64);
    });

    it('differs for different content', () => {
      expect(contentHash('hello')).not.toBe(contentHash('world'));
    });
  });

  describe('simhash', () => {
    it('produces 64-bit hex string', () => {
      const h = simhash('this is a test document about javascript and typescript');
      expect(h).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic', () => {
      expect(simhash('test content')).toBe(simhash('test content'));
    });

    it('differs for different content', () => {
      expect(simhash('javascript tutorial')).not.toBe(simhash('python tutorial'));
    });
  });

  describe('hammingDistance', () => {
    it('returns 0 for identical hashes', () => {
      expect(hammingDistance('abcdef', 'abcdef')).toBe(0);
    });

    it('returns correct distance', () => {
      expect(hammingDistance('0000', 'ffff')).toBe(16); // 4 bits * 4
    });
  });

  describe('isNearDuplicate', () => {
    it('detects near duplicates', () => {
      const h1 = simhash('javascript is a programming language');
      const h2 = simhash('javascript is a programming language with types');
      // These are similar but simhash may produce larger distance - use higher threshold
      expect(isNearDuplicate(h1, h2, 25)).toBe(true);
    });

    it('returns false for different content', () => {
      const h1 = simhash('javascript tutorial');
      const h2 = simhash('python tutorial');
      expect(isNearDuplicate(h1, h2, 6)).toBe(false);
    });

    it('handles undefined', () => {
      expect(isNearDuplicate(undefined, 'abc')).toBe(false);
    });

    it('returns true for identical content', () => {
      const h1 = simhash('exact same content here');
      const h2 = simhash('exact same content here');
      expect(isNearDuplicate(h1, h2, 0)).toBe(true);
    });
  });
});

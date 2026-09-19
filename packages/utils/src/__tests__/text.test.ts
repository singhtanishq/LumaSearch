import { describe, it, expect } from 'vitest';
import { chunkText, extractSnippet, truncate, stripHtml, normalizeText } from '../index';

describe('Text utilities', () => {
  describe('chunkText', () => {
    it('chunks long text', () => {
      const text = 'Paragraph one.\n\n'.repeat(50);
      const chunks = chunkText(text, { maxTokens: 50 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('respects overlap', () => {
      const text = 'word '.repeat(200);
      const chunks = chunkText(text, { maxTokens: 50, overlapTokens: 10 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('handles short text', () => {
      const chunks = chunkText('Short text');
      expect(chunks).toEqual(['Short text']);
    });
  });

  describe('extractSnippet', () => {
    it('returns snippet around query terms', () => {
      const text = 'The quick brown fox jumps over the lazy dog. The dog was very lazy.';
      const snippet = extractSnippet(text, 'lazy dog', 40);
      expect(snippet).toContain('lazy dog');
    });

    it('falls back to start if no match', () => {
      const text = 'No matching terms here at all.';
      const snippet = extractSnippet(text, 'missing', 40);
      expect(snippet).toContain('No matching');
    });
  });

  describe('truncate', () => {
    it('truncates at word boundary', () => {
      expect(truncate('Hello world this is long', 15)).toBe('Hello world\u2026');
    });

    it('returns original if short', () => {
      expect(truncate('Short', 20)).toBe('Short');
    });
  });

  describe('stripHtml', () => {
    it('removes tags', () => {
      expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    it('removes scripts and styles', () => {
      const html = '<script>alert(1)</script><style>body{}</style><p>Content</p>';
      expect(stripHtml(html)).toBe('Content');
    });

    it('decodes entities', () => {
      const input = '<p>& < > " '</p>';
      expect(stripHtml(input)).toBe('& < > " \'');
    });
  });

  describe('normalizeText', () => {
    it('normalizes unicode', () => {
      expect(normalizeText('"smart quotes"')).toBe('"smart quotes"');
      expect(normalizeText('- dash -')).toBe('- dash -');
      expect(normalizeText('... ellipsis')).toBe('... ellipsis');
    });

    it('collapses whitespace', () => {
      expect(normalizeText('hello   world')).toBe('hello world');
    });
  });
});
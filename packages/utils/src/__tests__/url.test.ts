import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, extractDomain, sameUrl, isValidHttpUrl } from '../index';

describe('URL utilities', () => {
  describe('canonicalizeUrl', () => {
    it('strips tracking params', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&foo=bar';
      expect(canonicalizeUrl(url)).toBe('https://example.com/page?foo=bar');
    });

    it('normalizes www', () => {
      expect(canonicalizeUrl('https://www.example.com/', { stripWww: true })).toBe('https://example.com');
    });

    it('forces https', () => {
      expect(canonicalizeUrl('http://example.com', { forceHttps: true })).toBe('https://example.com');
    });

    it('strips fragment', () => {
      expect(canonicalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });

    it('returns null for invalid URLs', () => {
      expect(canonicalizeUrl('not-a-url')).toBeNull();
      expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('bounds length', () => {
      const long = 'https://example.com/' + 'a'.repeat(3000);
      expect(canonicalizeUrl(long, { maxLength: 2048 })).toBeNull();
    });
  });

  describe('extractDomain', () => {
    it('extracts domain', () => {
      expect(extractDomain('https://www.example.com/path')).toBe('example.com');
    });

    it('handles multipart TLDs', () => {
      expect(extractDomain('https://example.co.uk')).toBe('example.co.uk');
      expect(extractDomain('https://sub.example.co.uk')).toBe('example.co.uk');
    });
  });

  describe('sameUrl', () => {
    it('returns true for equivalent URLs', () => {
      expect(sameUrl('https://example.com?utm_source=x', 'https://example.com')).toBe(true);
      expect(sameUrl('https://www.example.com/', 'https://example.com')).toBe(false);
      expect(sameUrl('https://www.example.com/', 'https://example.com', { stripWww: true })).toBe(true);
    });
  });

  describe('isValidHttpUrl', () => {
    it('validates http/https', () => {
      expect(isValidHttpUrl('https://example.com')).toBe(true);
      expect(isValidHttpUrl('http://example.com')).toBe(true);
      expect(isValidHttpUrl('ftp://example.com')).toBe(false);
      expect(isValidHttpUrl('not-a-url')).toBe(false);
    });
  });
});
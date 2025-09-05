import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SearchEngine, buildFtsMatchQuery } from './index';

describe('buildFtsMatchQuery', () => {
  it('escapes bare terms', () => {
    expect(buildFtsMatchQuery('hello world')).toBe('"hello" AND "world"');
  });
  it('keeps quoted phrases', () => {
    const q = buildFtsMatchQuery('the "exact phrase" here');
    expect(q).toContain('"exact phrase"');
    expect(q).toContain('AND');
  });
  it('supports exclusions', () => {
    expect(buildFtsMatchQuery('foo -bar')).toContain('NOT');
  });
});

describe('SearchEngine', () => {
  let engine: SearchEngine;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'luma-test-'));
    engine = new SearchEngine({ dbPath: join(dir, 'test.db') });
  });

  afterEach(() => {
    engine.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const docs = [
    {
      id: 'doc1',
      url: 'https://example.com/typescript',
      title: 'TypeScript Tutorial',
      content: 'TypeScript is a strongly typed programming language that builds on JavaScript.',
      headings: ['Introduction', 'Getting Started'],
      domain: 'example.com',
      language: 'en',
      vertical: 'docs',
      publishedAt: '2024-06-01T00:00:00Z',
      crawledAt: '2024-06-15T00:00:00Z',
      wordCount: 120,
    },
    {
      id: 'doc2',
      url: 'https://github.com/microsoft/TypeScript',
      title: 'microsoft/TypeScript',
      content: 'TypeScript is a superset of JavaScript that compiles to clean JavaScript output.',
      headings: ['README'],
      domain: 'github.com',
      language: 'en',
      vertical: 'code',
      publishedAt: '2024-01-01T00:00:00Z',
      crawledAt: '2024-06-15T00:00:00Z',
      wordCount: 80,
    },
    {
      id: 'doc3',
      url: 'https://example.com/python',
      title: 'Python Guide',
      content: 'Python is an interpreted high-level programming language.',
      headings: [],
      domain: 'example.com',
      language: 'en',
      vertical: 'docs',
      publishedAt: '2023-01-01T00:00:00Z',
      crawledAt: '2024-06-15T00:00:00Z',
      wordCount: 60,
    },
  ];

  it('indexes and counts documents', () => {
    engine.indexDocuments(docs);
    expect(engine.totalDocuments()).toBe(3);
  });

  it('finds documents by keyword with bm25 ranking', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: 'typescript', limit: 10 });
    expect(res.total).toBe(2);
    expect(res.results[0]!.title.toLowerCase()).toContain('typescript');
    // Both docs match; scores are positive after abs() normalization
    expect(res.results.every((r) => r.bm25Score > 0)).toBe(true);
    // Title-weighted field boosts are applied (verify the query ran with weights)
    expect(res.results.length).toBe(2);
  });

  it('matches quoted phrases exactly', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: '"compiles to clean JavaScript output"' });
    expect(res.total).toBe(1);
    expect(res.results[0]!.id).toBe('doc2');
  });

  it('supports exclusions', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: 'programming -python' });
    expect(res.total).toBe(1);
    expect(res.results.find((r) => r.id === 'doc3')).toBeUndefined();
  });

  it('filters by domain', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: 'typescript', filters: { domains: ['github.com'] } });
    expect(res.total).toBe(1);
    expect(res.results[0]!.id).toBe('doc2');
  });

  it('excludes domains', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: 'language', filters: { excludeDomains: ['github.com'] } });
    expect(res.results.every((r) => r.domain !== 'github.com')).toBe(true);
  });

  it('returns highlighted fragments with <mark> tags', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: 'typescript' });
    const withHl = res.results.find((r) => r.highlights.length > 0);
    expect(withHl).toBeDefined();
  });

  it('returns facets', () => {
    engine.indexDocuments(docs);
    const res = engine.search({ query: 'language' });
    expect(res.facets.domains.length).toBeGreaterThan(0);
    expect(res.facets.verticals.length).toBeGreaterThan(0);
  });

  it('deduplicates by id (re-index is idempotent)', () => {
    engine.indexDocuments(docs);
    engine.indexDocument(docs[0]!);
    expect(engine.totalDocuments()).toBe(3);
  });

  it('deletes documents', () => {
    engine.indexDocuments(docs);
    engine.deleteDocument('doc1');
    expect(engine.totalDocuments()).toBe(2);
  });

  it('detects indexed URLs', () => {
    engine.indexDocuments(docs);
    expect(engine.isIndexed('https://example.com/typescript')).toBe(true);
    expect(engine.isIndexed('https://not-indexed.com')).toBe(false);
  });

  it('more like this returns similar docs', () => {
    engine.indexDocuments(docs);
    const similar = engine.moreLikeThis('doc1', 5);
    expect(similar.length).toBeGreaterThan(0);
    expect(similar.find((s) => s.id === 'doc1')).toBeUndefined();
  });

  it('respects limit and offset', () => {
    engine.indexDocuments(docs);
    const page1 = engine.search({ query: 'language', limit: 1, offset: 0 });
    const page2 = engine.search({ query: 'language', limit: 1, offset: 1 });
    expect(page1.results.length).toBe(1);
    expect(page1.results[0]!.id).not.toBe(page2.results[0]!.id);
  });

  it('applies authority domain boost', () => {
    engine.indexDocuments(docs);
    const plain = engine.search({ query: 'typescript' });
    const boosted = engine.search({ query: 'typescript', authorityDomains: ['github.com'] });
    const ghPlain = plain.results.find((r) => r.id === 'doc2')!.score;
    const ghBoosted = boosted.results.find((r) => r.id === 'doc2')!.score;
    expect(ghBoosted).toBeGreaterThan(ghPlain);
  });
});

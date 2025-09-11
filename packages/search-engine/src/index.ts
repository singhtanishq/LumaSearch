/**
 * LumaSearch search engine — SQLite FTS5 full-text search.
 *
 * Fully self-contained: no external search service required. Provides
 * BM25 ranking, field boosts, filters, highlighting, facets, dedup
 * suppression and "more like this" — the same feature surface as the
 * optional Elasticsearch adapter, with zero infrastructure.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface SearchEngineOptions {
  /** Path to the SQLite database file. */
  dbPath: string;
}

export interface IndexDocument {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  content: string;
  headings?: string[];
  anchorText?: string[];
  domain: string;
  language?: string;
  vertical?: string; // web|code|docs
  contentType?: string;
  publishedAt?: string; // ISO date
  modifiedAt?: string;
  crawledAt: string;
  author?: string;
  organization?: string;
  wordCount?: number;
  status?: string;
}

export interface SearchFilters {
  domains?: string[];
  excludeDomains?: string[];
  languages?: string[];
  verticals?: string[];
  contentTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  minWordCount?: number;
}

export interface FieldWeights {
  title?: number;
  headings?: number;
  content?: number;
  anchors?: number;
}

export interface SearchOptions {
  query: string;
  filters?: SearchFilters;
  limit?: number;
  offset?: number;
  fieldWeights?: FieldWeights;
  highlightFragmentSize?: number;
  highlightNumFragments?: number;
  excludeIds?: string[];
  /** Boost recently published documents (0 = off, 2 = strong). */
  freshnessBoost?: number;
  /** Domains receiving an authority boost. */
  authorityDomains?: string[];
}

export interface ScoredResult {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  snippet: string;
  domain: string;
  language?: string;
  vertical: string;
  publishedAt?: string;
  crawledAt: string;
  score: number;
  bm25Score: number;
  wordCount?: number;
  highlights: Array<{ field: string; fragments: string[] }>;
}

export interface SearchResponse {
  results: ScoredResult[];
  total: number;
  took: number;
  facets: {
    domains: Array<{ value: string; count: number }>;
    languages: Array<{ value: string; count: number }>;
    verticals: Array<{ value: string; count: number }>;
  };
}

const CREATE_FTS = `
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  id UNINDEXED,
  url UNINDEXED,
  canonical_url UNINDEXED,
  title,
  content,
  headings,
  anchors,
  domain UNINDEXED,
  language UNINDEXED,
  vertical UNINDEXED,
  content_type UNINDEXED,
  published_at UNINDEXED,
  modified_at UNINDEXED,
  crawled_at UNINDEXED,
  author UNINDEXED,
  organization UNINDEXED,
  word_count UNINDEXED,
  status UNINDEXED,
  tokenize = 'porter unicode61'
);
`;

const CREATE_META = `
CREATE TABLE IF NOT EXISTS documents_meta (
  id TEXT PRIMARY KEY,
  url TEXT UNIQUE,
  canonical_url TEXT,
  domain TEXT,
  language TEXT,
  vertical TEXT,
  content_type TEXT,
  published_at TEXT,
  crawled_at TEXT,
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'indexed',
  simhash TEXT,
  indexed_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_meta_domain ON documents_meta(domain);
CREATE INDEX IF NOT EXISTS idx_meta_vertical ON documents_meta(vertical);
CREATE INDEX IF NOT EXISTS idx_meta_status ON documents_meta(status);
CREATE INDEX IF NOT EXISTS idx_meta_published ON documents_meta(published_at);
`;

/** Sanitize user query for FTS5 MATCH: quote terms, keep phrase quotes, support -exclusions and field: filters. */
export function buildFtsMatchQuery(rawQuery: string): string {
  const terms: string[] = [];
  const exclusions: string[] = [];
  const phrases: string[] = [];

  // Extract quoted phrases first
  let rest = rawQuery.replace(/"([^"]+)"/g, (_, phrase: string) => {
    phrases.push(phrase);
    return ' ';
  });

  // Extract exclusions (-term)
  rest = rest.replace(/(?:^|\s)-([^\s"]+)/g, (_, term: string) => {
    exclusions.push(term);
    return ' ';
  });

  // Remaining bare terms
  for (const t of rest.split(/\s+/)) {
    if (t) terms.push(t);
  }

  const escape = (s: string) => s.replace(/"/g, '""');
  const parts: string[] = [];
  for (const t of terms) parts.push(`"${escape(t)}"`);
  for (const p of phrases) parts.push(`"${escape(p)}"`); // implicit AND
  // Exclusions: NOT operator
  let match = parts.join(' AND ');
  if (exclusions.length && match) {
    const nots = exclusions.map((e) => `"${escape(e)}"`).join(' AND ');
    match = `(${match}) NOT (${nots})`;
  } else if (exclusions.length) {
    match = exclusions.map((e) => `NOT "${escape(e)}"`).join(' AND ');
  }
  return match || '""';
}

export class SearchEngine {
  private db: Database.Database;

  constructor(options: SearchEngineOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.db = new Database(options.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(CREATE_FTS);
    this.db.exec(CREATE_META);
    this.prepareStatements();
  }

  private stmtInsert!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtDeleteMeta!: Database.Statement;
  private stmtGetMeta!: Database.Statement;
  private stmtCount!: Database.Statement;
  private stmtSearch!: Database.Statement;
  private stmtCountSearch!: Database.Statement;

  private prepareStatements() {
    this.stmtInsert = this.db.prepare(`
      INSERT OR REPLACE INTO documents_fts
        (id, url, canonical_url, title, content, headings, anchors, domain, language,
         vertical, content_type, published_at, modified_at, crawled_at, author,
         organization, word_count, status)
      VALUES
        (@id, @url, @canonical_url, @title, @content, @headings, @anchors, @domain, @language,
         @vertical, @content_type, @published_at, @modified_at, @crawled_at, @author,
         @organization, @word_count, @status)
    `);
    this.stmtDelete = this.db.prepare(`DELETE FROM documents_fts WHERE id = ?`);
    this.stmtDeleteMeta = this.db.prepare(`DELETE FROM documents_meta WHERE id = ?`);
    this.stmtGetMeta = this.db.prepare(`SELECT * FROM documents_meta WHERE id = ?`);
    this.stmtCount = this.db.prepare(`SELECT COUNT(*) as c FROM documents_fts`);
    this.stmtSearch = this.db.prepare(`
      SELECT
        id, url, canonical_url, title, domain, language, vertical,
        published_at, crawled_at, word_count,
        bm25(documents_fts, 0, 0, 0, @w_title, @w_content, @w_headings, @w_anchors, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0) AS bm25_score,
        snippet(documents_fts, 4, '<mark>', '</mark>', '…', @hl_frags) AS snip_content,
        snippet(documents_fts, 3, '<mark>', '</mark>', '…', @hl_frags) AS snip_headings,
        highlight(documents_fts, 2, '<mark>', '</mark>') AS hl_title
      FROM documents_fts
      WHERE documents_fts MATCH @match
        AND status = 'indexed'
        AND (@f_domain IS NULL OR EXISTS (SELECT 1 FROM json_each(@f_domain) WHERE domain = value OR domain LIKE '%' || value))
        AND (@f_excl_domain IS NULL OR NOT EXISTS (SELECT 1 FROM json_each(@f_excl_domain) WHERE domain = value OR domain LIKE '%' || value))
        AND (@f_lang IS NULL OR language IN (SELECT value FROM json_each(@f_lang)))
        AND (@f_vertical IS NULL OR vertical IN (SELECT value FROM json_each(@f_vertical)))
        AND (@f_ctype IS NULL OR content_type IN (SELECT value FROM json_each(@f_ctype)))
        AND (@f_date_from IS NULL OR published_at >= @f_date_from)
        AND (@f_date_to IS NULL OR published_at <= @f_date_to)
        AND (@f_minwords IS NULL OR word_count >= @f_minwords)
        AND (@f_excl_ids IS NULL OR id NOT IN (SELECT value FROM json_each(@f_excl_ids)))
      ORDER BY bm25_score ASC
      LIMIT @limit OFFSET @offset
    `);
    this.stmtCountSearch = this.db.prepare(`
      SELECT COUNT(*) as c
      FROM documents_fts
      WHERE documents_fts MATCH @match
        AND status = 'indexed'
        AND (@f_domain IS NULL OR EXISTS (SELECT 1 FROM json_each(@f_domain) WHERE domain = value OR domain LIKE '%' || value))
        AND (@f_excl_domain IS NULL OR NOT EXISTS (SELECT 1 FROM json_each(@f_excl_domain) WHERE domain = value OR domain LIKE '%' || value))
        AND (@f_lang IS NULL OR language IN (SELECT value FROM json_each(@f_lang)))
        AND (@f_vertical IS NULL OR vertical IN (SELECT value FROM json_each(@f_vertical)))
        AND (@f_ctype IS NULL OR content_type IN (SELECT value FROM json_each(@f_ctype)))
        AND (@f_date_from IS NULL OR published_at >= @f_date_from)
        AND (@f_date_to IS NULL OR published_at <= @f_date_to)
        AND (@f_minwords IS NULL OR word_count >= @f_minwords)
        AND (@f_excl_ids IS NULL OR id NOT IN (SELECT value FROM json_each(@f_excl_ids)))
    `);
  }

  // ─── Indexing ───────────────────────────────────────────────────────────────

  /** Index (upsert) a single document. Idempotent by id. */
  indexDocument(doc: IndexDocument): void {
    const tx = this.db.transaction((d: IndexDocument) => {
      this.stmtDelete.run(d.id);
      this.stmtDeleteMeta.run(d.id);
      this.stmtInsert.run({
        id: d.id,
        url: d.url,
        canonical_url: d.canonicalUrl ?? d.url,
        title: d.title,
        content: d.content.slice(0, 500_000),
        headings: (d.headings ?? []).join(' \n '),
        anchors: (d.anchorText ?? []).join(' \n '),
        domain: d.domain,
        language: d.language ?? 'en',
        vertical: d.vertical ?? 'web',
        content_type: d.contentType ?? '',
        published_at: d.publishedAt ?? '',
        modified_at: d.modifiedAt ?? '',
        crawled_at: d.crawledAt,
        author: d.author ?? '',
        organization: d.organization ?? '',
        word_count: d.wordCount ?? 0,
        status: d.status ?? 'indexed',
      });
      this.db
        .prepare(
          `INSERT OR REPLACE INTO documents_meta
             (id, url, canonical_url, domain, language, vertical, content_type,
              published_at, crawled_at, word_count, status)
           VALUES (@id, @url, @canonical_url, @domain, @language, @vertical, @content_type,
                   @published_at, @crawled_at, @word_count, @status)`
        )
        .run({
          id: d.id,
          url: d.url,
          canonical_url: d.canonicalUrl ?? d.url,
          domain: d.domain,
          language: d.language ?? 'en',
          vertical: d.vertical ?? 'web',
          content_type: d.contentType ?? '',
          published_at: d.publishedAt ?? '',
          crawled_at: d.crawledAt,
          word_count: d.wordCount ?? 0,
          status: d.status ?? 'indexed',
        });
    });
    tx(doc);
  }

  /** Index many documents in a single transaction. */
  indexDocuments(docs: IndexDocument[]): { indexed: number; errors: string[] } {
    const errors: string[] = [];
    const tx = this.db.transaction((all: IndexDocument[]) => {
      for (const d of all) {
        try {
          this.stmtDelete.run(d.id);
          this.stmtDeleteMeta.run(d.id);
          this.stmtInsert.run(this.toRow(d));
          this.db
            .prepare(
              `INSERT OR REPLACE INTO documents_meta
                 (id, url, canonical_url, domain, language, vertical, content_type,
                  published_at, crawled_at, word_count, status)
               VALUES (@id, @url, @canonical_url, @domain, @language, @vertical, @content_type,
                       @published_at, @crawled_at, @word_count, @status)`
            )
            .run({
              id: d.id,
              url: d.url,
              canonical_url: d.canonicalUrl ?? d.url,
              domain: d.domain,
              language: d.language ?? 'en',
              vertical: d.vertical ?? 'web',
              content_type: d.contentType ?? '',
              published_at: d.publishedAt ?? '',
              crawled_at: d.crawledAt,
              word_count: d.wordCount ?? 0,
              status: d.status ?? 'indexed',
            });
        } catch (err) {
          errors.push(`${d.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
    tx(docs);
    return { indexed: docs.length - errors.length, errors };
  }

  private toRow(d: IndexDocument) {
    return {
      id: d.id,
      url: d.url,
      canonical_url: d.canonicalUrl ?? d.url,
      title: d.title,
      content: d.content.slice(0, 500_000),
      headings: (d.headings ?? []).join(' \n '),
      anchors: (d.anchorText ?? []).join(' \n '),
      domain: d.domain,
      language: d.language ?? 'en',
      vertical: d.vertical ?? 'web',
      content_type: d.contentType ?? '',
      published_at: d.publishedAt ?? '',
      modified_at: d.modifiedAt ?? '',
      crawled_at: d.crawledAt,
      author: d.author ?? '',
      organization: d.organization ?? '',
      word_count: d.wordCount ?? 0,
      status: d.status ?? 'indexed',
    };
  }

  deleteDocument(id: string): void {
    const tx = this.db.transaction((id: string) => {
      this.stmtDelete.run(id);
      this.stmtDeleteMeta.run(id);
    });
    tx(id);
  }

  getDocument(id: string): IndexDocument | null {
    const row = this.stmtGetMeta.get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const fts = this.db.prepare(`SELECT * FROM documents_fts WHERE id = ?`).get(id) as
      Record<string, unknown> | undefined;
    if (!fts) return null;
    return {
      id: String(row.id),
      url: String(row.url),
      canonicalUrl: (row.canonical_url as string) ?? undefined,
      title: String(fts.title ?? ''),
      content: String(fts.content ?? ''),
      headings: String(fts.headings ?? '')
        .split(' \n ')
        .filter(Boolean),
      anchorText: String(fts.anchors ?? '')
        .split(' \n ')
        .filter(Boolean),
      domain: String(row.domain),
      language: (row.language as string) ?? undefined,
      vertical: String(row.vertical ?? 'web'),
      contentType: (row.content_type as string) ?? undefined,
      publishedAt: (row.published_at as string) || undefined,
      crawledAt: String(row.crawled_at),
      wordCount: (row.word_count as number) ?? 0,
      status: String(row.status),
    };
  }

  totalDocuments(): number {
    return (this.stmtCount.get() as { c: number }).c;
  }

  // ─── Search ────────────────────────────────────────────────────────────────

  search(options: SearchOptions): SearchResponse {
    const started = Date.now();
    const match = buildFtsMatchQuery(options.query);
    if (!match || match === '""') {
      return {
        results: [],
        total: 0,
        took: 0,
        facets: { domains: [], languages: [], verticals: [] },
      };
    }

    const weights = {
      w_title: options.fieldWeights?.title ?? 3,
      w_headings: options.fieldWeights?.headings ?? 2,
      w_content: options.fieldWeights?.content ?? 1,
      w_anchors: options.fieldWeights?.anchors ?? 1.5,
      hl_frags: options.highlightNumFragments ?? 3,
    };

    const f = options.filters ?? {};
    const params: Record<string, unknown> = {
      match,
      ...weights,
      f_domain: f.domains?.length ? JSON.stringify(f.domains) : null,
      f_excl_domain: f.excludeDomains?.length ? JSON.stringify(f.excludeDomains) : null,
      f_lang: f.languages?.length ? JSON.stringify(f.languages) : null,
      f_vertical: f.verticals?.length ? JSON.stringify(f.verticals) : null,
      f_ctype: f.contentTypes?.length ? JSON.stringify(f.contentTypes) : null,
      f_date_from: f.dateFrom ?? null,
      f_date_to: f.dateTo ?? null,
      f_minwords: f.minWordCount ?? null,
      f_excl_ids: options.excludeIds?.length ? JSON.stringify(options.excludeIds) : null,
      limit: options.limit ?? 10,
      offset: options.offset ?? 0,
    };

    const rows = this.stmtSearch.all(params) as Array<Record<string, unknown>>;
    const total = (this.stmtCountSearch.get(params) as { c: number }).c;

    const now = Date.now();
    const results: ScoredResult[] = rows.map((r) => {
      const bm25 = Math.abs(Number(r.bm25_score ?? 0));
      let score = bm25;

      // Freshness boost: newer docs score higher
      if (options.freshnessBoost && r.published_at) {
        const published = new Date(String(r.published_at)).getTime();
        if (!Number.isNaN(published)) {
          const ageDays = Math.max(0, (now - published) / 86_400_000);
          const freshness = 1 / (1 + ageDays / 30); // 30-day half-life-ish
          score *= 1 + options.freshnessBoost * freshness;
        }
      }

      // Authority boost
      if (options.authorityDomains?.length) {
        const domain = String(r.domain ?? '');
        for (const auth of options.authorityDomains) {
          const host = auth.startsWith('.') ? auth.slice(1) : auth;
          if (domain === host || domain.endsWith(`.${host}`)) {
            score *= 1.5;
            break;
          }
        }
      }

      const highlights: Array<{ field: string; fragments: string[] }> = [];
      const hlTitle = String(r.hl_title ?? '');
      if (hlTitle.includes('<mark>')) highlights.push({ field: 'title', fragments: [hlTitle] });
      const snipContent = String(r.snip_content ?? '');
      if (snipContent.includes('<mark>')) {
        highlights.push({
          field: 'content',
          fragments: snipContent.split(/(?<=<\/mark>)\s*(?=<mark>)/),
        });
      }

      return {
        id: String(r.id),
        url: String(r.url),
        canonicalUrl: (r.canonical_url as string) ?? undefined,
        title: String(r.title ?? ''),
        snippet: stripMarks(snipContent || String(r.snip_headings ?? '') || ''),
        domain: String(r.domain ?? ''),
        language: (r.language as string) ?? undefined,
        vertical: String(r.vertical ?? 'web'),
        publishedAt: (r.published_at as string) || undefined,
        crawledAt: String(r.crawled_at ?? ''),
        score,
        bm25Score: bm25,
        wordCount: (r.word_count as number) ?? 0,
        highlights,
      };
    });

    // Facets (cheap: group over matching rows via separate queries)
    const facets = this.computeFacets(match);

    return { results, total, took: Date.now() - started, facets };
  }

  private computeFacets(match: string) {
    const facetFor = (column: string) => {
      const rows = this.db
        .prepare(
          `SELECT ${column} as value, COUNT(*) as count
           FROM documents_fts
           WHERE documents_fts MATCH @match AND status = 'indexed' AND ${column} != ''
           GROUP BY ${column} ORDER BY count DESC LIMIT 20`
        )
        .all({ match }) as Array<{ value: string; count: number }>;
      return rows;
    };
    return {
      domains: facetFor('domain'),
      languages: facetFor('language'),
      verticals: facetFor('vertical'),
    };
  }

  /**
   * "More like this": find documents similar to a given document using its
   * most distinctive terms.
   */
  moreLikeThis(docId: string, limit = 5): ScoredResult[] {
    const doc = this.getDocument(docId);
    if (!doc) return [];
    // Take up to 15 distinctive terms from title + first part of content
    const terms = `${doc.title} ${doc.content.slice(0, 2000)}`
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 3);
    const unique = Array.from(new Set(terms)).slice(0, 15);
    if (unique.length === 0) return [];
    const match = unique.map((t) => `"${t}"`).join(' OR ');
    const rows = this.db
      .prepare(
        `SELECT id, url, canonical_url, title, domain, language, vertical,
                published_at, crawled_at, word_count,
                bm25(documents_fts) as bm25_score,
                snippet(documents_fts, 4, '', '', '…', 2) as snip
         FROM documents_fts
         WHERE documents_fts MATCH @match AND id != @id AND status = 'indexed'
         ORDER BY bm25_score ASC LIMIT @limit`
      )
      .all({ match, id: docId, limit }) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      url: String(r.url),
      canonicalUrl: (r.canonical_url as string) ?? undefined,
      title: String(r.title ?? ''),
      snippet: String(r.snip ?? ''),
      domain: String(r.domain ?? ''),
      language: (r.language as string) ?? undefined,
      vertical: String(r.vertical ?? 'web'),
      publishedAt: (r.published_at as string) || undefined,
      crawledAt: String(r.crawled_at ?? ''),
      score: Math.abs(Number(r.bm25_score ?? 0)),
      bm25Score: Math.abs(Number(r.bm25_score ?? 0)),
      highlights: [],
    }));
  }

  /** Check whether a URL is already indexed (dedup check). */
  isIndexed(url: string): boolean {
    const row = this.db
      .prepare(`SELECT id FROM documents_meta WHERE url = ? OR canonical_url = ?`)
      .get(url, url) as { id: string } | undefined;
    return row !== undefined;
  }

  getIndexIdForUrl(url: string): string | null {
    const row = this.db
      .prepare(`SELECT id FROM documents_meta WHERE url = ? OR canonical_url = ?`)
      .get(url, url) as { id: string } | undefined;
    return row?.id ?? null;
  }

  close(): void {
    this.db.close();
  }
}

function stripMarks(text: string): string {
  return text.replace(/<\/?mark>/g, '');
}

// ─── Ranking profiles (shared with API layer) ──────────────────────────────

export interface RankProfileConfig {
  bm25: number;
  vector: number;
  freshnessBoost?: number;
  authorityBoostDomains?: string[];
}

export const RANKING_PROFILES: Record<string, RankProfileConfig> = {
  fastest: { bm25: 1, vector: 0 },
  hybrid: { bm25: 1, vector: 1 },
  recent: { bm25: 0.8, vector: 0.6, freshnessBoost: 3 },
  'primary-sources': {
    bm25: 1,
    vector: 0.8,
    authorityBoostDomains: ['.gov', '.edu', 'wikipedia.org', 'arxiv.org'],
  },
  technical: {
    bm25: 1,
    vector: 0.8,
    authorityBoostDomains: ['github.com', 'stackoverflow.com', 'developer.mozilla.org'],
  },
  community: {
    bm25: 1,
    vector: 0.6,
    authorityBoostDomains: ['reddit.com', 'news.ycombinator.com', 'stackoverflow.com'],
  },
  documentation: {
    bm25: 1,
    vector: 0.9,
    authorityBoostDomains: ['developer.mozilla.org', 'readthedocs.io', 'gitbook.io'],
  },
  research: { bm25: 0.9, vector: 1, freshnessBoost: 0.2 },
  exact: { bm25: 1, vector: 0 },
};

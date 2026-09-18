/**
 * Query builders for lexical (BM25) and hybrid (BM25 + kNN via RRF) retrieval.
 * Pure functions — no I/O — so ranking logic stays unit-testable.
 */
import type { RankingProfile, SearchFilters, QueryOperators } from '@luma-search/types';

export interface FieldWeights {
  title: number;
  headings: number;
  content: number;
  anchorText: number;
}

export const DEFAULT_FIELD_WEIGHTS: FieldWeights = {
  title: 3,
  headings: 2,
  content: 1,
  anchorText: 1.5,
};

export interface RankProfileConfig {
  bm25: number;
  vector: number;
  freshnessBoost?: number;
  authorityBoostDomains?: string[];
  pinnedDomains?: string[];
  minScore?: number;
}

export const RANKING_PROFILES: Record<RankingProfile, RankProfileConfig> = {
  fastest: { bm25: 1, vector: 0 },
  hybrid: { bm25: 1, vector: 1 },
  recent: { bm25: 0.8, vector: 0.6, freshnessBoost: 3 },
  'primary-sources': {
    bm25: 1,
    vector: 0.8,
    authorityBoostDomains: ['.gov', '.edu', 'wikipedia.org', 'arxiv.org', 'doi.org'],
  },
  technical: {
    bm25: 1,
    vector: 0.8,
    authorityBoostDomains: ['github.com', 'stackoverflow.com', 'developer.mozilla.org', 'arxiv.org'],
  },
  community: {
    bm25: 1,
    vector: 0.6,
    authorityBoostDomains: ['reddit.com', 'news.ycombinator.com', 'stackoverflow.com', 'discourse.org'],
  },
  documentation: {
    bm25: 1,
    vector: 0.9,
    authorityBoostDomains: ['developer.mozilla.org', 'docs.', 'readthedocs.io', 'gitbook.io'],
  },
  research: { bm25: 0.9, vector: 1, freshnessBoost: 0.2 },
  exact: { bm25: 1, vector: 0, minScore: 0 },
};

export function profileFor(profile: RankingProfile | undefined): RankProfileConfig {
  return RANKING_PROFILES[profile ?? 'hybrid'] ?? RANKING_PROFILES.hybrid;
}

// ─── Filter construction ────────────────────────────────────────────────────

export function buildFilters(filters: SearchFilters | undefined): Record<string, unknown>[] {
  const must: Record<string, unknown>[] = [];
  if (!filters) return must;

  if (filters.domains?.length) {
    must.push({ terms: { domain: filters.domains } });
  }
  if (filters.excludeDomains?.length) {
    must.push({ bool: { must_not: [{ terms: { domain: filters.excludeDomains } }] } });
  }
  if (filters.languages?.length) {
    must.push({ terms: { language: filters.languages } });
  }
  if (filters.contentType?.length) {
    must.push({ terms: { contentType: filters.contentType } });
  }
  const range: Record<string, unknown> = {};
  if (filters.dateFrom) range.gte = filters.dateFrom;
  if (filters.dateTo) range.lte = filters.dateTo;
  if (Object.keys(range).length) {
    must.push({ range: { publishedAt: { ...range, format: 'strict_date_optional_time' } } });
  }
  if (filters.minWordCount !== undefined) {
    must.push({ range: { wordCount: { gte: filters.minWordCount } } });
  }
  return must;
}

/**
 * Build the BM25 multi_match query from the parsed operators and normalized query.
 */
export function buildLexicalQuery(
  normalizedQuery: string,
  operators: QueryOperators,
  weights: FieldWeights = DEFAULT_FIELD_WEIGHTS
): Record<string, unknown> {
  const fields = [
    `title^${weights.title}`,
    `headings^${weights.headings}`,
    `content^${weights.content}`,
    `anchorText^${weights.anchorText}`,
  ];

  const should: Record<string, unknown>[] = [
    {
      multi_match: {
        query: normalizedQuery,
        fields,
        type: 'best_fields',
        fuzziness: 'AUTO',
      },
    },
  ];

  // Exact phrase intent: boost verbatim matches hard.
  for (const phrase of operators.phrases) {
    should.push({
      multi_match: {
        query: phrase,
        fields,
        type: 'phrase',
        boost: 2.5,
      },
    });
  }

  if (operators.intitle?.length) {
    should.push({ match: { title: { query: operators.intitle.join(' '), boost: 2 } } });
  }

  const query: Record<string, unknown> = { bool: { should, minimum_should_match: 1 } };
  const mustNot: Record<string, unknown>[] = [];
  if (operators.exclusions.length) {
    for (const term of operators.exclusions) {
      mustNot.push({ multi_match: { query: term, fields: ['title', 'content', 'headings'] } });
    }
    (query.bool as { must_not?: unknown }).must_not = mustNot;
  }
  return query;
}

/**
 * Freshness decay: prefer recently published/updated docs when profile asks for it.
 */
function freshnessFunction(boost: number): Record<string, unknown> {
  return {
    gauss: {
      publishedAt: {
        origin: 'now',
        scale: '30d',
        decay: 0.5,
      },
    },
    weight: boost,
  };
}

function authorityFunctions(domains: string[] | undefined): Record<string, unknown>[] {
  if (!domains?.length) return [];
  return [
    {
      filter: {
        bool: {
          should: domains.map((d) =>
            d.startsWith('.')
              ? { wildcard: { domain: `*${d}` } }
              : { wildcard: { domain: `*${d}*` } }
          ),
        },
      },
      weight: 1.5,
    },
  ];
}

// ─── Full request bodies ────────────────────────────────────────────────────

export interface SearchRequestOptions {
  profile: RankingProfile;
  filters?: SearchFilters;
  limit: number;
  offset: number;
  highlightFragmentSize?: number;
  highlightNumFragments?: number;
  queryVector?: number[];
  rrfRankConstant?: number;
  rrfWindow?: number;
  vertical?: string;
}

/**
 * Lexical-only request body. Works on any ES 8.x, no vectors needed.
 */
export function buildLexicalBody(
  normalizedQuery: string,
  operators: QueryOperators,
  opts: SearchRequestOptions
): Record<string, unknown> {
  const profile = profileFor(opts.profile);
  const filterClauses = buildFilters(opts.filters);

  const body: Record<string, unknown> = {
    from: opts.offset,
    size: opts.limit,
    query: {
      function_score: {
        query: {
          bool: {
            must: buildLexicalQuery(normalizedQuery, operators),
            filter: filterClauses,
          },
        },
        functions: [
          ...(profile.freshnessBoost ? [freshnessFunction(profile.freshnessBoost)] : []),
          ...authorityFunctions(profile.authorityBoostDomains),
        ],
        score_mode: 'multiply',
      },
    },
    highlight: {
      fields: {
        title: { number_of_fragments: 0 },
        content: {
          fragment_size: opts.highlightFragmentSize ?? 150,
          number_of_fragments: opts.highlightNumFragments ?? 3,
        },
        headings: { fragment_size: 80, number_of_fragments: 1 },
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      require_field_match: false,
    },
    aggs: {
      domains: { terms: { field: 'domain', size: 20 } },
      languages: { terms: { field: 'language', size: 10 } },
    },
  };
  return body;
}

/**
 * Hybrid request body: BM25 + kNN fused with Reciprocal Rank Fusion.
 * Requires the ES8 rank feature; falls back to lexical when no query vector.
 */
export function buildHybridBody(
  normalizedQuery: string,
  operators: QueryOperators,
  opts: SearchRequestOptions
): Record<string, unknown> {
  const queryVector = opts.queryVector;
  if (!queryVector || queryVector.length === 0) {
    return buildLexicalBody(normalizedQuery, operators, opts);
  }
  const profile = profileFor(opts.profile);
  const filterClauses = buildFilters(opts.filters);
  const knnFilter = filterClauses.length
    ? { filter: { bool: { must: filterClauses } } }
    : undefined;

  const knn: Record<string, unknown> = {
    field: 'embedding',
    query_vector: queryVector,
    k: Math.min(100, Math.max(opts.limit, 50)),
    num_candidates: 500,
    ...(knnFilter ? { filter: knnFilter.filter } : {}),
  };

  const body: Record<string, unknown> = {
    size: opts.limit,
    from: opts.offset,
    rank: {
      rrf: {
        window_size: opts.rrfWindow ?? 100,
        rank_constant: opts.rrfRankConstant ?? 60,
      },
    },
    retriever: {
      rrf: {
        rank_window_size: opts.rrfWindow ?? 100,
        rank_constant: opts.rrfRankConstant ?? 60,
        retrievers: [
          {
            standard: {
              query: {
                function_score: {
                  query: {
                    bool: {
                      must: buildLexicalQuery(normalizedQuery, operators),
                      filter: filterClauses,
                    },
                  },
                  functions: [
                    ...(profile.freshnessBoost ? [freshnessFunction(profile.freshnessBoost)] : []),
                    ...authorityFunctions(profile.authorityBoostDomains),
                  ],
                  score_mode: 'multiply',
                },
              },
            },
          },
          { knn },
        ],
      },
    },
    highlight: {
      fields: {
        title: { number_of_fragments: 0 },
        content: {
          fragment_size: opts.highlightFragmentSize ?? 150,
          number_of_fragments: opts.highlightNumFragments ?? 3,
        },
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
      require_field_match: false,
    },
  };
  return body;
}

/**
 * RRF fusion done client-side — used when ES version lacks server-side rank
 * or when fusing more than two strategies (lexical, vector, more-like-this).
 * Deterministic: ties broken by stable id ordering.
 */
export function fuseReciprocalRank(
  resultLists: Array<Array<{ id: string }>>,
  opts: { k?: number; weights?: number[]; limit?: number } = {}
): Array<{ id: string; score: number; contributions: number[] }> {
  const k = opts.k ?? 60;
  const weights = opts.weights ?? resultLists.map(() => 1);
  const scores = new Map<string, { score: number; contributions: number[] }>();

  resultLists.forEach((list, listIdx) => {
    const weight = weights[listIdx] ?? 1;
    list.forEach((item, rank) => {
      const contribution = weight / (k + rank + 1);
      const entry = scores.get(item.id) ?? { score: 0, contributions: resultLists.map(() => 0) };
      entry.score += contribution;
      entry.contributions[listIdx] = rank + 1;
      scores.set(item.id, entry);
    });
  });

  return Array.from(scores.entries())
    .map(([id, { score, contributions }]) => ({ id, score, contributions }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
    .slice(0, opts.limit ?? 100);
}

/**
 * "More like this" body for find-similar actions.
 */
export function buildMoreLikeThisBody(
  docId: string,
  limit: number
): Record<string, unknown> {
  return {
    size: limit,
    query: {
      more_like_this: {
        fields: ['title', 'content', 'headings'],
        like: [{ _id: docId }],
        min_term_freq: 1,
        min_doc_freq: 1,
        max_query_terms: 25,
      },
    },
  };
}
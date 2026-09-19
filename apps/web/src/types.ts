export interface SearchResult {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  snippet: string;
  domain: string;
  vertical: string;
  language?: string;
  publishedAt?: string;
  crawledAt: string;
  score: number;
  highlights?: Array<{ field: string; fragments: string[] }>;
  source: string;
}

export interface SearchResponse {
  query: string;
  interpretation: any;
  results: SearchResult[];
  total: number;
  nextCursor?: string;
  took: number;
  profile: string;
  facets?: any;
  debug?: any;
}

export interface ContradictionSource {
  citationId: string;
  statement: string;
}

export interface Contradiction {
  claim: string;
  sources: ContradictionSource[];
}

export interface AnswerResponse {
  answer: string;
  citations: Array<{
    id: string;
    resultId: string;
    url: string;
    title: string;
    passage: string;
    crawledAt: string;
  }>;
  confidence: string;
  contradictions?: Contradiction[];
  coverage: number;
  model?: string;
  tokensUsed?: { prompt: number; completion: number };
  took: number;
  cached?: boolean;
}

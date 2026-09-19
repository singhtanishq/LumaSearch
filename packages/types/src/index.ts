/**
 * LumaSearch shared type definitions.
 * Canonical entities used across API, workers, and web apps.
 */

// ─── Documents ───────────────────────────────────────────────────────────────

export type Vertical = 'web' | 'code' | 'docs';

export type ContentStatus = 'pending' | 'indexed' | 'failed' | 'excluded' | 'duplicate';

export interface DocumentBase {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  domain: string;
  language?: string;
  vertical: Vertical;
  publishedAt?: string;
  modifiedAt?: string;
  crawledAt: string;
  contentHash: string;
  simhash?: string;
  status: ContentStatus;
  metadata?: Record<string, unknown>;
}

export interface WebDocument extends DocumentBase {
  vertical: 'web';
  content: string;
  headings?: string[];
  anchorText?: string[];
  links?: Array<{ url: string; anchor?: string }>;
  media?: Array<{ type: string; url: string; alt?: string }>;
  author?: string;
  organization?: string;
  structuredData?: Record<string, unknown>;
  contentType?: string;
  wordCount?: number;
}

export interface CodeDocument extends DocumentBase {
  vertical: 'code';
  repository?: string;
  filePath?: string;
  symbol?: string;
  language?: string;
  license?: string;
  content: string;
  headings?: string[];
}

export interface DocDocument extends DocumentBase {
  vertical: 'docs';
  project?: string;
  version?: string;
  sectionHierarchy?: string[];
  content: string;
  headings?: string[];
}

export type SearchableDocument = WebDocument | CodeDocument | DocDocument;

export interface DocumentChunk {
  id: string;
  documentId: string;
  index: number;
  text: string;
  heading?: string;
  startOffset?: number;
  endOffset?: number;
  tokenCount?: number;
  embedding?: number[];
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type RankingProfile =
  | 'fastest'
  | 'hybrid'
  | 'recent'
  | 'primary-sources'
  | 'technical'
  | 'community'
  | 'documentation'
  | 'research'
  | 'exact';

export type ResultMode = 'sources-only' | 'answer' | 'research';

export interface SearchFilters {
  domains?: string[];
  excludeDomains?: string[];
  languages?: string[];
  fileTypes?: string[];
  contentType?: string[];
  vertical?: Vertical[];
  dateFrom?: string;
  dateTo?: string;
  minWordCount?: number;
}

export interface Highlight {
  field: string;
  fragments: string[];
}

export interface SearchResult {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  snippet: string;
  domain: string;
  vertical: Vertical;
  language?: string;
  publishedAt?: string;
  crawledAt: string;
  score: number;
  signals?: RankingSignals;
  highlights?: Highlight[];
  source: 'local-index' | 'external-provider' | 'cached' | 'live-web';
  similarity?: 'exact-duplicate' | 'near-duplicate' | 'unique';
}

export interface RankingSignals {
  lexical?: number;
  semantic?: number;
  freshness?: number;
  authority?: number;
  coverage?: number;
  languageMatch?: boolean;
  penalties?: string[];
}

export interface QueryInterpretation {
  original: string;
  normalized: string;
  operators: QueryOperators;
  detectedIntent?: QueryIntent;
  language?: string;
  corrections?: string[];
  expansions?: string[];
  confidence: number;
}

export interface QueryOperators {
  phrases: string[];
  exclusions: string[];
  site?: string;
  filetype?: string;
  intitle?: string[];
  inurl?: string[];
  before?: string;
  after?: string;
  lang?: string;
}

export type QueryIntent =
  | 'navigational'
  | 'informational'
  | 'transactional'
  | 'research'
  | 'code'
  | 'docs'
  | 'news'
  | 'definition'
  | 'comparison'
  | 'troubleshooting';

export interface SearchResponse {
  query: string;
  interpretation: QueryInterpretation;
  results: SearchResult[];
  total: number;
  nextCursor?: string;
  took: number;
  profile: RankingProfile;
  facets?: SearchFacets;
  debug?: SearchDebug;
}

export interface SearchFacets {
  domains?: Array<{ value: string; count: number }>;
  languages?: Array<{ value: string; count: number }>;
  verticals?: Array<{ value: string; count: number }>;
  dateHistogram?: Array<{ date: string; count: number }>;
}

export interface SearchDebug {
  strategies: Array<{
    name: string;
    hits: number;
    took: number;
    contribution?: Array<{ id: string; rank: number }>;
  }>;
  explanation?: unknown;
}

// ─── LLM Providers ───────────────────────────────────────────────────────────

export type LLMProviderKind = import('@luma-search/llm').LLMProviderKind;

// ─── AI Answers & Evidence ───────────────────────────────────────────────────

export interface Citation {
  id: string;
  resultId: string;
  url: string;
  title: string;
  passage: string;
  passageStart?: number;
  passageEnd?: number;
  publishedAt?: string;
  crawledAt: string;
}

export type AnswerConfidence = 'high' | 'medium' | 'low' | 'insufficient-evidence';

export interface Contradiction {
  claim: string;
  sources: Array<{ citationId: string; statement: string }>;
}

export interface AnswerResponse {
  answer: string;
  citations: Citation[];
  confidence: AnswerConfidence;
  contradictions?: Contradiction[];
  coverage: number;
  model?: string;
  tokensUsed?: { prompt: number; completion: number };
  took: number;
  cached?: boolean;
}

export interface EvidencePassage {
  id: string;
  documentId: string;
  url: string;
  title: string;
  text: string;
  score: number;
}

// ─── Crawling ────────────────────────────────────────────────────────────────

export type CrawlJobStatus =
  'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface CrawlJob {
  id: string;
  name?: string;
  seeds: string[];
  status: CrawlJobStatus;
  maxPages: number;
  maxDepth: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectRobots: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  stats: CrawlStats;
}

export interface CrawlStats {
  discovered: number;
  fetched: number;
  succeeded: number;
  failed: number;
  deduplicated: number;
  indexed: number;
  byStatus?: Record<string, number>;
  throughput?: number;
}

export interface CrawlTaskResult {
  url: string;
  finalUrl?: string;
  redirectChain?: string[];
  statusCode?: number;
  contentType?: string;
  contentLength?: number;
  fetchLatencyMs?: number;
  etag?: string;
  lastModified?: string;
  error?: string;
}

// ─── Users / Orgs / Auth ─────────────────────────────────────────────────────

export type Role = 'owner' | 'admin' | 'operator' | 'analyst' | 'readonly';

export interface User {
  id: string;
  email: string;
  name?: string;
  role: Role;
  organizationId?: string;
  createdAt: string;
}

// ─── Health / Observability ──────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  checks: Record<string, { status: 'ok' | 'down'; latencyMs?: number; detail?: string }>;
  uptimeSeconds: number;
}

// ─── Queue jobs ──────────────────────────────────────────────────────────────

export interface CrawlFetchJob {
  jobId: string;
  url: string;
  depth: number;
  domain: string;
  allowPatterns?: string[];
  excludePatterns?: string[];
  maxDepth: number;
  maxPages: number;
}

export interface IngestJob {
  document: SearchableDocument;
  chunks?: DocumentChunk[];
}

export interface EmbedJob {
  chunkIds: string[];
  texts: string[];
}

export interface AnswerJob {
  query: string;
  filters?: SearchFilters;
  profile?: RankingProfile;
  userId?: string;
}

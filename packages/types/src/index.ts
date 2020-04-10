import { z } from 'zod';

// ============================================================
// Base Types
// ============================================================

export const ULIDSchema = z.string().length(26).regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
export type ULID = z.infer<typeof ULIDSchema>;

export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

export const DateTimeSchema = z.string().datetime({ offset: true });
export type DateTime = z.infer<typeof DateTimeSchema>;

export const URLSchema = z.string().url();
export type URL = z.infer<typeof URLSchema>;

export const NonEmptyStringSchema = z.string().min(1);
export type NonEmptyString = z.infer<typeof NonEmptyStringSchema>;

// ============================================================
// Pagination
// ============================================================

export const PaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    totalCount: z.number().int().nonnegative().optional(),
  });

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  totalCount?: number;
};

// ============================================================
// User & Organization
// ============================================================

export const UserRoleSchema = z.enum(['owner', 'admin', 'operator', 'analyst', 'readonly']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: ULIDSchema,
  email: z.string().email(),
  name: z.string().min(1).max(255),
  avatarUrl: z.string().url().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  lastLoginAt: DateTimeSchema.nullable(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.unknown()).default({}),
});

export type User = z.infer<typeof UserSchema>;

export const OrganizationSchema = z.object({
  id: ULIDSchema,
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  description: z.string().max(1000).nullable(),
  logoUrl: z.string().url().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  settings: z.record(z.unknown()).default({}),
  limits: z.object({
    maxUsers: z.number().int().positive().default(10),
    maxSearchQueriesPerMonth: z.number().int().positive().default(10000),
    maxCrawlUrlsPerMonth: z.number().int().positive().default(100000),
    maxIndexedDocuments: z.number().int().positive().default(1000000),
    maxAiTokensPerMonth: z.number().int().positive().default(1000000),
    maxStorageGb: z.number().positive().default(10),
  }).default({}),
});

export type Organization = z.infer<typeof OrganizationSchema>;

export const MembershipSchema = z.object({
  id: ULIDSchema,
  userId: ULIDSchema,
  organizationId: ULIDSchema,
  role: UserRoleSchema,
  joinedAt: DateTimeSchema,
  invitedBy: ULIDSchema.nullable(),
});

export type Membership = z.infer<typeof MembershipSchema>;

// ============================================================
// API Keys
// ============================================================

export const ApiKeySchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  name: z.string().min(1).max(100),
  prefix: z.string(),
  hashedKey: z.string(),
  scopes: z.array(z.string()).default([]),
  rateLimit: z.number().int().positive().nullable(),
  expiresAt: DateTimeSchema.nullable(),
  lastUsedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  createdBy: ULIDSchema,
  revokedAt: DateTimeSchema.nullable(),
});

export type ApiKey = z.infer<typeof ApiKeySchema>;

export const ApiKeyCreateSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).default([]),
  rateLimit: z.number().int().positive().nullable().optional(),
  expiresInDays: z.number().int().positive().nullable().optional(),
});

export type ApiKeyCreate = z.infer<typeof ApiKeyCreateSchema>;

export const ApiKeyWithSecretSchema = ApiKeySchema.extend({
  secret: z.string(),
});

export type ApiKeyWithSecret = z.infer<typeof ApiKeyWithSecretSchema>;

// ============================================================
// Documents & Index
// ============================================================

export const ContentTypeSchema = z.enum([
  'web',
  'code',
  'document',
  'pdf',
  'news',
  'academic',
  'image',
  'video',
  'audio',
  'product',
  'local',
  'other',
]);

export type ContentType = z.infer<typeof ContentTypeSchema>;

export const DocumentSchema = z.object({
  id: ULIDSchema,
  indexId: ULIDSchema,
  url: URLSchema,
  canonicalUrl: URLSchema.nullable(),
  title: z.string().max(1000),
  content: z.string(),
  contentHash: z.string().length(64), // SHA256 hex
  simhash: z.string().length(16).nullable(), // 64-bit simhash as hex
  language: z.string().length(2).nullable(), // ISO 639-1
  contentType: ContentTypeSchema,
  domain: z.string().max(255),
  publishedAt: DateTimeSchema.nullable(),
  modifiedAt: DateTimeSchema.nullable(),
  crawledAt: DateTimeSchema,
  indexedAt: DateTimeSchema,
  author: z.string().max(500).nullable(),
  publisher: z.string().max(500).nullable(),
  metadata: z.record(z.unknown()).default({}),
  structuredData: z.record(z.unknown()).default({}),
  headings: z.array(z.object({
    level: z.number().int().min(1).max(6),
    text: z.string(),
    anchor: z.string().optional(),
  })).default([]),
  links: z.array(z.object({
    url: URLSchema,
    anchorText: z.string(),
    rel: z.string().optional(),
    isInternal: z.boolean(),
  })).default([]),
  media: z.array(z.object({
    type: z.enum(['image', 'video', 'audio']),
    url: URLSchema,
    alt: z.string().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
  })).default([]),
  embedding: z.array(z.number()).nullable(), // Vector embedding
  chunkCount: z.number().int().nonnegative().default(0),
  qualityScore: z.number().min(0).max(1).nullable(),
  spamScore: z.number().min(0).max(1).nullable(),
  isDuplicate: z.boolean().default(false),
  duplicateOf: ULIDSchema.nullable(),
  version: z.number().int().positive().default(1),
});

export type Document = z.infer<typeof DocumentSchema>;

export const DocumentChunkSchema = z.object({
  id: ULIDSchema,
  documentId: ULIDSchema,
  indexId: ULIDSchema,
  chunkIndex: z.number().int().nonnegative(),
  content: z.string(),
  tokenCount: z.number().int().positive(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  headingPath: z.array(z.string()).default([]), // Hierarchy of headings
  embedding: z.array(z.number()).nullable(),
});

export type DocumentChunk = z.infer<typeof DocumentChunkSchema>;

export const IndexAliasSchema = z.object({
  name: z.string(),
  alias: z.string(),
  isWriteIndex: z.boolean().default(false),
  createdAt: DateTimeSchema,
});

export type IndexAlias = z.infer<typeof IndexAliasSchema>;

// ============================================================
// Crawling
// ============================================================

export const CrawlJobStatusSchema = z.enum([
  'pending',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);

export type CrawlJobStatus = z.infer<typeof CrawlJobStatusSchema>;

export const CrawlJobSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  status: CrawlJobStatusSchema.default('pending'),
  config: z.object({
    seedUrls: z.array(URLSchema).default([]),
    seedDomains: z.array(z.string()).default([]),
    sitemapUrls: z.array(URLSchema).default([]),
    maxDepth: z.number().int().positive().default(3),
    maxUrls: z.number().int().positive().default(10000),
    maxUrlsPerDomain: z.number().int().positive().default(1000),
    respectRobotsTxt: z.boolean().default(true),
    followNoFollow: z.boolean().default(false),
    indexNoIndex: z.boolean().default(false),
    crawlDelayMs: z.number().int().nonnegative().default(1000),
    allowedContentTypes: z.array(ContentTypeSchema).default(['web']),
    denyPatterns: z.array(z.string()).default([]),
    allowPatterns: z.array(z.string()).default([]),
    userAgent: z.string().optional(),
    customHeaders: z.record(z.string()).default({}),
  }).default({}),
  stats: z.object({
    urlsDiscovered: z.number().int().nonnegative().default(0),
    urlsQueued: z.number().int().nonnegative().default(0),
    urlsFetched: z.number().int().nonnegative().default(0),
    urlsSucceeded: z.number().int().nonnegative().default(0),
    urlsFailed: z.number().int().nonnegative().default(0),
    urlsSkipped: z.number().int().nonnegative().default(0),
    bytesDownloaded: z.number().int().nonnegative().default(0),
    documentsIndexed: z.number().int().nonnegative().default(0),
    duplicatesFound: z.number().int().nonnegative().default(0),
    startTime: DateTimeSchema.nullable(),
    endTime: DateTimeSchema.nullable(),
    lastActivityAt: DateTimeSchema.nullable(),
  }).default({}),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  createdBy: ULIDSchema,
  startedAt: DateTimeSchema.nullable(),
  completedAt: DateTimeSchema.nullable(),
  error: z.string().nullable(),
});

export type CrawlJob = z.infer<typeof CrawlJobSchema>;

export const CrawlTaskSchema = z.object({
  id: ULIDSchema,
  jobId: ULIDSchema,
  url: URLSchema,
  normalizedUrl: URLSchema,
  canonicalUrl: URLSchema.nullable(),
  domain: z.string(),
  depth: z.number().int().nonnegative(),
  priority: z.number().int().default(0),
  status: z.enum(['pending', 'fetching', 'parsing', 'indexing', 'completed', 'failed', 'skipped']).default('pending'),
  fetchAttempts: z.number().int().default(0),
  maxFetchAttempts: z.number().int().default(3),
  httpStatus: z.number().int().nullable(),
  contentType: z.string().nullable(),
  contentLength: z.number().int().nullable(),
  fetchLatencyMs: z.number().int().nullable(),
  error: z.string().nullable(),
  redirectChain: z.array(URLSchema).default([]),
  etag: z.string().nullable(),
  lastModified: z.string().nullable(),
  contentHash: z.string().nullable(),
  scheduledAt: DateTimeSchema,
  startedAt: DateTimeSchema.nullable(),
  completedAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type CrawlTask = z.infer<typeof CrawlTaskSchema>;

export const CrawlRunSchema = z.object({
  id: ULIDSchema,
  jobId: ULIDSchema,
  workerId: z.string(),
  startedAt: DateTimeSchema,
  endedAt: DateTimeSchema.nullable(),
  tasksProcessed: z.number().int().nonnegative().default(0),
  tasksSucceeded: z.number().int().nonnegative().default(0),
  tasksFailed: z.number().int().nonnegative().default(0),
  metrics: z.record(z.number()).default({}),
});

export type CrawlRun = z.infer<typeof CrawlRunSchema>;

// ============================================================
// Search
// ============================================================

export const SearchQuerySchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  userId: ULIDSchema.nullable(),
  sessionId: ULIDSchema.nullable(),
  query: z.string().min(1).max(2000),
  parsedQuery: z.object({
    original: z.string(),
    normalized: z.string(),
    intent: z.enum(['navigational', 'informational', 'transactional', 'research', 'code', 'docs', 'local', 'shopping', 'news', 'academic', 'unknown']),
    operators: z.record(z.array(z.string())).default({}),
    expansions: z.array(z.string()).default([]),
    corrections: z.array(z.object({
      original: z.string(),
      corrected: z.string(),
      confidence: z.number().min(0).max(1),
    })).default([]),
    filters: z.object({
      domains: z.array(z.string()).default([]),
      excludeDomains: z.array(z.string()).default([]),
      contentTypes: z.array(ContentTypeSchema).default([]),
      languages: z.array(z.string().length(2)).default([]),
      dateFrom: DateTimeSchema.nullable(),
      dateTo: DateTimeSchema.nullable(),
      fileTypes: z.array(z.string()).default([]),
      sites: z.array(z.string()).default([]),
    }).default({}),
    vertical: z.enum(['web', 'code', 'docs', 'news', 'academic', 'images', 'videos', 'shopping', 'local', 'all']).default('all'),
    confidence: z.number().min(0).max(1).default(1),
  }).optional(),
  rankingProfile: z.string().default('hybrid'),
  resultCount: z.number().int().nonnegative().default(0),
  latencyMs: z.number().int().nonnegative().default(0),
  retrievalStrategy: z.enum(['lexical', 'semantic', 'hybrid', 'provider']).default('lexical'),
  provider: z.string().nullable(),
  createdAt: DateTimeSchema,
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export const SearchResultSchema = z.object({
  id: ULIDSchema,
  documentId: ULIDSchema,
  indexId: ULIDSchema,
  score: z.number(),
  rank: z.number().int().positive(),
  title: z.string(),
  url: URLSchema,
  domain: z.string(),
  snippet: z.string(),
  highlightedSnippet: z.string().nullable(),
  contentType: ContentTypeSchema,
  language: z.string().length(2).nullable(),
  publishedAt: DateTimeSchema.nullable(),
  crawledAt: DateTimeSchema,
  author: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  source: z.enum(['index', 'provider', 'cache']).default('index'),
  providerName: z.string().nullable(),
  providerAttribution: z.string().nullable(),
  explain: z.record(z.unknown()).nullable(), // Ranking explanation
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

export const SearchResponseSchema = z.object({
  queryId: ULIDSchema,
  query: z.string(),
  parsedQuery: SearchQuerySchema.shape.parsedQuery.nullable(),
  results: z.array(SearchResultSchema),
  facets: z.record(z.array(z.object({
    value: z.string(),
    count: z.number().int().nonnegative(),
  }))).default({}),
  totalResults: z.number().int().nonnegative(),
  searchTimeMs: z.number().int().nonnegative(),
  retrievalTimeMs: z.number().int().nonnegative(),
  rankingTimeMs: z.number().int().nonnegative(),
  pagination: PaginationSchema,
  suggestions: z.array(z.string()).default([]),
  debug: z.record(z.unknown()).nullable(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;

// ============================================================
// AI Answers & Evidence
// ============================================================

export const EvidenceChunkSchema = z.object({
  id: ULIDSchema,
  documentId: ULIDSchema,
  chunkId: ULIDSchema.nullable(),
  content: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
  score: z.number(),
  documentTitle: z.string(),
  documentUrl: URLSchema,
  documentDomain: z.string(),
  documentCrawledAt: DateTimeSchema,
  documentPublishedAt: DateTimeSchema.nullable(),
});

export type EvidenceChunk = z.infer<typeof EvidenceChunkSchema>;

export const CitationSchema = z.object({
  id: z.string(), // Citation marker like [1], [2]
  evidenceIds: z.array(ULIDSchema),
  text: z.string(), // The text segment this citation supports
  startChar: z.number().int().nonnegative(),
  endChar: z.number().int().nonnegative(),
});

export type Citation = z.infer<typeof CitationSchema>;

export const AnswerSchema = z.object({
  id: ULIDSchema,
  queryId: ULIDSchema,
  organizationId: ULIDSchema,
  userId: ULIDSchema.nullable(),
  answer: z.string(),
  citations: z.array(CitationSchema).default([]),
  evidence: z.array(EvidenceChunkSchema).default([]),
  model: z.string(),
  modelProvider: z.string(),
  tokenUsage: z.object({
    prompt: z.number().int().nonnegative(),
    completion: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  costUsd: z.number().nonnegative(),
  confidence: z.number().min(0).max(1),
  hasConflicts: z.boolean().default(false),
  conflictSummary: z.string().nullable(),
  evidenceCoverage: z.number().min(0).max(1),
  latencyMs: z.number().int().nonnegative(),
  cached: z.boolean().default(false),
  createdAt: DateTimeSchema,
});

export type Answer = z.infer<typeof AnswerSchema>;

export const AnswerModeSchema = z.enum(['fast', 'research', 'evidence-only', 'compare']);
export type AnswerMode = z.infer<typeof AnswerModeSchema>;

export const AnswerRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  mode: AnswerModeSchema.default('fast'),
  rankingProfile: z.string().optional(),
  maxEvidencePassages: z.number().int().positive().max(20).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  stream: z.boolean().default(false),
  sessionId: ULIDSchema.optional(),
});

export type AnswerRequest = z.infer<typeof AnswerRequestSchema>;

// ============================================================
// Search Workspace
// ============================================================

export const WorkspaceSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  userId: ULIDSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  isPublic: z.boolean().default(false),
  shareToken: z.string().nullable(),
  parentWorkspaceId: ULIDSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  settings: z.record(z.unknown()).default({}),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const WorkspaceItemSchema = z.object({
  id: ULIDSchema,
  workspaceId: ULIDSchema,
  type: z.enum(['query', 'result', 'evidence', 'note', 'summary']),
  refId: ULIDSchema, // Reference to query, result, evidence, etc.
  position: z.number().int().default(0),
  metadata: z.record(z.unknown()).default({}),
  createdAt: DateTimeSchema,
  createdBy: ULIDSchema,
});

export type WorkspaceItem = z.infer<typeof WorkspaceItemSchema>;

export const NoteSchema = z.object({
  id: ULIDSchema,
  workspaceId: ULIDSchema,
  userId: ULIDSchema,
  content: z.string(),
  attachedTo: z.object({
    type: z.enum(['result', 'evidence', 'query']),
    id: ULIDSchema,
  }).nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Note = z.infer<typeof NoteSchema>;

// ============================================================
// Collections & Connectors
// ============================================================

export const CollectionSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable(),
  indexAlias: z.string(),
  isPrivate: z.boolean().default(true),
  connectorId: ULIDSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  createdBy: ULIDSchema,
  documentCount: z.number().int().nonnegative().default(0),
  settings: z.record(z.unknown()).default({}),
});

export type Collection = z.infer<typeof CollectionSchema>;

export const ConnectorSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  name: z.string().min(1).max(255),
  type: z.enum(['github', 'gitlab', 'notion', 'confluence', 'jira', 'slack', 'gdrive', 's3', 'rss', 'custom']),
  config: z.record(z.unknown()).default({}),
  schedule: z.string().nullable(), // Cron expression
  status: z.enum(['active', 'paused', 'error', 'never_run']).default('never_run'),
  lastRunAt: DateTimeSchema.nullable(),
  lastRunStatus: z.enum(['success', 'partial', 'failed']).nullable(),
  lastRunError: z.string().nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  createdBy: ULIDSchema,
});

export type Connector = z.infer<typeof ConnectorSchema>;

// ============================================================
// Alerts & Monitoring
// ============================================================

export const AlertSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  userId: ULIDSchema,
  name: z.string().min(1).max(255),
  type: z.enum(['query', 'topic', 'page', 'domain']),
  config: z.object({
    query: z.string().optional(),
    topic: z.string().optional(),
    url: URLSchema.optional(),
    domain: z.string().optional(),
    frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']).default('daily'),
    threshold: z.object({
      newResults: z.number().int().positive().optional(),
      relevanceChange: z.number().min(0).max(1).optional(),
      contentChangePercent: z.number().min(0).max(100).optional(),
    }).optional(),
  }).default({}),
  isActive: z.boolean().default(true),
  lastTriggeredAt: DateTimeSchema.nullable(),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Alert = z.infer<typeof AlertSchema>;

export const AlertNotificationSchema = z.object({
  id: ULIDSchema,
  alertId: ULIDSchema,
  type: z.enum(['email', 'webhook', 'in_app']),
  payload: z.record(z.unknown()),
  status: z.enum(['pending', 'sent', 'failed']),
  sentAt: DateTimeSchema.nullable(),
  error: z.string().nullable(),
  createdAt: DateTimeSchema,
});

export type AlertNotification = z.infer<typeof AlertNotificationSchema>;

// ============================================================
// Analytics & Usage
// ============================================================

export const UsageRecordSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  userId: ULIDSchema.nullable(),
  apiKeyId: ULIDSchema.nullable(),
  type: z.enum(['search', 'answer', 'crawl', 'index', 'embedding', 'storage']),
  quantity: z.number().int().positive(),
  unit: z.string(),
  metadata: z.record(z.unknown()).default({}),
  recordedAt: DateTimeSchema,
  billedAt: DateTimeSchema.nullable(),
});

export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export const SearchAnalyticsSchema = z.object({
  queryId: ULIDSchema,
  resultId: ULIDSchema,
  position: z.number().int().positive(),
  action: z.enum(['impression', 'click', 'dwell', 'bookmark', 'share']),
  dwellTimeMs: z.number().int().nonnegative().nullable(),
  timestamp: DateTimeSchema,
});

export type SearchAnalytics = z.infer<typeof SearchAnalyticsSchema>;

// ============================================================
// Audit & System
// ============================================================

export const AuditEventSchema = z.object({
  id: ULIDSchema,
  organizationId: ULIDSchema,
  userId: ULIDSchema.nullable(),
  apiKeyId: ULIDSchema.nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: DateTimeSchema,
});

export type AuditEvent = z.infer<typeof AuditEventSchema>;

export const SystemHealthSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  checks: z.array(z.object({
    name: z.string(),
    status: z.enum(['pass', 'warn', 'fail']),
    message: z.string().nullable(),
    latencyMs: z.number().int().nonnegative().nullable(),
    timestamp: DateTimeSchema,
  })),
  version: z.string(),
  uptime: z.number().int().positive(),
});

export type SystemHealth = z.infer<typeof SystemHealthSchema>;

// ============================================================
// Feature Flags
// ============================================================

export const FeatureFlagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  rolloutPercentage: z.number().min(0).max(100).default(100),
  targetingRules: z.array(z.object({
    attribute: z.string(),
    operator: z.enum(['equals', 'not_equals', 'in', 'not_in', 'contains', 'gt', 'lt']),
    value: z.unknown(),
  })).default([]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;

// ============================================================
// API Request/Response Types
// ============================================================

export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(2000),
  rankingProfile: z.string().optional(),
  pagination: PaginationSchema.optional(),
  filters: z.object({
    domains: z.array(z.string()).optional(),
    excludeDomains: z.array(z.string()).optional(),
    contentTypes: z.array(ContentTypeSchema).optional(),
    languages: z.array(z.string().length(2)).optional(),
    dateFrom: DateTimeSchema.nullable().optional(),
    dateTo: DateTimeSchema.nullable().optional(),
    fileTypes: z.array(z.string()).optional(),
    sites: z.array(z.string()).optional(),
    collections: z.array(ULIDSchema).optional(),
  }).optional(),
  vertical: z.enum(['web', 'code', 'docs', 'news', 'academic', 'images', 'videos', 'shopping', 'local', 'all']).optional(),
  debug: z.boolean().default(false),
  highlight: z.boolean().default(true),
});

export type SearchRequest = z.infer<typeof SearchRequestSchema>;

export const CrawlJobCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  config: CrawlJobSchema.shape.config.partial().optional(),
});

export type CrawlJobCreate = z.infer<typeof CrawlJobCreateSchema>;

export const WorkspaceCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  parentWorkspaceId: ULIDSchema.nullable().optional(),
});

export type WorkspaceCreate = z.infer<typeof WorkspaceCreateSchema>;

export const CollectionCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  isPrivate: z.boolean().default(true),
  connectorId: ULIDSchema.nullable().optional(),
});

export type CollectionCreate = z.infer<typeof CollectionCreateSchema>;

// ============================================================
// Error Types
// ============================================================

export const ApiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).nullable(),
  requestId: z.string(),
  timestamp: DateTimeSchema,
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> | null = null,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, details, 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super('NOT_FOUND', `${resource} not found: ${id}`, { resource, id }, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, null, 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super('FORBIDDEN', message, null, 403);
    this.name = 'ForbiddenError';
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, public readonly retryAfter: number) {
    super('RATE_LIMITED', message, { retryAfter }, 429);
    this.name = 'RateLimitError';
  }
}

export class ProviderError extends AppError {
  constructor(provider: string, message: string, public readonly originalError?: Error) {
    super('PROVIDER_ERROR', `${provider}: ${message}`, { provider }, 502);
    this.name = 'ProviderError';
  }
}

// ============================================================
// Constants
// ============================================================

export const RANKING_PROFILES = [
  'fastest',
  'recent',
  'primary-sources',
  'technical',
  'community',
  'documentation',
  'research',
  'visual',
  'hybrid',
] as const;

export type RankingProfile = typeof RANKING_PROFILES[number];

export const CONTENT_TYPES = [
  'web',
  'code',
  'document',
  'pdf',
  'news',
  'academic',
  'image',
  'video',
  'audio',
  'product',
  'local',
  'other',
] as const;

export type ContentTypeValue = typeof CONTENT_TYPES[number];

export const VERTICALS = [
  'web',
  'code',
  'docs',
  'news',
  'academic',
  'images',
  'videos',
  'shopping',
  'local',
  'all',
] as const;

export type Vertical = typeof VERTICALS[number];

export const ANSWER_MODES = ['fast', 'research', 'evidence-only', 'compare'] as const;
export type AnswerModeValue = typeof ANSWER_MODES[number];

// ============================================================
// Utility Functions
// ============================================================

export function generateULID(): ULID {
  // Simple ULID-like generation (in production use ulid package)
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const random = Array.from({ length: 16 }, () => 
    '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]
  ).join('');
  return (timestamp + random) as ULID;
}

export function isValidULID(id: string): id is ULID {
  return ULIDSchema.safeParse(id).success;
}

export function isValidUUID(id: string): id is UUID {
  return UUIDSchema.safeParse(id).success;
}
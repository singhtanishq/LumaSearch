/**
 * LumaSearch job queue — SQLite-backed, in-process workers.
 * No Redis required. Jobs persist across restarts via the Prisma Job model.
 */
export { LocalQueue } from './local';
export type { QueueName, JobPayload, JobHandler, LocalQueueOptions } from './local';

export const QUEUE_NAMES = {
  crawlFetch: 'crawl:fetch',
  crawlParse: 'crawl:parse',
  indexIngest: 'index:ingest',
  embedGenerate: 'embed:generate',
  answerGenerate: 'answer:generate',
  analyticsAggregate: 'analytics:aggregate',
} as const;

// ─── Job payload types (shared between producer and consumer) ──────────────

export interface CrawlFetchJobData {
  jobId: string;
  url: string;
  depth: number;
  maxDepth: number;
  maxPages: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectRobots: boolean;
}

export interface IngestJobData {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType?: string;
  html: string;
  crawledAt: string;
  jobId?: string;
}

export interface EmbedJobData {
  chunkIds: string[];
  texts: string[];
}

export interface AnswerJobData {
  query: string;
  profile?: string;
  userId?: string;
}

/**
 * BullMQ queue definitions and shared connection factory.
 * Queue-per-concern: crawl fetch/parse, ingest, embed, answer, analytics.
 */
import { Queue, QueueEvents, Worker, ConnectionOptions, Processor } from 'bullmq';
import IORedis, { Redis } from 'ioredis';

export const QUEUE_NAMES = {
  crawlFetch: 'crawl:fetch',
  crawlParse: 'crawl:parse',
  indexIngest: 'index:ingest',
  embedGenerate: 'embed:generate',
  answerGenerate: 'answer:generate',
  analyticsAggregate: 'analytics:aggregate',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface QueueConfig {
  redisUrl: string;
  maxRetries?: number;
  backoffMs?: number;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export function createConnection(redisUrl: string): Redis {
  const conn = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  return conn;
}

export function connectionOptions(redisUrl: string): ConnectionOptions {
  return {
    connection: createConnection(redisUrl),
    prefix: 'luma',
  };
}

const defaultJobOptions = (cfg: QueueConfig) => ({
  attempts: cfg.maxRetries ?? 3,
  backoff: {
    type: 'exponential' as const,
    delay: cfg.backoffMs ?? 5000,
  },
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
});

export function createQueue(name: QueueName, cfg: QueueConfig): Queue {
  return new Queue(name, {
    ...connectionOptions(cfg.redisUrl),
    defaultJobOptions: defaultJobOptions(cfg),
    limiter: {
      max: cfg.rateLimitMax ?? 100,
      duration: cfg.rateLimitWindowMs ?? 60_000,
    },
  });
}

export function createWorker<T>(
  name: QueueName,
  cfg: QueueConfig,
  processor: Processor<T>,
  concurrency = 5
): Worker<T> {
  return new Worker<T>(name, processor, {
    ...connectionOptions(cfg.redisUrl),
    concurrency,
  });
}

export function createQueueEvents(name: QueueName, redisUrl: string): QueueEvents {
  return new QueueEvents(name, { connection: createConnection(redisUrl), prefix: 'luma' });
}

export async function queueDepths(queues: Queue[]): Promise<Record<string, { waiting: number; active: number; failed: number; completed: number }>> {
  const out: Record<string, { waiting: number; active: number; failed: number; completed: number }> = {};
  await Promise.all(
    queues.map(async (q) => {
      const counts = await q.getJobCounts('waiting', 'active', 'failed', 'completed');
      out[q.name] = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        completed: counts.completed ?? 0,
      };
    })
  );
  return out;
}

// ─── Job payload types (shared between API producer and worker consumer) ────

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
  finalUrl?: string;
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

export type { Processor };
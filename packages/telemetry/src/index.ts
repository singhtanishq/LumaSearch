/**
 * Structured logging, metrics, and health-check helpers.
 * Pino for logs; prom-client for Prometheus metrics.
 */
import { randomUUID } from 'node:crypto';
import pino, { Logger, LoggerOptions } from 'pino';
import { collectDefaultMetrics, Counter, Gauge, Histogram, register } from 'prom-client';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LoggerConfig {
  level?: LogLevel;
  pretty?: boolean;
  service?: string;
  redactPaths?: string[];
}

/**
 * Fields that may contain user-supplied sensitive data.
 * Query text is kept deliberately — search debugging needs it — but secrets never are.
 */
const DEFAULT_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'apiKey',
  'hashedKey',
  '*.hashedKey',
];

export function createLogger(config: LoggerConfig = {}): Logger {
  const options: LoggerOptions = {
    level: config.level ?? process.env.LOG_LEVEL ?? 'info',
    base: { service: config.service ?? 'luma-search' },
    redact: {
      paths: [...DEFAULT_REDACT_PATHS, ...(config.redactPaths ?? [])],
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  };
  if (config.pretty ?? process.env.LOG_FORMAT === 'pretty') {
    return pino({ ...options, transport: { target: 'pino-pretty' } });
  }
  return pino(options);
}

export function newCorrelationId(): string {
  return randomUUID();
}

// ─── Metrics ────────────────────────────────────────────────────────────────

let metricsInitialized = false;

export interface Metrics {
  registry: typeof register;
  httpDuration: Histogram<string>;
  httpRequests: Counter<string>;
  searchDuration: Histogram<string>;
  searchQueries: Counter<string>;
  crawlFetches: Counter<string>;
  crawlErrors: Counter<string>;
  indexDocs: Counter<string>;
  embedDuration: Histogram<string>;
  answerDuration: Histogram<string>;
  answerTokens: Counter<string>;
  queueDepth: Gauge<string>;
  queueJobs: Counter<string>;
}

export function initMetrics(): Metrics {
  if (!metricsInitialized) {
    collectDefaultMetrics({ register });
    metricsInitialized = true;
  }

  return {
    registry: register,
    httpDuration: new Histogram({
      name: 'luma_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'] as const,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    httpRequests: new Counter({
      name: 'luma_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'] as const,
    }),
    searchDuration: new Histogram({
      name: 'luma_search_duration_seconds',
      help: 'Search request duration',
      labelNames: ['profile', 'vertical'] as const,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    }),
    searchQueries: new Counter({
      name: 'luma_search_queries_total',
      help: 'Total search queries',
      labelNames: ['profile', 'vertical'] as const,
    }),
    crawlFetches: new Counter({
      name: 'luma_crawl_fetches_total',
      help: 'Total crawl fetch attempts',
      labelNames: ['domain', 'status'] as const,
    }),
    crawlErrors: new Counter({
      name: 'luma_crawl_errors_total',
      help: 'Crawl fetch errors',
      labelNames: ['domain', 'reason'] as const,
    }),
    indexDocs: new Counter({
      name: 'luma_index_docs_total',
      help: 'Documents ingested into the index',
      labelNames: ['vertical'] as const,
    }),
    embedDuration: new Histogram({
      name: 'luma_embed_duration_seconds',
      help: 'Embedding batch duration',
      labelNames: ['provider'] as const,
      buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30],
    }),
    answerDuration: new Histogram({
      name: 'luma_answer_duration_seconds',
      help: 'AI answer generation duration',
      labelNames: ['model'] as const,
      buckets: [0.5, 1, 2.5, 5, 10, 30, 60],
    }),
    answerTokens: new Counter({
      name: 'luma_answer_tokens_total',
      help: 'AI answer tokens consumed',
      labelNames: ['model', 'kind'] as const,
    }),
    queueDepth: new Gauge({
      name: 'luma_queue_depth',
      help: 'Jobs waiting in queue',
      labelNames: ['queue'] as const,
    }),
    queueJobs: new Counter({
      name: 'luma_queue_jobs_total',
      help: 'Queue jobs processed',
      labelNames: ['queue', 'outcome'] as const,
    }),
  };
}

// ─── Health checks ──────────────────────────────────────────────────────────

export interface HealthCheck {
  name: string;
  check: () => Promise<{ status: 'ok' | 'down'; latencyMs?: number; detail?: string }>;
}

export interface HealthReport {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSeconds: number;
  checks: Record<string, { status: 'ok' | 'down'; latencyMs?: number; detail?: string }>;
}

export async function runHealthChecks(checks: HealthCheck[]): Promise<HealthReport> {
  const results: HealthReport['checks'] = {};
  let down = 0;
  await Promise.all(
    checks.map(async (c) => {
      try {
        results[c.name] = await c.check();
      } catch (err) {
        results[c.name] = {
          status: 'down',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
      if (results[c.name]?.status === 'down') down += 1;
    })
  );
  const anyDown = down > 0;
  return {
    status: anyDown ? 'down' : 'ok',
    version: process.env.APP_VERSION ?? '0.1.0',
    uptimeSeconds: Math.floor(process.uptime()),
    checks: results,
  };
}

// ============================================================
// @luma-search/telemetry - Observability Foundation
// ============================================================

import pino, { Logger, LoggerOptions, Level } from 'pino';
import { 
  metrics, 
  Meter, 
  Counter, 
  Histogram, 
  UpDownCounter,
  MetricOptions 
} from '@opentelemetry/api';
import {
  NodeSDK,
  NodeSDKConfiguration,
} from '@opentelemetry/sdk-node';
import {
  Resource,
  ResourceAttributes,
} from '@opentelemetry/resources';
import {
  SemanticResourceAttributes,
} from '@opentelemetry/semantic-conventions';
import { 
  PrometheusExporter 
} from '@opentelemetry/exporter-prometheus';
import { 
  OTLPTraceExporter 
} from '@opentelemetry/exporter-trace-otlp-http';
import { 
  SimpleSpanProcessor,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { 
  PeriodicExportingMetricReader 
} from '@opentelemetry/sdk-metrics';
import { 
  diag, 
  DiagConsoleLogger, 
  DiagLogLevel 
} from '@opentelemetry/api';
import { getConfig } from '@luma-search/config';

// ============================================================
// Logger
// ============================================================

let loggerInstance: Logger | null = null;

export function createLogger(options: LoggerOptions = {}): Logger {
  const config = getConfig();
  
  const baseOptions: LoggerOptions = {
    level: config.LOG_LEVEL,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: {
      service: config.OTEL_SERVICE_NAME,
      environment: config.OTEL_RESOURCE_ATTRIBUTES.split('=')[1] || 'development',
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
        '*.password',
        '*.secret',
        '*.token',
        '*.apiKey',
        '*.api_key',
        '*.authorization',
        '*.creditCard',
        '*.credit_card',
      ],
      censor: '[REDACTED]',
    },
    ...options,
  };
  
  // Pretty print in development
  if (config.NODE_ENV === 'development' && !options.transport) {
    baseOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    };
  }
  
  return pino(baseOptions);
}

export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

export function setLogger(logger: Logger): void {
  loggerInstance = logger;
}

export function childLogger(bindings: Record<string, unknown>): Logger {
  return getLogger().child(bindings);
}

// ============================================================
// Correlation IDs
// ============================================================

export function generateCorrelationId(): string {
  return `corr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// Metrics
// ============================================================

let meterInstance: Meter | null = null;
let prometheusExporter: PrometheusExporter | null = null;

export function getMeter(name = 'lumasearch'): Meter {
  if (!meterInstance) {
    meterInstance = metrics.getMeter(name);
  }
  return meterInstance;
}

export function createCounter(name: string, options: MetricOptions = {}): Counter {
  return getMeter().createCounter(name, options);
}

export function createHistogram(name: string, options: MetricOptions = {}): Histogram {
  return getMeter().createHistogram(name, options);
}

export function createUpDownCounter(name: string, options: MetricOptions = {}): UpDownCounter {
  return getMeter().createUpDownCounter(name, options);
}

// ============================================================
// Standard Metrics
// ============================================================

const meter = getMeter('lumasearch.core');

// HTTP Metrics
export const httpRequestsTotal = createCounter('http_requests_total', {
  description: 'Total number of HTTP requests',
  unit: '1',
});

export const httpRequestDuration = createHistogram('http_request_duration_seconds', {
  description: 'HTTP request duration in seconds',
  unit: 's',
  boundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestSize = createHistogram('http_request_size_bytes', {
  description: 'HTTP request size in bytes',
  unit: 'bytes',
});

export const httpResponseSize = createHistogram('http_response_size_bytes', {
  description: 'HTTP response size in bytes',
  unit: 'bytes',
});

// Search Metrics
export const searchQueriesTotal = createCounter('search_queries_total', {
  description: 'Total number of search queries',
  unit: '1',
});

export const searchLatency = createHistogram('search_latency_seconds', {
  description: 'Search latency in seconds',
  unit: 's',
  boundaries: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
});

export const searchResultsCount = createHistogram('search_results_count', {
  description: 'Number of search results returned',
  unit: '1',
  boundaries: [0, 1, 5, 10, 20, 50, 100, 200, 500, 1000],
});

export const searchNoResults = createCounter('search_no_results_total', {
  description: 'Total number of searches with no results',
  unit: '1',
});

// Crawler Metrics
export const crawlUrlsDiscovered = createCounter('crawl_urls_discovered_total', {
  description: 'Total URLs discovered during crawling',
  unit: '1',
});

export const crawlUrlsFetched = createCounter('crawl_urls_fetched_total', {
  description: 'Total URLs fetched',
  unit: '1',
});

export const crawlFetchDuration = createHistogram('crawl_fetch_duration_seconds', {
  description: 'Crawl fetch duration in seconds',
  unit: 's',
});

export const crawlErrors = createCounter('crawl_errors_total', {
  description: 'Total crawl errors',
  unit: '1',
});

export const crawlQueueDepth = createUpDownCounter('crawl_queue_depth', {
  description: 'Current crawl queue depth',
  unit: '1',
});

// Index Metrics
export const indexDocumentsTotal = createCounter('index_documents_total', {
  description: 'Total documents in index',
  unit: '1',
});

export const indexIngestDuration = createHistogram('index_ingest_duration_seconds', {
  description: 'Index ingestion duration in seconds',
  unit: 's',
});

export const indexSizeBytes = createUpDownCounter('index_size_bytes', {
  description: 'Index size in bytes',
  unit: 'bytes',
});

// Embedding Metrics
export const embeddingRequestsTotal = createCounter('embedding_requests_total', {
  description: 'Total embedding requests',
  unit: '1',
});

export const embeddingLatency = createHistogram('embedding_latency_seconds', {
  description: 'Embedding generation latency in seconds',
  unit: 's',
});

export const embeddingTokens = createHistogram('embedding_tokens', {
  description: 'Number of tokens embedded',
  unit: '1',
});

// LLM/Answer Metrics
export const answerRequestsTotal = createCounter('answer_requests_total', {
  description: 'Total answer generation requests',
  unit: '1',
});

export const answerLatency = createHistogram('answer_latency_seconds', {
  description: 'Answer generation latency in seconds',
  unit: 's',
});

export const answerTokens = createHistogram('answer_tokens', {
  description: 'Tokens used for answer generation',
  unit: '1',
});

export const answerCost = createHistogram('answer_cost_usd', {
  description: 'Cost of answer generation in USD',
  unit: 'USD',
});

export const answerCacheHits = createCounter('answer_cache_hits_total', {
  description: 'Answer cache hits',
  unit: '1',
});

export const answerCacheMisses = createCounter('answer_cache_misses_total', {
  description: 'Answer cache misses',
  unit: '1',
});

// Queue Metrics
export const queueJobsEnqueued = createCounter('queue_jobs_enqueued_total', {
  description: 'Total jobs enqueued',
  unit: '1',
});

export const queueJobsCompleted = createCounter('queue_jobs_completed_total', {
  description: 'Total jobs completed',
  unit: '1',
});

export const queueJobsFailed = createCounter('queue_jobs_failed_total', {
  description: 'Total jobs failed',
  unit: '1',
});

export const queueJobDuration = createHistogram('queue_job_duration_seconds', {
  description: 'Job processing duration in seconds',
  unit: 's',
});

export const queueDepth = createUpDownCounter('queue_depth', {
  description: 'Current queue depth',
  unit: '1',
});

// Error Metrics
export const errorsTotal = createCounter('errors_total', {
  description: 'Total errors',
  unit: '1',
});

// ============================================================
// Metrics Helper Functions
// ============================================================

export function recordHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
  requestSize?: number,
  responseSize?: number
): void {
  const labels = { method, route, status: String(statusCode) };
  httpRequestsTotal.add(1, labels);
  httpRequestDuration.record(durationMs / 1000, labels);
  if (requestSize) httpRequestSize.record(requestSize, labels);
  if (responseSize) httpResponseSize.record(responseSize, labels);
}

export function recordSearch(
  query: string,
  resultCount: number,
  latencyMs: number,
  strategy: string,
  hasResults: boolean
): void {
  const labels = { strategy, hasResults: String(hasResults) };
  searchQueriesTotal.add(1, labels);
  searchLatency.record(latencyMs / 1000, labels);
  searchResultsCount.record(resultCount, labels);
  if (!hasResults) searchNoResults.add(1, labels);
}

export function recordCrawlFetch(
  domain: string,
  status: 'success' | 'error' | 'skipped',
  durationMs: number
): void {
  const labels = { domain, status };
  if (status === 'success') crawlUrlsFetched.add(1, labels);
  crawlFetchDuration.record(durationMs / 1000, labels);
  if (status === 'error') crawlErrors.add(1, labels);
}

export function recordEmbedding(
  provider: string,
  model: string,
  tokenCount: number,
  latencyMs: number,
  success: boolean
): void {
  const labels = { provider, model, success: String(success) };
  embeddingRequestsTotal.add(1, labels);
  embeddingLatency.record(latencyMs / 1000, labels);
  embeddingTokens.record(tokenCount, labels);
}

export function recordAnswer(
  provider: string,
  model: string,
  tokens: { prompt: number; completion: number; total: number },
  costUsd: number,
  latencyMs: number,
  cached: boolean,
  success: boolean
): void {
  const labels = { provider, model, success: String(success), cached: String(cached) };
  answerRequestsTotal.add(1, labels);
  answerLatency.record(latencyMs / 1000, labels);
  answerTokens.record(tokens.total, labels);
  answerCost.record(costUsd, labels);
  if (cached) answerCacheHits.add(1, labels);
  else answerCacheMisses.add(1, labels);
}

export function recordQueueJob(
  queue: string,
  status: 'completed' | 'failed',
  durationMs: number
): void {
  const labels = { queue, status };
  if (status === 'completed') queueJobsCompleted.add(1, labels);
  else queueJobsFailed.add(1, labels);
  queueJobDuration.record(durationMs / 1000, labels);
}

export function recordError(
  type: string,
  operation: string,
  code?: string
): void {
  errorsTotal.add(1, { type, operation, code: code || 'unknown' });
}

// ============================================================
// Tracing Setup
// ============================================================

let sdkInstance: NodeSDK | null = null;

export function initTracing(): NodeSDK | null {
  const config = getConfig();
  
  // Enable internal diagnostics in development
  if (config.NODE_ENV === 'development') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
  }
  
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: config.OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: config.OTEL_RESOURCE_ATTRIBUTES.split('=')[1] || 'development',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || '0.1.0',
  });
  
  // Trace exporter
  const traceExporter = new OTLPTraceExporter({
    url: config.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    headers: {},
  });
  
  // Metric exporter (Prometheus)
  prometheusExporter = new PrometheusExporter({
    port: config.PROMETHEUS_PORT,
    endpoint: '/metrics',
  }, () => {
    getLogger().info({ port: config.PROMETHEUS_PORT }, 'Prometheus metrics server started');
  });
  
  const metricReader = new PeriodicExportingMetricReader({
    exporter: prometheusExporter,
    exportIntervalMillis: 10000,
  });
  
  const sdkConfig: NodeSDKConfiguration = {
    resource,
    traceExporter,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    metricReader,
    instrumentations: [], // Add auto-instrumentations as needed
  };
  
  sdkInstance = new NodeSDK(sdkConfig);
  
  sdkInstance.start();
  
  getLogger().info('OpenTelemetry SDK initialized');
  
  // Graceful shutdown
  process.on('SIGTERM', async () => {
    await shutdown();
  });
  
  return sdkInstance;
}

export async function shutdown(): Promise<void> {
  if (sdkInstance) {
    await sdkInstance.shutdown();
    getLogger().info('OpenTelemetry SDK shut down');
  }
  if (prometheusExporter) {
    await prometheusExporter.shutdown();
  }
}

// ============================================================
// Structured Logging Helpers
// ============================================================

export interface LogContext {
  correlationId?: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  traceId?: string;
  spanId?: string;
  [key: string]: unknown;
}

export function logInfo(message: string, context: LogContext = {}): void {
  getLogger().info(context, message);
}

export function logWarn(message: string, context: LogContext = {}): void {
  getLogger().warn(context, message);
}

export function logError(message: string, error: Error | unknown, context: LogContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  getLogger().error({ ...context, err: { message: err.message, stack: err.stack, name: err.name } }, message);
}

export function logDebug(message: string, context: LogContext = {}): void {
  getLogger().debug(context, message);
}

export function logTrace(message: string, context: LogContext = {}): void {
  getLogger().trace(context, message);
}

// ============================================================
// Performance Timing
// ============================================================

export class Timer {
  private startTime: bigint;
  private label: string;
  private context: LogContext;
  
  constructor(label: string, context: LogContext = {}) {
    this.label = label;
    this.context = context;
    this.startTime = process.hrtime.bigint();
  }
  
  stop(additionalContext: LogContext = {}): number {
    const durationMs = Number(process.hrtime.bigint() - this.startTime) / 1_000_000;
    logDebug(`${this.label} completed`, { 
      ...this.context, 
      ...additionalContext, 
      durationMs 
    });
    return durationMs;
  }
  
  async measure<T>(fn: () => Promise<T>, additionalContext: LogContext = {}): Promise<T> {
    try {
      return await fn();
    } finally {
      this.stop(additionalContext);
    }
  }
}

export function timer(label: string, context: LogContext = {}): Timer {
  return new Timer(label, context);
}

// ============================================================
// Health Checks
// ============================================================

export interface HealthCheck {
  name: string;
  check: () => Promise<{ status: 'pass' | 'warn' | 'fail'; message?: string; latencyMs?: number }>;
}

const healthChecks: HealthCheck[] = [];

export function registerHealthCheck(check: HealthCheck): void {
  healthChecks.push(check);
}

export async function runHealthChecks(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message?: string; latencyMs?: number }>;
}> {
  const results = await Promise.all(
    healthChecks.map(async (check) => {
      const start = Date.now();
      try {
        const result = await check.check();
        return { ...result, latencyMs: Date.now() - start };
      } catch (error) {
        return {
          name: check.name,
          status: 'fail' as const,
          message: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - start,
        };
      }
    })
  );
  
  const hasFail = results.some(r => r.status === 'fail');
  const hasWarn = results.some(r => r.status === 'warn');
  
  return {
    status: hasFail ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy',
    checks: results,
  };
}

// ============================================================
// Express/Fastify Middleware
// ============================================================

export function createRequestLogger() {
  return (req: any, res: any, next: () => void) => {
    const start = process.hrtime.bigint();
    const requestId = generateRequestId();
    const correlationId = req.headers['x-correlation-id'] as string || generateCorrelationId();
    
    req.requestId = requestId;
    req.correlationId = correlationId;
    req.log = childLogger({ requestId, correlationId });
    
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);
    
    req.log.info({ 
      method: req.method, 
      url: req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    }, 'Request started');
    
    const originalSend = res.send;
    res.send = function(body?: any) {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      
      recordHttpRequest(
        req.method,
        req.route?.path || req.url,
        res.statusCode,
        durationMs,
        req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : undefined,
        body ? Buffer.byteLength(body) : undefined
      );
      
      req.log.info({ 
        statusCode: res.statusCode, 
        durationMs 
      }, 'Request completed');
      
      return originalSend.call(this, body);
    };
    
    next();
  };
}

// ============================================================
// Initialize on import
// ============================================================

// Auto-initialize logger
getLogger();

export { pino as rawPino };
/**
 * LumaSearch API Server - Fastify with search, answer, crawl, and health endpoints
 */
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { validateEnv, validateEnvPartial, searchEnvSchema, llmEnvSchema, queueEnvSchema, type SearchEnv, type LLMEnv, type QueueEnv } from '@luma-search/config';
import { createLogger, initMetrics, runHealthChecks, HealthCheck } from '@luma-search/telemetry';
import { createSearchClient, checkSearchHealth, IndexManager, buildHybridBody, buildLexicalBody } from '@luma-search/search-client';
import { createPrismaClient, checkDbHealth } from '@luma-search/storage';
import { createLLMProvider } from '@luma-search/llm';
import { AnswerEngine } from '@luma-search/evidence';
import { interpretQuery, filtersFromOperators } from '@luma-search/query';
import { canonicalizeUrl } from '@luma-search/utils';
import type { SearchResponse, SearchFilters, RankingProfile, LLMProviderKind } from '@luma-search/types';

const log = createLogger({ service: 'api' });
const metrics = initMetrics();

// ─── Environment & clients ──────────────────────────────────────────────────

const env = validateEnv();
const _searchEnv = validateEnvPartial(searchEnvSchema);
const llmEnv = validateEnvPartial(llmEnvSchema);
const _queueEnv = validateEnvPartial(queueEnvSchema);

const es = createSearchClient({
  url: env.ELASTICSEARCH_URL,
  username: env.ELASTICSEARCH_USERNAME,
  password: env.ELASTICSEARCH_PASSWORD,
  verifyCerts: env.ELASTICSEARCH_VERIFY_CERTS,
  requestTimeoutMs: env.ELASTICSEARCH_REQUEST_TIMEOUT,
  maxRetries: env.ELASTICSEARCH_MAX_RETRIES,
});

const indexManager = new IndexManager(es, {
  prefix: env.ES_INDEX_PREFIX,
  embeddingDims: env.EMBEDDING_LOCAL_DIMENSIONS,
  numberOfShards: env.ES_NUMBER_OF_SHARDS,
  numberOfReplicas: env.ES_NUMBER_OF_REPLICAS,
  refreshInterval: env.ES_REFRESH_INTERVAL,
});

const prisma = createPrismaClient();
const llm = createLLMProvider({
  provider: llmEnv.LLM_PROVIDER as LLMProviderKind,
  openai: { apiKey: llmEnv.OPENAI_API_KEY, model: llmEnv.OPENAI_CHAT_MODEL, maxTokens: llmEnv.OPENAI_MAX_TOKENS, temperature: llmEnv.OPENAI_TEMPERATURE },
  anthropic: { apiKey: llmEnv.ANTHROPIC_API_KEY, model: llmEnv.ANTHROPIC_CHAT_MODEL, maxTokens: llmEnv.ANTHROPIC_MAX_TOKENS, temperature: llmEnv.ANTHROPIC_TEMPERATURE },
  ollama: { url: llmEnv.OLLAMA_URL, model: llmEnv.OLLAMA_CHAT_MODEL },
});

const answerEngine = new AnswerEngine(es as any, llm, {
  maxEvidencePassages: llmEnv.ANSWER_MAX_EVIDENCE_PASSAGES,
  maxEvidenceTokens: llmEnv.ANSWER_MAX_EVIDENCE_TOKENS,
  tokenBudget: llmEnv.ANSWER_TOKEN_BUDGET,
  timeoutMs: llmEnv.ANSWER_TIMEOUT_MS,
  promptInjectionDefense: llmEnv.ANSWER_PROMPT_INJECTION_DEFENSE,
});

// ─── Server setup ───────────────────────────────────────────────────────────

async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: log,
    bodyLimit: 1024 * 1024, // 1MB
  });

  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
      },
    },
  });

  await server.register(cors, {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  await server.register(rateLimit, {
    max: _queueEnv.QUEUE_RATE_LIMIT_MAX,
    timeWindow: _queueEnv.QUEUE_RATE_LIMIT_WINDOW,
    keyGenerator: (req) => req.ip,
  });

  // ─── Health checks ────────────────────────────────────────────────────────

  const healthChecks: HealthCheck[] = [
    { name: 'database', check: () => checkDbHealth(prisma) },
    { name: 'elasticsearch', check: () => checkSearchHealth(es) },
    { name: 'memory', check: () => Promise.resolve({ status: process.memoryUsage().heapUsed < 1.5e9 ? 'ok' : 'down', latencyMs: 0, detail: `${Math.round(process.memoryUsage().heapUsed / 1e6)}MB` }) },
  ];

  server.get('/health/live', async () => ({ status: 'ok' }));
  server.get('/health/ready', async () => runHealthChecks(healthChecks));

  // ─── Metrics ──────────────────────────────────────────────────────────────

  server.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  // ─── Search endpoint ──────────────────────────────────────────────────────

  server.post<{
    Body: {
      q: string;
      profile?: RankingProfile;
      filters?: SearchFilters;
      limit?: number;
      offset?: number;
      debug?: boolean;
    };
  }>('/api/v1/search', async (req, reply) => {
    const started = Date.now();
    const { q, profile = 'hybrid', filters = {}, limit = _searchEnv.SEARCH_DEFAULT_LIMIT, offset = 0, debug } = req.body;

    if (!q || q.trim().length === 0) {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    const interpretation = interpretQuery(q);
    const searchFilters = filtersFromOperators(interpretation.operators, filters);
    const queryVector = undefined; // TODO: add embedding when provider configured

    const operators = interpretation.operators;
    const body = queryVector
      ? buildHybridBody(interpretation.normalized, operators, {
          profile,
          filters: searchFilters,
          limit: Math.min(limit, _searchEnv.SEARCH_MAX_LIMIT),
          offset,
          queryVector,
        })
      : buildLexicalBody(interpretation.normalized, operators, {
          profile,
          filters: searchFilters,
          limit: Math.min(limit, _searchEnv.SEARCH_MAX_LIMIT),
          offset,
        });

    const res = await es.search({
      index: 'luma_web',
      ...(body as any),
    });

    const hits = (res.hits?.hits ?? []) as Array<{
      _id?: string;
      _source?: Record<string, unknown>;
      _score?: number;
      highlight?: Record<string, string[]>;
    }>;

    const results = hits.map((hit) => {
      const src = hit._source ?? {};
      return {
        id: String(src.id ?? hit._id ?? ''),
        url: String(src.url ?? ''),
        canonicalUrl: src.canonicalUrl ? String(src.canonicalUrl) : undefined,
        title: String(src.title ?? ''),
        snippet: (src as any).content ? extractSnippet(String(src.content), q) : '',
        domain: String(src.domain ?? ''),
        vertical: 'web' as const,
        language: src.language ? String(src.language) : undefined,
        publishedAt: src.publishedAt ? String(src.publishedAt) : undefined,
        crawledAt: src.crawledAt ? String(src.crawledAt) : new Date().toISOString(),
        score: hit._score ?? 0,
        highlights: hit.highlight ? Object.entries(hit.highlight).map(([field, fragments]) => ({ field, fragments })) : undefined,
        source: 'local-index' as const,
      };
    });

    const response: SearchResponse = {
      query: q,
      interpretation,
      results,
      total: typeof res.hits?.total === 'object' && res.hits?.total?.value ? res.hits.total.value : (typeof res.hits?.total === 'number' ? res.hits.total : hits.length),
      took: Date.now() - started,
      profile,
    };

    if (debug) {
      (response as any).debug = { body, raw: res };
    }

    metrics.searchQueries.inc({ profile, vertical: 'web' }, 1);
    metrics.searchDuration.observe({ profile, vertical: 'web' }, (Date.now() - started) / 1000);

    return reply.send(response);
  });

  // ─── Answer endpoint ──────────────────────────────────────────────────────

  server.post<{
    Body: {
      q: string;
      profile?: RankingProfile;
      filters?: SearchFilters;
      mode?: 'answer' | 'research';
    };
  }>('/api/v1/answer', async (req, reply) => {
    if (llmEnv.LLM_PROVIDER === 'disabled') {
      return reply.code(503).send({ error: 'AI answer generation is disabled. Set LLM_PROVIDER to enable.' });
    }

    const { q, profile = 'research', filters = {}, mode = 'answer' } = req.body;

    if (!q || q.trim().length === 0) {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    try {
      const answer = await answerEngine.generateAnswer(q, { filters, profile, mode });
      return reply.send(answer);
    } catch (err) {
      log.error({ err }, 'Answer generation failed');
      return reply.code(500).send({ error: 'Answer generation failed' });
    }
  });

  // ─── Index status ─────────────────────────────────────────────────────────

  server.get('/api/v1/index/status', async () => {
    const verticals = ['web', 'code', 'docs'] as const;
    const status: Record<string, any> = {};
    for (const v of verticals) {
      const stats = await indexManager.indexStats(v);
      const active = await indexManager.getActiveIndex(v);
      status[v] = { activeIndex: active, ...stats };
    }
    return status;
  });

  // ─── Crawl job submission ─────────────────────────────────────────────────

  server.post<{
    Body: {
      seeds: string[];
      maxPages?: number;
      maxDepth?: number;
      name?: string;
    };
  }>('/api/v1/crawl/jobs', async (req, reply) => {
    const { seeds, maxPages = 1000, maxDepth = 3, name } = req.body;

    if (!seeds || !seeds.length) {
      return reply.code(400).send({ error: 'At least one seed URL is required' });
    }

    const validSeeds = seeds.map((s) => canonicalizeUrl(s)).filter(Boolean) as string[];
    if (!validSeeds.length) {
      return reply.code(400).send({ error: 'No valid seed URLs' });
    }

    const job = await prisma.crawlJob.create({
      data: {
        name,
        seeds: validSeeds,
        maxPages,
        maxDepth,
        includePatterns: [],
        excludePatterns: [],
        respectRobots: true,
        status: 'pending',
      },
    });

    // In production, this would enqueue to a queue; for now, return job ID
    return reply.code(201).send({ jobId: job.id, status: 'pending' });
  });

  server.get('/api/v1/crawl/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await prisma.crawlJob.findUnique({ where: { id } });
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    return job;
  });

  return server;
}

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  const server = await buildServer();
  const port = parseInt(process.env.API_PORT ?? '4000', 10);

  try {
    await server.listen({ port, host: '0.0.0.0' });
    log.info({ port }, 'API server started');
  } catch (err) {
    log.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main();

// Utility: extract snippet from text
function extractSnippet(text: string, query: string, maxLength = 160): string {
  if (!query) return text.slice(0, maxLength) + (text.length > maxLength ? '…' : '');
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const lower = text.toLowerCase();
  let bestPos = -1, bestScore = 0;
  const step = Math.max(1, Math.floor((text.length - maxLength) / 20) || 1);
  for (let pos = 0; pos < Math.max(1, text.length - maxLength); pos += step) {
    const window = lower.slice(pos, pos + maxLength);
    const score = terms.reduce((acc, t) => acc + (window.includes(t) ? 1 : 0), 0);
    if (score > bestScore) { bestScore = score; bestPos = pos; }
  }
  if (bestPos <= 0 && bestScore === 0) return text.slice(0, maxLength) + (text.length > maxLength ? '…' : '');
  const start = Math.max(0, bestPos - 20);
  return (start > 0 ? '…' : '') + text.slice(start, start + maxLength + 20);
}
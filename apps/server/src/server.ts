/**
 * LumaSearch — Self-contained server.
 *
 * Single Node.js process running: Fastify API, SQLite FTS5 search engine,
 * local job queue with in-process workers (crawler, indexer, embedder).
 * No Docker, no Redis, no Elasticsearch, no external services required.
 *
 * Start:  pnpm dev   (development, hot-reload)
 *         pnpm build && pnpm start   (production)
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEnv } from '@luma-search/config';
import { createLogger, initMetrics, runHealthChecks, HealthCheck } from '@luma-search/telemetry';
import { SearchEngine } from '@luma-search/search-engine';
import { getPrismaClient, checkDbHealth } from '@luma-search/storage';
import { LocalQueue, QUEUE_NAMES } from '@luma-search/queue';
import { interpretQuery, filtersFromOperators } from '@luma-search/query';
import { createLLMProvider } from '@luma-search/llm';
import { AnswerEngine } from '@luma-search/evidence';
import { createFetcher, parseHtml } from '@luma-search/crawler-core';
import { canonicalizeUrl, contentHash, simhash, documentIdFromUrl } from '@luma-search/utils';
import type { SearchResponse, SearchFilters, RankingProfile } from '@luma-search/types';
import { RANKING_PROFILES } from '@luma-search/search-engine';

const log = createLogger({ service: 'server' });
const metrics = initMetrics();

// ─── Environment ────────────────────────────────────────────────────────────

// Ensure DATABASE_URL is set before Prisma client initializes
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/luma.db';
}

const env = validateEnv();
const DATA_DIR = resolve(process.env.LUMA_DATA_DIR ?? './data');
const FTS_DB_PATH = resolve(DATA_DIR, 'search.db');

mkdirSync(DATA_DIR, { recursive: true });

// ─── Clients ────────────────────────────────────────────────────────────────

const prisma = getPrismaClient();
const searchEngine = new SearchEngine({ dbPath: FTS_DB_PATH });
const queue = new LocalQueue(prisma, { concurrency: 5, pollIntervalMs: 500 });

const llm = createLLMProvider({
  provider: (env.LLM_PROVIDER ?? 'disabled') as 'openai' | 'anthropic' | 'ollama' | 'disabled',
  openai: env.OPENAI_API_KEY
    ? {
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_CHAT_MODEL,
        maxTokens: env.OPENAI_MAX_TOKENS,
        temperature: env.OPENAI_TEMPERATURE,
      }
    : undefined,
  anthropic: env.ANTHROPIC_API_KEY
    ? {
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_CHAT_MODEL,
        maxTokens: env.ANTHROPIC_MAX_TOKENS,
        temperature: env.ANTHROPIC_TEMPERATURE,
      }
    : undefined,
  ollama: { url: env.OLLAMA_URL, model: env.OLLAMA_CHAT_MODEL },
});

const answerEngine = new AnswerEngine(null as never, llm, {
  maxEvidencePassages: env.ANSWER_MAX_EVIDENCE_PASSAGES,
  maxEvidenceTokens: env.ANSWER_MAX_EVIDENCE_TOKENS,
  tokenBudget: env.ANSWER_TOKEN_BUDGET,
  timeoutMs: env.ANSWER_TIMEOUT_MS,
  promptInjectionDefense: env.ANSWER_PROMPT_INJECTION_DEFENSE,
});

const fetcher = createFetcher({
  userAgent: env.CRAWLER_USER_AGENT,
  respectRobots: env.CRAWLER_RESPECT_ROBOTS_TXT,
  blockPrivateIps: env.CRAWLER_BLOCK_PRIVATE_IPS,
  politenessDelayMs: env.CRAWLER_CRAWL_DELAY_MS,
  timeoutMs: env.CRAWLER_REQUEST_TIMEOUT,
  maxContentSize: env.CRAWLER_MAX_CONTENT_SIZE,
});

// ─── Queue handlers (in-process workers) ────────────────────────────────────

interface CrawlPagePayload {
  jobId?: string;
  url: string;
  finalUrl: string;
  html: string;
  depth: number;
  maxDepth: number;
  includePatterns?: string[];
  excludePatterns?: string[];
}

async function handleCrawlPage(data: CrawlPagePayload) {
  const parsed = parseHtml(data.html, data.finalUrl);

  if (parsed.meta.noindex) {
    log.info({ url: data.finalUrl }, 'Skipping noindex page');
    return;
  }

  const hash = contentHash(data.html);
  const docId = await documentIdFromUrl(data.finalUrl);

  // Check for near-duplicate via simhash
  const shash = simhash(parsed.text);

  await prisma.document.upsert({
    where: { url: data.finalUrl },
    create: {
      id: docId,
      url: data.finalUrl,
      canonicalUrl: parsed.meta.canonical ?? data.finalUrl,
      title: parsed.title || data.finalUrl,
      domain: new URL(data.finalUrl).hostname,
      language: parsed.meta.language,
      vertical: 'web',
      status: 'indexed',
      contentHash: hash,
      simhash: shash,
      wordCount: parsed.wordCount,
      publishedAt: parsed.meta.publishedAt ? new Date(parsed.meta.publishedAt) : null,
      modifiedAt: parsed.meta.modifiedAt ? new Date(parsed.meta.modifiedAt) : null,
      metadata: JSON.stringify({
        headings: parsed.headings,
        anchors: parsed.links
          .map((l) => l.anchor)
          .filter(Boolean)
          .slice(0, 50),
        author: parsed.meta.author,
        organization: parsed.meta.organization,
        faq: parsed.meta.faq,
      }),
    },
    update: {
      title: parsed.title || data.finalUrl,
      status: 'indexed',
      contentHash: hash,
      simhash: shash,
      wordCount: parsed.wordCount,
      indexedAt: new Date(),
    },
  });

  // Index into FTS5
  searchEngine.indexDocument({
    id: docId,
    url: data.finalUrl,
    canonicalUrl: parsed.meta.canonical ?? data.finalUrl,
    title: parsed.title || data.finalUrl,
    content: parsed.text,
    headings: parsed.headings,
    anchorText: parsed.links.map((l) => l.anchor).filter(Boolean),
    domain: new URL(data.finalUrl).hostname,
    language: parsed.meta.language,
    vertical: 'web',
    publishedAt: parsed.meta.publishedAt,
    crawledAt: new Date().toISOString(),
    wordCount: parsed.wordCount,
  });

  // Enqueue outlinks for further crawling
  if (data.depth < data.maxDepth) {
    for (const link of parsed.links) {
      const canonical = canonicalizeUrl(link.url);
      if (!canonical || canonical === data.finalUrl) continue;
      if (data.excludePatterns?.some((p) => new RegExp(p).test(canonical))) continue;
      if (
        data.includePatterns?.length &&
        !data.includePatterns.some((p) => new RegExp(p).test(canonical))
      )
        continue;
      await queue.add(
        QUEUE_NAMES.crawlFetch,
        {
          url: canonical,
          depth: data.depth + 1,
          maxDepth: data.maxDepth,
          jobId: data.jobId,
          includePatterns: data.includePatterns,
          excludePatterns: data.excludePatterns,
        },
        { priority: -data.depth }
      ); // shallower = higher priority
    }
  }

  metrics.indexDocs.inc({ vertical: 'web' }, 1);
  log.info({ url: data.finalUrl, words: parsed.wordCount }, 'Document indexed');
}

async function handleCrawlFetch(data: {
  url: string;
  depth: number;
  maxDepth: number;
  jobId?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}) {
  // Dedup: skip if already indexed
  if (searchEngine.isIndexed(data.url)) {
    log.debug({ url: data.url }, 'Already indexed, skipping');
    return;
  }

  const res = await fetcher.fetch(data.url);
  if (!res.ok || !res.body) {
    log.warn({ url: data.url, error: res.error }, 'Fetch failed');
    if (data.jobId) {
      await prisma.crawlTask.updateMany({
        where: { jobId: data.jobId, url: data.url },
        data: { status: 'failed', error: res.error, attempts: { increment: 1 } },
      });
    }
    return;
  }

  if (data.jobId) {
    await prisma.crawlTask.updateMany({
      where: { jobId: data.jobId, url: data.url },
      data: {
        status: 'done',
        finalUrl: res.finalUrl,
        statusCode: res.statusCode,
        contentType: res.contentType,
        latencyMs: res.latencyMs,
        completedAt: new Date(),
      },
    });
  }

  await queue.add(QUEUE_NAMES.crawlParse, {
    jobId: data.jobId,
    url: data.url,
    finalUrl: res.finalUrl,
    html: res.body,
    depth: data.depth,
    maxDepth: data.maxDepth,
    includePatterns: data.includePatterns,
    excludePatterns: data.excludePatterns,
  });
}

// ─── HTTP server ────────────────────────────────────────────────────────────

async function buildServer() {
  const server = Fastify({ logger: log, bodyLimit: 1024 * 1024 });

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
    max: 100,
    timeWindow: 60_000,
    keyGenerator: (req) => req.ip,
  });

  // ─── Health ────────────────────────────────────────────────────────────────

  const healthChecks: HealthCheck[] = [
    { name: 'database', check: () => checkDbHealth(prisma) },
    {
      name: 'search-engine',
      check: async () => {
        const count = searchEngine.totalDocuments();
        return { status: 'ok', detail: `${count} documents indexed` };
      },
    },
    {
      name: 'memory',
      check: async () => ({
        status: process.memoryUsage().heapUsed < 1.5e9 ? 'ok' : 'down',
        detail: `${Math.round(process.memoryUsage().heapUsed / 1e6)}MB`,
      }),
    },
  ];

  server.get('/health/live', async () => ({ status: 'ok' }));
  server.get('/health/ready', async () => runHealthChecks(healthChecks));
  server.get('/metrics', async (_, reply) => {
    reply.header('Content-Type', metrics.registry.contentType);
    return metrics.registry.metrics();
  });

  // ─── Search ────────────────────────────────────────────────────────────────

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
    const { q, profile = 'hybrid', filters = {}, limit = 10, offset = 0, debug } = req.body;
    if (!q?.trim()) return reply.code(400).send({ error: 'Query parameter "q" is required' });

    const interpretation = interpretQuery(q);
    const searchFilters = filtersFromOperators(interpretation.operators, filters);
    const profileConfig = RANKING_PROFILES[profile] ?? RANKING_PROFILES['hybrid']!;

    const response: SearchResponse = {
      query: q,
      interpretation,
      results: [],
      total: 0,
      took: 0,
      profile,
    };

    const engineResult = searchEngine.search({
      query: interpretation.normalized || q,
      filters: {
        domains: searchFilters.domains,
        excludeDomains: searchFilters.excludeDomains,
        languages: searchFilters.languages,
        verticals: searchFilters.vertical,
        dateFrom: searchFilters.dateFrom,
        dateTo: searchFilters.dateTo,
      },
      limit: Math.min(limit, 100),
      offset,
      freshnessBoost: profileConfig.freshnessBoost,
      authorityDomains: profileConfig.authorityBoostDomains,
    });

    (response as any).results = engineResult.results.map((r) => ({
      id: r.id,
      url: r.url,
      canonicalUrl: r.canonicalUrl,
      title: r.title,
      snippet: r.snippet,
      domain: r.domain,
      vertical: r.vertical,
      language: r.language,
      publishedAt: r.publishedAt,
      crawledAt: r.crawledAt,
      score: r.score,
      highlights: r.highlights,
      source: 'local-index' as const,
    }));
    response.total = engineResult.total;
    response.took = Date.now() - started;
    (response as any).facets = engineResult.facets;

    if (debug) (response as any).debug = { engine: 'sqlite-fts5', profileConfig };

    metrics.searchQueries.inc({ profile, vertical: 'web' }, 1);
    metrics.searchDuration.observe({ profile, vertical: 'web' }, (Date.now() - started) / 1000);

    return reply.send(response);
  });

  // ─── Answer (AI) ──────────────────────────────────────────────────────────

  server.post<{ Body: { q: string; profile?: RankingProfile; filters?: SearchFilters } }>(
    '/api/v1/answer',
    async (req, reply) => {
      if (env.LLM_PROVIDER === 'disabled') {
        return reply
          .code(503)
          .send({ error: 'AI answer generation is disabled. Set LLM_PROVIDER to enable.' });
      }
      const { q, profile = 'research', filters = {} } = req.body;
      if (!q?.trim()) return reply.code(400).send({ error: 'Query parameter "q" is required' });

      try {
        const answer = await answerEngine.generateAnswer(q, { filters, profile });
        return reply.send(answer);
      } catch (err) {
        log.error({ err }, 'Answer generation failed');
        return reply.code(500).send({ error: 'Answer generation failed' });
      }
    }
  );

  // ─── Crawl jobs ────────────────────────────────────────────────────────────

  server.post<{ Body: { seeds: string[]; maxPages?: number; maxDepth?: number; name?: string } }>(
    '/api/v1/crawl/jobs',
    async (req, reply) => {
      const { seeds, maxPages = 1000, maxDepth = 3, name } = req.body;
      if (!seeds?.length)
        return reply.code(400).send({ error: 'At least one seed URL is required' });

      const validSeeds = seeds.map((s) => canonicalizeUrl(s)).filter(Boolean) as string[];
      if (!validSeeds.length) return reply.code(400).send({ error: 'No valid seed URLs' });

      const job = await prisma.crawlJob.create({
        data: {
          name,
          seeds: JSON.stringify(validSeeds),
          maxPages,
          maxDepth,
          status: 'pending',
        },
      });

      // Enqueue seed URLs for crawling
      for (const seed of validSeeds.slice(0, maxPages)) {
        await prisma.crawlTask.create({
          data: { jobId: job.id, url: seed, depth: 0, status: 'pending' },
        });
        await queue.add(QUEUE_NAMES.crawlFetch, {
          url: seed,
          depth: 0,
          maxDepth,
          jobId: job.id,
        });
      }

      await prisma.crawlJob.update({
        where: { id: job.id },
        data: { status: 'running', startedAt: new Date() },
      });
      return reply.code(201).send({ jobId: job.id, status: 'running', seeds: validSeeds });
    }
  );

  server.get('/api/v1/crawl/jobs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const job = await prisma.crawlJob.findUnique({
      where: { id },
      include: { tasks: { select: { url: true, status: true, statusCode: true, error: true } } },
    });
    if (!job) return reply.code(404).send({ error: 'Job not found' });
    const tasks = job.tasks as unknown[];
    return {
      ...job,
      seeds: JSON.parse(job.seeds) as string[],
      includePatterns: JSON.parse(job.includePatterns) as string[],
      excludePatterns: JSON.parse(job.excludePatterns) as string[],
      taskCount: tasks.length,
    };
  });

  server.get('/api/v1/crawl/jobs', async () => {
    const jobs = await prisma.crawlJob.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    return jobs.map((j) => ({ ...j, seeds: JSON.parse(j.seeds) as string[] }));
  });

  // ─── Index status ─────────────────────────────────────────────────────────

  server.get('/api/v1/index/status', async () => {
    return {
      engine: 'sqlite-fts5',
      documents: searchEngine.totalDocuments(),
      dbPath: FTS_DB_PATH,
    };
  });

  // ─── Queue stats ──────────────────────────────────────────────────────────

  server.get('/api/v1/queue/stats', async () => queue.depths());

  // ─── More like this ───────────────────────────────────────────────────────

  server.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    '/api/v1/documents/:id/similar',
    async (req) => {
      const { id } = req.params;
      const limit = parseInt(req.query.limit ?? '5', 10);
      const results = searchEngine.moreLikeThis(id, Math.min(limit, 20));
      return results.map((r) => ({
        id: r.id,
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        domain: r.domain,
        score: r.score,
      }));
    }
  );

  return server;
}

// ─── Start ──────────────────────────────────────────────────────────────────

async function main() {
  // Register queue handlers (in-process workers)
  queue.process<{ [key: string]: unknown }>(QUEUE_NAMES.crawlFetch, async (data) =>
    handleCrawlFetch(data as never)
  );
  queue.process<{ [key: string]: unknown }>(QUEUE_NAMES.crawlParse, async (data) =>
    handleCrawlPage(data as never)
  );

  queue.start();

  const server = await buildServer();
  const port = parseInt(process.env.API_PORT ?? '4000', 10);

  try {
    await server.listen({ port, host: '0.0.0.0' });
    log.info(
      { port, dataDir: DATA_DIR, searchDb: FTS_DB_PATH },
      'LumaSearch server started (fully self-contained)'
    );
    log.info(`  Search UI:  http://localhost:3000`);
    log.info(`  API:        http://localhost:${port}/api/v1/search`);
    log.info(`  Health:     http://localhost:${port}/health/ready`);
  } catch (err) {
    log.error({ err }, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    await queue.stop();
    await prisma.$disconnect();
    searchEngine.close();
    await server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  log.error({ err }, 'Fatal startup error');
  process.exit(1);
});

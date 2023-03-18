/**
 * LumaSearch Background Worker
 * Runs BullMQ workers for: crawl:fetch, crawl:parse, index:ingest, embed:generate, answer:generate
 */
import { createLogger, initMetrics } from '@luma-search/telemetry';
import { validateEnv } from '@luma-search/config';
import { createConnection, createWorker, QUEUE_NAMES, type CrawlFetchJobData, type IngestJobData, type EmbedJobData, type AnswerJobData } from '@luma-search/queue';
import { createFetcher, parseHtml } from '@luma-search/crawler-core';
import { createSearchClient, IndexManager } from '@luma-search/search-client';
import { createEmbeddingProvider } from '@luma-search/embeddings';
import { createLLMProvider } from '@luma-search/llm';
import { AnswerEngine } from '@luma-search/evidence';
import { getPrismaClient } from '@luma-search/storage';

const log = createLogger({ service: 'worker' });
const metrics = initMetrics();

const env = validateEnv();

// ─── Shared clients ──────────────────────────────────────────────────────────

const redis = createConnection(env.REDIS_URL);
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

const prisma = getPrismaClient();

const fetcher = createFetcher({
  userAgent: env.CRAWLER_USER_AGENT,
  respectRobots: env.CRAWLER_RESPECT_ROBOTS_TXT,
  blockPrivateIps: env.CRAWLER_BLOCK_PRIVATE_IPS,
  politenessDelayMs: env.CRAWLER_CRAWL_DELAY_MS,
  timeoutMs: env.CRAWLER_REQUEST_TIMEOUT,
  maxContentSize: env.CRAWLER_MAX_CONTENT_SIZE,
});

const embeddingProvider = createEmbeddingProvider({
  provider: env.EMBEDDING_PROVIDER as 'local' | 'openai' | 'cohere' | 'voyage',
  local: {
    url: env.EMBEDDING_LOCAL_URL,
    model: env.EMBEDDING_LOCAL_MODEL,
    dimensions: env.EMBEDDING_LOCAL_DIMENSIONS,
    batchSize: env.EMBEDDING_LOCAL_BATCH_SIZE,
  },
  openai: env.OPENAI_API_KEY ? {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_EMBEDDING_MODEL,
    dimensions: env.OPENAI_EMBEDDING_DIMENSIONS,
    batchSize: env.OPENAI_EMBEDDING_BATCH_SIZE,
  } : undefined,
});

const llm = createLLMProvider({
  provider: env.LLM_PROVIDER as 'openai' | 'anthropic' | 'ollama' | 'disabled',
  openai: env.OPENAI_API_KEY ? {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_CHAT_MODEL,
    maxTokens: env.OPENAI_MAX_TOKENS,
    temperature: env.OPENAI_TEMPERATURE,
  } : undefined,
  anthropic: env.ANTHROPIC_API_KEY ? {
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_CHAT_MODEL,
    maxTokens: env.ANTHROPIC_MAX_TOKENS,
    temperature: env.ANTHROPIC_TEMPERATURE,
  } : undefined,
  ollama: {
    url: env.OLLAMA_URL,
    model: env.OLLAMA_CHAT_MODEL,
  },
});

const answerEngine = new AnswerEngine(es as any, llm, {
  maxEvidencePassages: env.ANSWER_MAX_EVIDENCE_PASSAGES,
  maxEvidenceTokens: env.ANSWER_MAX_EVIDENCE_TOKENS,
  tokenBudget: env.ANSWER_TOKEN_BUDGET,
  timeoutMs: env.ANSWER_TIMEOUT_MS,
  promptInjectionDefense: env.ANSWER_PROMPT_INJECTION_DEFENSE,
});

// ─── Worker processors ───────────────────────────────────────────────────────

async function processCrawlFetch(job: { data: CrawlFetchJobData }) {
  const { jobId, url, depth, maxDepth: _maxDepth, maxPages: _maxPages, includePatterns: _includePatterns, excludePatterns: _excludePatterns, respectRobots: _respectRobots } = job.data;
  log.info({ jobId, url, depth }, 'Processing crawl fetch');

  try {
    const res = await fetcher.fetch(url);
    if (!res.ok) {
      await prisma.crawlTask.updateMany({
        where: { jobId, url },
        data: { status: 'failed', error: res.error, attempts: { increment: 1 } },
      });
      return { success: false, error: res.error };
    }

    await prisma.crawlTask.update({
      where: { jobId_url: { jobId, url } },
      data: {
        status: 'done',
        finalUrl: res.finalUrl,
        statusCode: res.statusCode,
        contentType: res.contentType,
        contentLength: res.contentLength,
        latencyMs: res.latencyMs,
        etag: res.etag,
        lastModified: res.lastModified,
        redirectChain: res.redirectChain,
        completedAt: new Date(),
      },
    });

    if (res.body) {
      // Queue parse job
      await fetch(`${env.API_URL}/api/v1/crawl/jobs/${jobId}/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          url,
          finalUrl: res.finalUrl,
          html: res.body,
          contentType: res.contentType,
          depth,
          maxDepth: 3,
          maxPages: 1000,
          includePatterns: [],
          excludePatterns: [],
          respectRobots: true,
        }),
      });
    }

    metrics.crawlFetches.inc({ domain: new URL(url).hostname, status: 'success' }, 1);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ err, jobId, url }, 'Crawl fetch failed');
    metrics.crawlFetches.inc({ domain: new URL(url).hostname, status: 'error' }, 1);
    await prisma.crawlTask.updateMany({
      where: { jobId, url },
      data: { status: 'failed', error, attempts: { increment: 1 } },
    });
    throw err;
  }
}

async function processCrawlParse(job: { data: IngestJobData & { depth: number; maxDepth: number; maxPages: number; includePatterns?: string[]; excludePatterns?: string[]; respectRobots: boolean } }) {
  const { jobId, url, finalUrl: finalUrlFromJob, html, contentType: _contentType, depth, maxDepth: _maxDepth, maxPages: _maxPages, includePatterns: _includePatterns, excludePatterns: _excludePatterns, respectRobots: _respectRobots } = job.data;
  const finalUrl = finalUrlFromJob ?? url;
  log.info({ jobId, url, depth }, 'Processing crawl parse');

  try {
    const parsed = parseHtml(html, finalUrl);

    if (parsed.meta.noindex) {
      log.info({ jobId, url }, 'Page has noindex, skipping');
      await prisma.crawlTask.updateMany({
        where: { jobId, url },
        data: { status: 'skipped', error: 'noindex' },
      });
      return { success: true, skipped: true };
    }

    if (parsed.isBoilerplateHeavy) {
      log.info({ jobId, url }, 'Page is boilerplate-heavy, marking as thin');
    }

    // Create document
    const { createHash } = await import('node:crypto');
    const contentHash = createHash('sha256').update(html).digest('hex');
    // Simhash is computed but not currently stored; keeping for future dedup
    const { simhash } = await import('@luma-search/utils');
    simhash(parsed.text);

    const doc = await prisma.document.upsert({
      where: { url: finalUrl },
      create: {
        url: finalUrl,
        canonicalUrl: parsed.meta.canonical || finalUrl,
        title: parsed.title,
        domain: new URL(finalUrl).hostname,
        language: parsed.meta.language,
        vertical: 'web',
        status: 'pending',
        contentHash,
        simhash: undefined,
        wordCount: parsed.wordCount,
        publishedAt: parsed.meta.publishedAt ? new Date(parsed.meta.publishedAt) : null,
        modifiedAt: parsed.meta.modifiedAt ? new Date(parsed.meta.modifiedAt) : null,
        crawledAt: new Date(),
        metadata: {
          headings: parsed.headings,
          anchorText: parsed.links.map(l => l.anchor).filter(Boolean),
          author: parsed.meta.author,
          organization: parsed.meta.organization,
          ogType: parsed.meta.ogType,
          faq: parsed.meta.faq,
          breadcrumb: parsed.meta.breadcrumb,
        },
      },
      update: {
        title: parsed.title,
        contentHash,
        simhash: undefined,
        wordCount: parsed.wordCount,
        publishedAt: parsed.meta.publishedAt ? new Date(parsed.meta.publishedAt) : null,
        modifiedAt: parsed.meta.modifiedAt ? new Date(parsed.meta.modifiedAt) : null,
        crawledAt: new Date(),
        status: 'pending',
      },
    });

    // Chunk text for embedding
    const { chunkText } = await import('@luma-search/utils');
    const chunks = chunkText(parsed.text, { maxTokens: 220, overlapTokens: 40 });

    await prisma.documentChunk.createMany({
      data: chunks.map((text: string, idx: number) => ({
        documentId: doc.id,
        idx,
        text,
        heading: parsed.headings[idx] || undefined,
        tokenCount: Math.ceil(text.length / 4),
        embedded: false,
      })),
    });

    // Queue ingest job
    await fetch(`${env.API_URL}/api/v1/index/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: doc.id }),
    });

    return { success: true, documentId: doc.id };
  } catch (err) {
    log.error({ err, jobId, url }, 'Crawl parse failed');
    throw err;
  }
}

async function processIndexIngest(job: { data: { documentId: string } }) {
  const { documentId } = job.data;
  log.info({ documentId }, 'Processing index ingest');

  try {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      include: { chunks: true },
    });

    if (!doc) throw new Error('Document not found');

    const chunks = doc.chunks.map(c => ({
      id: c.id,
      documentId: c.documentId,
      index: c.idx,
      text: c.text,
      heading: c.heading || undefined,
    }));

    await indexManager.bulkIngest('web', [{
      id: doc.id,
      doc: {
        id: doc.id,
        url: doc.url,
        canonicalUrl: doc.canonicalUrl,
        title: doc.title,
        content: chunks.map(c => c.text).join('\n\n'),
        headings: doc.metadata?.headings as string[] || [],
        anchorText: doc.metadata?.anchorText as string[] || [],
        domain: doc.domain,
        language: doc.language,
        vertical: doc.vertical,
        publishedAt: doc.publishedAt?.toISOString(),
        crawledAt: doc.crawledAt.toISOString(),
        contentHash: doc.contentHash,
        simhash: doc.simhash || undefined,
        status: doc.status,
        metadata: doc.metadata,
        wordCount: doc.wordCount,
      }
    }]);

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'indexed', indexedAt: new Date() },
    });

    await prisma.documentChunk.updateMany({
      where: { documentId },
      data: { embedded: false },
    });

    metrics.indexDocs.inc({ vertical: 'web' }, 1);
    return { success: true };
  } catch (err) {
    log.error({ err, documentId }, 'Index ingest failed');
    throw err;
  }
}

async function processEmbedGenerate(job: { data: EmbedJobData }) {
  const { chunkIds, texts } = job.data;
  log.info({ count: chunkIds.length }, 'Processing embed generate');

  try {
    const embeddings = await embeddingProvider.embed(texts);

    for (let i = 0; i < chunkIds.length; i++) {
      await prisma.documentChunk.update({
        where: { id: chunkIds[i] },
        data: { embedded: true },
      });
    }

    // Update Elasticsearch with embeddings
    for (let i = 0; i < chunkIds.length; i++) {
      await es.update({
        index: 'luma_web',
        id: chunkIds[i],
        doc: { embedding: embeddings[i] },
      });
    }

    return { success: true, count: chunkIds.length };
  } catch (err) {
    log.error({ err }, 'Embed generate failed');
    throw err;
  }
}

async function processAnswerGenerate(job: { data: AnswerJobData }) {
  const { query, profile, userId: _userId } = job.data;
  log.info({ query, profile }, 'Processing answer generate');

  try {
    const answer = await answerEngine.generateAnswer(query, { profile });
    log.info({ query, took: answer.took }, 'Answer generated');
    return { success: true, answer };
  } catch (err) {
    log.error({ err, query }, 'Answer generate failed');
    throw err;
  }
}

// ─── Start workers ──────────────────────────────────────────────────────────

async function startWorkers() {
  log.info('Starting background workers...');

  const workers = [
    createWorker(QUEUE_NAMES.crawlFetch, { redisUrl: env.REDIS_URL }, processCrawlFetch, 5),
    createWorker(QUEUE_NAMES.crawlParse, { redisUrl: env.REDIS_URL }, processCrawlParse, 3),
    createWorker(QUEUE_NAMES.indexIngest, { redisUrl: env.REDIS_URL }, processIndexIngest, 5),
    createWorker(QUEUE_NAMES.embedGenerate, { redisUrl: env.REDIS_URL }, processEmbedGenerate, 3),
    createWorker(QUEUE_NAMES.answerGenerate, { redisUrl: env.REDIS_URL }, processAnswerGenerate, 2),
  ];

  for (const worker of workers) {
    worker.on('completed', (job) => {
      log.debug({ queue: worker.name, jobId: job.id }, 'Job completed');
      metrics.queueJobs.inc({ queue: worker.name, outcome: 'success' }, 1);
    });
    worker.on('failed', (job, err) => {
      log.error({ queue: worker.name, jobId: job?.id, err }, 'Job failed');
      metrics.queueJobs.inc({ queue: worker.name, outcome: 'failed' }, 1);
    });
  }

  log.info('All workers started');
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────

async function shutdown() {
  log.info('Shutting down workers...');
  await redis.quit();
  await prisma.$disconnect();
  await es.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startWorkers().catch(err => {
  log.error({ err }, 'Failed to start workers');
  process.exit(1);
});
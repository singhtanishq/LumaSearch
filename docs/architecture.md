# LumaSearch Architecture

## Overview

LumaSearch is a modular, self-hostable search platform built as a TypeScript monorepo with a clear separation of
concerns across packages and services.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LumaSearch Platform                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Web UI    │    │   Admin UI  │    │   API GW    │    │  Workers    │  │
│  │  (Next.js)  │    │  (Next.js)  │    │  (Fastify)  │    │  (BullMQ)   │  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘  │
│         │                  │                  │                  │          │
│         └──────────────────┼──────────────────┼──────────────────┘          │
│                            │                  │                             │
│              ┌─────────────▼──────────────────▼─────────────┐              │
│              │           Shared Packages                     │              │
│              │  ┌──────────┐ ┌──────────┐ ┌──────────┐       │              │
│              │  │  Config  │ │  Types   │ │  Utils   │ ...   │              │
│              │  └──────────┘ └──────────┘ └──────────┘       │              │
│              └───────────────────────────────────────────────┘              │
│                            │                  │                             │
│         ┌──────────────────┼──────────────────┼──────────────────┐          │
│         ▼                  ▼                  ▼                  ▼          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │ PostgreSQL  │    │  Redis      │    │Elasticsearch│    │  Python     │  │
│  │  (Metadata) │    │  (Queue)    │    │  (Search)   │    │  (Embeds)   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Package Structure

| Package                      | Purpose                              | Key Exports                                                         |
| ---------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| `@luma-search/config`        | Zod-validated environment schemas    | `validateEnv`, `*Env` types                                         |
| `@luma-search/types`         | Shared TypeScript types              | `Document`, `SearchResult`, `AnswerResponse`, etc.                  |
| `@luma-search/utils`         | URL canon, hashing, text chunking    | `canonicalizeUrl`, `simhash`, `chunkText`                           |
| `@luma-search/telemetry`     | Pino logging, Prometheus metrics     | `createLogger`, `initMetrics`, `runHealthChecks`                    |
| `@luma-search/storage`       | Prisma client + DB models            | `getPrismaClient`, Prisma models                                    |
| `@luma-search/queue`         | BullMQ queue definitions             | `createWorker`, `createQueue`, job types                            |
| `@luma-search/search-client` | ES client, index mgmt, hybrid search | `createSearchClient`, `IndexManager`, `buildHybridBody`             |
| `@luma-search/crawler-core`  | Fetcher, parser, trap detection      | `createFetcher`, `parseHtml`, `crawlOrchestrator`                   |
| `@luma-search/embeddings`    | Embedding provider adapters          | `LocalEmbeddingProvider`, `OpenAIEmbeddingProvider`                 |
| `@luma-search/llm`           | LLM provider adapters                | `OpenAIChatProvider`, `AnthropicChatProvider`, `OllamaChatProvider` |
| `@luma-search/query`         | Query parsing, intent detection      | `parseOperators`, `interpretQuery`                                  |
| `@luma-search/evidence`      | Answer synthesis with citations      | `AnswerEngine`                                                      |
| `@luma-search/ranking`       | Ranking profiles, signals            | (future)                                                            |
| `@luma-search/auth`          | Auth adapters                        | (future)                                                            |

## Data Flow

### Search Request

1. **API Gateway** receives `POST /api/v1/search`
2. **Query Understanding** parses operators, detects intent
3. **Search Client** builds ES query (lexical or hybrid)
4. **Elasticsearch** executes search, returns hits
5. **API** formats response with highlights, facets, debug info

### Answer Generation

1. **API Gateway** receives `POST /api/v1/answer`
2. **AnswerEngine** retrieves evidence passages from ES
3. **Prompt Injection Defense** sanitizes passages
4. **LLM Provider** generates answer with system prompt
5. **AnswerEngine** extracts citations, detects contradictions
6. **API** returns answer with inline citations

### Crawl Pipeline

1. **API** creates `CrawlJob` in Postgres
2. **Worker** picks up `crawl:fetch` jobs from Redis
3. **Fetcher** respects robots.txt, SSRF guards, circuit breakers
4. **Parser** extracts content, metadata, links (linkedom)
5. **Trap Detector** filters calendar loops, session params
6. **Index Ingest** writes document + chunks to ES
7. **Embed Worker** generates vectors for chunks
8. **IndexManager** manages alias-based zero-downtime reindexing

## Elasticsearch Index Strategy

- **Alias-based**: `luma_web` → `luma_web_v{timestamp}`
- **Zero-downtime reindex**: create new versioned index → bulk ingest → verify → alias swap → delete old
- **Per-vertical indexes**: `luma_web`, `luma_code`, `luma_docs`
- **Mappings**: strict dynamic, dense_vector for embeddings, keyword fields for filters

## Security

- **SSRF Protection**: DNS resolution + IP blocklist (private ranges, loopback, link-local) at fetch time
- **Prompt Injection Defense**: Sanitization of evidence passages + system prompt framing
- **Rate Limiting**: Per-IP and per-endpoint (search, crawl, auth)
- **Input Validation**: Zod schemas on all API inputs
- **Secrets**: Never committed, loaded from `.env` at runtime
- **CORS/Helmet**: Configured on Fastify

## Deployment

- **Local Dev**: `docker compose -f infra/docker-compose.yml up -d`
- **Production**: `docker compose -f infra/docker-compose.prod.yml up -d`
- **Images**: Multi-stage builds with shared base layer
- **Health Checks**: `/health/live`, `/health/ready` on all services
- **Metrics**: Prometheus at `/metrics`

## Extensibility

All external integrations go through adapters:

- **Search backends**: Add new client implementing search interface
- **Embedding providers**: Implement `EmbeddingProvider` interface
- **LLM providers**: Implement `LLMProvider` interface
- **Auth providers**: Implement `AuthProvider` interface
- **Storage**: Swap Prisma for Drizzle/SQLx via repository pattern

# LumaSearch

**An open-source, self-hostable search platform for web discovery, technical research, and evidence-backed answers.**

LumaSearch combines traditional full-text retrieval with vector similarity search, a crawler and indexing pipeline, optional AI-generated answers with citations, and operational interfaces for managing the system. It is designed as a modular TypeScript monorepo so that the web application, API, background workers, and shared integrations can evolve independently.

> **Project status:** This repository contains the implementation and deployment scaffolding described below. Treat the project as an evolving codebase: verify the current state of a feature, test suite, and deployment target before relying on it in production.

[Architecture](docs/architecture.md) · [Configuration](docs/configuration.md) · [API Reference](docs/api-reference.md) · [Deployment Guide](docs/deployment.md)

---

## Contents

- [Overview](#overview)
- [Why LumaSearch](#why-lumasearch)
- [Capabilities](#capabilities)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
- [Configuration](#configuration)
- [Using the API](#using-the-api)
- [Search Operators](#search-operators)
- [Ranking Profiles](#ranking-profiles)
- [Crawler and Indexing Pipeline](#crawler-and-indexing-pipeline)
- [AI Answers and Evidence](#ai-answers-and-evidence)
- [Development Workflow](#development-workflow)
- [Docker and Deployment](#docker-and-deployment)
- [Operations and Observability](#operations-and-observability)
- [Security Considerations](#security-considerations)
- [Extending LumaSearch](#extending-lumasearch)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Overview

Most search applications need several distinct capabilities: a way to collect and index content, a retrieval engine, query interpretation, ranking, and an interface that helps people understand results. Adding AI-generated answers introduces another requirement: answers should be grounded in identifiable source material rather than presented as unsupported text.

LumaSearch brings these pieces together in a self-hostable project:

- **Hybrid retrieval:** combine lexical relevance (BM25) with vector similarity and Reciprocal Rank Fusion (RRF).
- **Search beyond one index:** organize content into web, code, and documentation verticals.
- **Evidence-backed answers:** retrieve relevant passages and use a configurable language model to produce cited responses, where enabled.
- **A crawler pipeline:** discover and fetch pages, parse useful content, apply crawl safeguards, and move work through queues.
- **Operational interfaces:** provide a search UI and an admin application alongside the HTTP API and background workers.
- **Provider flexibility:** isolate embedding, LLM, queue, storage, and other integrations behind reusable packages and adapters.
- **Self-hosting options:** use Docker Compose for local infrastructure and a separate Compose definition for production-oriented deployment.

LumaSearch is intended for developers and teams who want control over their search infrastructure, ranking logic, data collection, and AI provider choices.

## Why LumaSearch

LumaSearch is built around a few practical engineering principles.

### Retrieval before generation

AI answers depend on the quality of the retrieved material. LumaSearch separates search and evidence retrieval from answer generation, allowing the search layer to be useful on its own and giving generated answers source material to reference.

### Hybrid search instead of a single retrieval signal

Keyword search is valuable when exact terms, identifiers, filenames, or technical phrases matter. Vector search can help retrieve conceptually similar content even when the wording differs. Hybrid retrieval combines these complementary signals instead of requiring every query to use only one approach.

### A pipeline for background work

Crawling, parsing, embedding generation, and indexing can take substantially longer than a normal interactive request. LumaSearch uses Redis-backed queues and worker processes to separate this work from API request handling.

### Modular, replaceable integrations

Shared packages define boundaries between services and external systems. The embedding and language-model layers support provider selection through configuration and adapter interfaces, reducing the need to spread provider-specific code throughout the application.

### Control over deployment and data

The project includes a local Docker Compose stack, environment-based configuration, and a production-oriented deployment definition. Self-hosting gives operators more control over data location and infrastructure, while also making them responsible for securing and maintaining that infrastructure.

## Capabilities

| Capability | What it does | Notes |
|---|---|---|
| Hybrid search | Combines BM25 and vector retrieval using Reciprocal Rank Fusion | Controlled through search configuration and profiles |
| Query understanding | Parses supported search operators and interprets query intent | See the [API reference](docs/api-reference.md) |
| Result presentation | Returns titles, snippets, highlights, metadata, scores, and facets where available | Actual fields depend on indexed content and request options |
| Vertical search | Separates web, code, and documentation search indexes | Index strategy is described in the architecture guide |
| AI answer generation | Synthesizes answers from retrieved evidence and can return inline citations | Requires an enabled LLM provider and suitable configuration |
| Contradiction handling | The evidence-answering layer is designed to detect conflicting evidence | Quality depends on retrieved sources and model behavior |
| Web crawling | Fetches and parses pages from configured seed URLs | Crawl responsibly and review the crawler settings before use |
| Background jobs | Queues crawl and related processing tasks for workers | Redis/BullMQ are part of the stack |
| Embeddings | Supports a local Sentence Transformers service and configured external providers | Provider, model, and dimensions must be compatible |
| Admin interface | Separate application for operational workflows | Access controls and deployment configuration matter |
| Health and metrics | Health endpoints and Prometheus-oriented metrics are documented | See operations guidance below |
| Deployment | Dockerfiles and Compose definitions support local and production-oriented setups | Production still requires environment-specific hardening |

The presence of configuration flags or interfaces does not necessarily mean every optional product workflow is enabled by default. Review the current implementation and configuration before enabling a capability in a live environment.

## How It Works

At a high level, LumaSearch has two main paths: the **query path**, which serves search and answer requests, and the **ingestion path**, which collects content and makes it searchable.

### Search request flow

1. A user submits a query through the web application or calls the API.
2. The API validates the request and interprets the query, including supported operators.
3. The search layer builds a lexical or hybrid query for Elasticsearch.
4. Elasticsearch returns matching documents.
5. The API shapes the response with result metadata, snippets/highlights, ranking information, and available facets.

### AI answer flow

1. The caller submits a question to the answer endpoint.
2. LumaSearch retrieves relevant documents and evidence passages.
3. Evidence is prepared for the language model, with prompt-injection defenses intended to reduce the risk of treating source content as instructions.
4. The configured LLM generates a response from the evidence.
5. The evidence layer associates citations with sources and evaluates aspects such as evidence coverage and contradictions.
6. The API returns the generated answer and supporting metadata.

AI output should still be reviewed critically. Citations help readers inspect the evidence, but they do not guarantee that a statement is correct or that the retrieved corpus is complete.

### Crawl and indexing flow

1. A crawl job is submitted with seed URLs and limits.
2. Job metadata is persisted and work is queued.
3. Workers fetch eligible URLs subject to configured crawler policies.
4. The crawler parses page content, metadata, and links.
5. URL normalization, deduplication, and trap-detection logic help reduce redundant or unproductive crawling.
6. Content is ingested into the search index; embedding work can generate vectors for supported content.
7. Indexed documents become available to the search path.

The available behavior is affected by crawl limits, source-site policies, robots.txt, network reachability, parser support, and embedding configuration.

## Architecture

LumaSearch is a **pnpm workspace monorepo** orchestrated with Turborepo. Applications are separated from shared packages and infrastructure services.

```text
LumaSearch
├── User-facing applications
│   ├── apps/web       Search interface (Next.js)
│   └── apps/admin     Admin interface (Next.js)
│
├── Backend services
│   ├── apps/api       HTTP API (Fastify)
│   └── apps/worker    Background processing workers
│
├── Shared packages
│   ├── config         Environment/config validation
│   ├── types          Shared data contracts
│   ├── utils          Common utilities
│   ├── storage        Prisma/database access
│   ├── queue          Redis/BullMQ queue abstractions
│   ├── search-client  Elasticsearch access and hybrid-search helpers
│   ├── crawler-core   Fetching, parsing, and crawl orchestration
│   ├── embeddings     Embedding provider adapters
│   ├── llm            Language-model provider adapters
│   ├── query          Query parsing and interpretation
│   ├── evidence       Evidence preparation and answer generation
│   ├── ranking        Ranking-related package boundary
│   ├── auth           Authentication-related package boundary
│   └── telemetry      Logging, metrics, and health utilities
│
├── embeddings-service Python HTTP service for local embeddings
├── infra              Docker Compose and container build definitions
├── scripts            Bootstrap, development, seed, and deployment scripts
└── docs               Architecture, API, configuration, and deployment guides
```

### Core infrastructure

| Component | Responsibility |
|---|---|
| PostgreSQL | Persistent application metadata and relational records |
| Redis | Queues, job coordination, and configured cache/session uses |
| Elasticsearch | Full-text retrieval, vector search, and index management |
| Embeddings service | Optional local generation of text embeddings |
| API | Request validation, search/answer orchestration, and HTTP responses |
| Worker | Background crawl and indexing-related processing |
| Web app | Search-oriented user interface |
| Admin app | Separate operational interface |

### Index strategy

The architecture documentation describes alias-based index versioning. Logical index aliases such as `luma_web` can point to versioned physical indexes. This pattern can support a controlled reindexing process: create a new index, ingest content, verify it, move the alias, and retire the older index after validation.

The intended verticals are:

- **Web** — general web content.
- **Code** — source repositories and technical code-oriented material.
- **Docs** — product, API, and technical documentation.

The active mappings, index creation behavior, and available management operations should be confirmed against the implementation and the running Elasticsearch instance.

For a deeper system view, see [docs/architecture.md](docs/architecture.md).

## Technology Stack

The repository currently declares the following technologies and tools:

| Layer | Technology |
|---|---|
| Language | TypeScript / JavaScript |
| Runtime | Node.js 20 or later |
| Package manager | pnpm 9 or later |
| Monorepo orchestration | Turborepo |
| Web and admin applications | Next.js, React |
| HTTP API | Fastify |
| Relational data access | Prisma with PostgreSQL |
| Search engine | Elasticsearch |
| Queue and worker infrastructure | Redis and BullMQ |
| Local embeddings | Python, FastAPI, Sentence Transformers |
| Language-model integration | Provider adapters for supported LLMs |
| Validation/configuration | Shared configuration package and typed schemas |
| Tests | Vitest |
| Formatting | Prettier |
| Linting | ESLint |
| Containers | Docker and Docker Compose |

Versions and supported providers may evolve. Use the lockfile and package manifests as the source of truth when installing dependencies.

## Repository Structure

The key repository paths are outlined below.

| Path | Purpose |
|---|---|
| `apps/web/` | Next.js search-facing application |
| `apps/admin/` | Next.js administration interface |
| `apps/api/` | Fastify API service |
| `apps/worker/` | Background worker process |
| `packages/config/` | Shared environment configuration |
| `packages/types/` | Shared request, response, and domain types |
| `packages/utils/` | Shared helpers such as URL and text utilities |
| `packages/storage/` | Prisma schema, database client, and persistence |
| `packages/queue/` | Queue definitions and worker helpers |
| `packages/search-client/` | Elasticsearch client, indexing, and search helpers |
| `packages/crawler-core/` | Crawl fetching, parsing, and orchestration |
| `packages/embeddings/` | Embedding provider interfaces/adapters |
| `packages/llm/` | LLM provider interfaces/adapters |
| `packages/query/` | Query parsing and interpretation |
| `packages/evidence/` | Evidence retrieval/answering components |
| `packages/ranking/` | Ranking-related logic/boundary |
| `packages/auth/` | Authentication-related logic/boundary |
| `packages/telemetry/` | Logging, metrics, and health helpers |
| `embeddings-service/` | Python service that exposes local text embedding endpoints |
| `infra/docker-compose.yml` | Local infrastructure and application services |
| `infra/docker-compose.prod.yml` | Production-oriented Compose services |
| `infra/docker/` | Container build definitions |
| `scripts/bootstrap.sh` | Local environment bootstrap |
| `scripts/dev.sh` | Development helper script |
| `scripts/prod-deploy.sh` | Container build and deployment helper |
| `scripts/seed-demo.ts` | Demo-data seeding script |
| `docs/` | Detailed project documentation |
| `package.json` | Root scripts and workspace metadata |
| `pnpm-workspace.yaml` | Workspace package declarations |
| `turbo.json` | Task pipeline and caching configuration |
| `.env.example` | Documented environment-variable template |

## Getting Started

### Prerequisites

For the repository's documented local workflow, install:

- **Node.js 20 or later**
- **pnpm 9 or later**
- **Docker** with the Docker Compose plugin
- **Git**
- Enough memory and disk for the search infrastructure

The deployment guide recommends at least 4 GB RAM and 20 GB of disk for a basic environment; 8 GB RAM is recommended when running Elasticsearch locally. Resource use depends on the corpus, embedding model, and workload.

### 1. Clone the repository

```bash
git clone https://github.com/singhtanishq/LumaSearch.git
cd LumaSearch
```

### 2. Bootstrap the local environment

The repository includes a bootstrap script:

```bash
./scripts/bootstrap.sh
```

The script checks for Node.js, pnpm, Docker, and Docker Compose; creates `.env` from `.env.example` when needed; starts the local Compose stack; waits for core infrastructure; installs dependencies; generates the Prisma client; runs database migrations; and builds the workspace.

Review the script before running it, especially if you already have local services using the same ports or existing Docker volumes. The local Compose file uses development-oriented defaults and should not be treated as production-secure.

### 3. Review configuration

Open `.env` and review any values required for your environment. For basic local work, the Compose defaults are designed to make the infrastructure approachable. To generate AI answers through a hosted provider, configure the appropriate provider and API key.

Full reference: [docs/configuration.md](docs/configuration.md).

### 4. Start the development processes

```bash
pnpm dev
```

The root development command runs the workspace development tasks through Turborepo. Infrastructure services are started separately by Docker Compose.

### 5. Open the local services

| Service | Local address | Purpose |
|---|---|---|
| Web UI | [http://localhost:3000](http://localhost:3000) | Search interface |
| API | [http://localhost:4000](http://localhost:4000) | HTTP API |
| Admin UI | [http://localhost:4001](http://localhost:4001) | Administrative interface |
| Elasticsearch | [http://localhost:9200](http://localhost:9200) | Search/index backend in the local development stack |
| Embeddings | [http://localhost:8000](http://localhost:8000) | Local embedding HTTP service |
| PostgreSQL | `localhost:5432` | Metadata database |
| Redis | `localhost:6379` | Queues and supporting infrastructure |

A service listening on its port does not by itself prove that the complete application is ready. Check health endpoints and service logs when diagnosing startup issues.

### Alternative: start infrastructure manually

If you prefer to control bootstrap steps yourself:

```bash
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm --filter @luma-search/storage db:generate
pnpm --filter @luma-search/storage db:migrate
pnpm build
pnpm dev
```

If migrations or builds fail, resolve those errors before launching the entire application. When the lockfile is current, prefer `pnpm install --frozen-lockfile` for reproducible installs.

## Configuration

LumaSearch reads environment variables for service URLs, credentials, feature flags, resource limits, and provider choices. The root template is [`.env.example`](.env.example), and the full configuration guide is [docs/configuration.md](docs/configuration.md).

### Application and infrastructure

| Variable | Purpose |
|---|---|
| `NODE_ENV` | Runtime environment |
| `APP_URL` | Public or local web application URL |
| `API_URL` | API URL |
| `ADMIN_URL` | Admin application URL |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ELASTICSEARCH_URL` | Elasticsearch endpoint |
| `ES_INDEX_PREFIX` | Prefix for search indexes |

### Embeddings

The example configuration supports these provider selections:

- `local` — local Python embedding service.
- `openai` — OpenAI embeddings.
- `cohere` — Cohere embeddings.
- `voyage` — Voyage embeddings.

Relevant variables include `EMBEDDING_PROVIDER`, `EMBEDDING_LOCAL_URL`, the selected provider's API key, model identifier, batch size, and vector dimensions. The selected model's actual dimensions must match the search index's vector mapping; changing models may require an index migration or rebuild.

### AI answer generation

The example configuration lists `openai`, `anthropic`, `ollama`, `vertex`, `bedrock`, and `disabled` as LLM provider options. Configure the matching credentials, endpoint, model, and region/project settings for the provider you choose.

For example, to enable a hosted OpenAI-backed answer flow, set the relevant values in your local `.env`:

```dotenv
LLM_PROVIDER=openai
OPENAI_API_KEY=replace-with-your-own-key
OPENAI_CHAT_MODEL=gpt-4o-mini
```

Keep real credentials in environment-specific secret storage. Never commit production API keys or secrets.

### Authentication and application security

The configuration template includes JWT, session, CSRF, password-hashing, API-key, cookie, and encryption settings. Production deployments must replace development placeholders with strong, unique values and use HTTPS. See [Security Considerations](#security-considerations) and the [configuration reference](docs/configuration.md).

### Feature flags

The example environment contains flags for capabilities such as AI answers, research workspace, crawl scheduler, vertical search, admin dashboard, multi-tenancy, and billing. Several are disabled by default. A flag being present is not a guarantee that a complete end-user workflow is production-ready; verify both the relevant code path and its tests before depending on it.

## Using the API

The documented base URL for the local API is:

```text
http://localhost:4000/api/v1
```

For complete request and response shapes, review [docs/api-reference.md](docs/api-reference.md).

### Search

Send a POST request to `/api/v1/search`:

```bash
curl -X POST http://localhost:4000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "q": "typescript tutorial site:github.com",
    "profile": "hybrid",
    "limit": 10,
    "offset": 0
  }'
```

A search response can include the interpreted query, results, total count, execution time, selected ranking profile, and facets. Each result may contain identifiers, title, URL, snippet, domain, vertical, language, timestamps, score, highlights, and source metadata.

The example assumes the API is running and that the index contains searchable documents. A newly started local environment may not contain a useful corpus until data has been ingested or demo data has been seeded.

### AI answer

Send a question to `/api/v1/answer`:

```bash
curl -X POST http://localhost:4000/api/v1/answer \
  -H "Content-Type: application/json" \
  -d '{
    "q": "What is TypeScript?",
    "profile": "research",
    "filters": {},
    "mode": "answer"
  }'
```

This endpoint requires a functioning search corpus and a configured, enabled LLM provider. Depending on the answer path and provider, the response may include the answer text, citations, confidence or coverage metadata, model information, token usage, execution time, and cache state.

Do not expose provider credentials to browser clients. AI answers should be evaluated against their cited sources before being used for consequential decisions.

### Submit a crawl job

```bash
curl -X POST http://localhost:4000/api/v1/crawl/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "seeds": ["https://example.com"],
    "maxPages": 100,
    "maxDepth": 2,
    "name": "Example crawl"
  }'
```

The response returns a job identifier and initial status when the request is accepted. Query the documented job-status route to inspect progress:

```bash
curl http://localhost:4000/api/v1/crawl/jobs/YOUR_JOB_ID
```

Crawling is asynchronous. A successful job submission means that work was accepted, not necessarily that every page was fetched or indexed successfully.

### Health endpoints

```bash
# Liveness: process is running
curl http://localhost:4000/health/live

# Readiness: checks application dependencies
curl http://localhost:4000/health/ready

# Metrics, if enabled
curl http://localhost:4000/metrics
```

The API reference documents the expected health response shapes. Readiness is the more useful signal when confirming whether the application can reach required dependencies.

### Authentication and protected routes

The API documentation describes public search/answer routes and protected administrative routes. API-key requests use a bearer token, for example:

```bash
curl http://localhost:4000/api/v1/index/status \
  -H "Authorization: Bearer luma_REPLACE_WITH_API_KEY"
```

Use a real key created through the application's supported workflow. Do not place production keys in shell history, public logs, or source control.

## Search Operators

LumaSearch's query parser documents the following operators:

| Operator | Example | Meaning |
|---|---|---|
| `site:` | `site:github.com` | Restrict results to a site or domain |
| `filetype:` | `filetype:pdf` | Filter by file extension/type |
| `intitle:` | `intitle:typescript` | Require a term in the title |
| `inurl:` | `inurl:api` | Match a term in the URL |
| `before:` | `before:2025-01-01` | Restrict to content before a date |
| `after:` | `after:2024-01-01` | Restrict to content after a date |
| `lang:` | `lang:en` | Restrict by language |
| Quoted phrase | `"exact phrase"` | Search for a phrase |
| Exclusion | `-deprecated` | Exclude a term |

Example:

```text
site:github.com "vector search" lang:en -deprecated
```

Operator support depends on the query parser and indexed metadata. Syntax alone cannot produce results for pages that have not been indexed.

## Ranking Profiles

The README and API documentation describe these ranking profiles:

| Profile | Intended use |
|---|---|
| `fastest` | Favor a simpler, low-overhead lexical search path |
| `hybrid` | Combine BM25 and vector retrieval; general-purpose default |
| `recent` | Give more weight to freshness |
| `primary-sources` | Favor authoritative sources such as official, government, or educational domains |
| `technical` | Favor technical material, code, and developer resources |
| `documentation` | Favor official product and technical documentation |
| `research` | Favor broader recall and reranking/evidence discovery |

Available profiles and their exact weights are implementation- and configuration-dependent. Use them as retrieval strategies, not as guarantees that a particular source type will always rank first.

### What hybrid search means

BM25 scores documents based on lexical signals such as term occurrence and document statistics. Vector retrieval compares embeddings to find semantic similarity. Reciprocal Rank Fusion combines ranked result lists using rank positions rather than requiring the two retrieval systems' raw scores to share the same scale.

This can help balance exact-match behavior with semantic relevance. It does not remove the need to tune ranking, evaluate real queries, and inspect failure cases.

## Crawler and Indexing Pipeline

The crawler is intended to provide a controlled way to build a searchable corpus from specified seed URLs and discovered links.

### Responsible crawling

The repository documents safeguards and configuration for:

- Respecting `robots.txt` when configured.
- Limiting global and per-domain concurrency.
- Applying politeness delays between requests.
- Restricting request duration, redirects, URL length, and content sizes.
- Blocking private and special-purpose IP ranges to mitigate server-side request forgery (SSRF).
- Adding DNS-rebinding protections.
- Avoiding repetitive crawl traps such as certain calendar or session-parameter patterns.
- Configuring allowed and blocked domains.

These safeguards should be reviewed and tested in the deployment environment. Network topology, DNS behavior, proxies, redirects, and external service access can affect their effectiveness. Only crawl sources you are authorized to access, follow site policies, and avoid placing an unnecessary load on source systems.

### Operational considerations

Crawl outcomes depend on the target sites. Pages may be unavailable, rate-limited, rendered primarily in client-side JavaScript, blocked to automated clients, or unsuitable for parsing. Set reasonable crawl limits, monitor failed URLs, and validate the resulting search quality before scheduling large runs.

### Indexing and reindexing

Elasticsearch stores searchable documents and associated metadata. The architecture describes versioned indexes with aliases for controlled index swaps. For a substantial schema or embedding-model change, plan how existing documents will be reprocessed and validate the new index before switching live aliases.

## AI Answers and Evidence

The answer-generation layer is designed to use retrieved content as evidence for a language model, return source citations, and expose additional metadata that can help consumers assess the result.

### Design goals

- Retrieve evidence before generating a response.
- Keep source references associated with the answer.
- Support configurable language-model providers.
- Apply prompt-injection defenses to retrieved material.
- Surface contradictory evidence where detected.
- Make answer-generation limits configurable, including evidence passages, token budgets, and timeouts.

### Important limitations

- **Citations are not a proof of correctness.** A model can misinterpret, overgeneralize, or cite a passage that only partially supports a claim.
- **The corpus limits the answer.** Missing, stale, inaccessible, or poorly indexed sources can lead to incomplete responses.
- **Prompt-injection defenses are defense-in-depth.** They reduce risk but should not be treated as a complete guarantee against malicious source content.
- **Provider settings affect cost and behavior.** Model choice, token limits, latency, and API pricing can materially change operating costs.
- **AI answers are optional.** Keep the LLM provider disabled when generated answers are not needed, and verify feature-flag behavior before enabling a public workflow.

For research or high-impact use cases, show citations clearly and retain a way for users to inspect original sources.

## Development Workflow

### Root commands

Run these from the repository root:

| Command | Purpose |
|---|---|
| `pnpm dev` | Run development tasks across the workspace |
| `pnpm build` | Build workspace projects through Turborepo |
| `pnpm build:prod` | Build application and package workspace targets |
| `pnpm lint` | Run configured lint tasks |
| `pnpm lint:fix` | Run lint tasks with automatic fixes where supported |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run workspace tests |
| `pnpm test:watch` | Run tests in watch mode where configured |
| `pnpm test:coverage` | Run coverage tasks where configured |
| `pnpm format` | Format supported files with Prettier |
| `pnpm format:check` | Check formatting without writing changes |
| `pnpm clean` | Clean build outputs and local Turborepo artifacts |

A task may be a no-op or report no tests when a package has not implemented that task. Read command output rather than assuming a green exit means every product behavior has comprehensive tests.

### Run a single application

```bash
# API
pnpm --filter @luma-search/api dev

# Web application
pnpm --filter @luma-search/web dev

# Background worker
pnpm --filter @luma-search/worker dev
```

The root workspace also includes an admin application, configured separately on port 4001. Application scripts can be found in each app's `package.json`.

### Database workflow

The storage package exposes the repository's database tasks through the workspace:

```bash
pnpm --filter @luma-search/storage db:generate
pnpm --filter @luma-search/storage db:push
pnpm --filter @luma-search/storage db:migrate
pnpm --filter @luma-search/storage db:studio
```

Use migrations deliberately in shared and production environments. Do not use schema-push workflows casually against important production data.

### Suggested pre-commit checks

Before submitting a change, run the relevant checks for the affected packages:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

Fix failures introduced by the change and document any environment-dependent checks that could not be run. For changes to search behavior, also test representative queries and inspect result relevance.

## Docker and Deployment

### Local Docker Compose

Start the local services:

```bash
docker compose -f infra/docker-compose.yml up -d
```

Check service status and logs:

```bash
docker compose -f infra/docker-compose.yml ps
docker compose -f infra/docker-compose.yml logs -f api
docker compose -f infra/docker-compose.yml logs -f worker
docker compose -f infra/docker-compose.yml logs -f elasticsearch
```

Stop containers without deleting persisted volumes:

```bash
docker compose -f infra/docker-compose.yml down
```

To remove the local data volumes as well, Docker Compose supports a destructive volume-removal option. Use it only when you intentionally want to discard local database, Redis, and Elasticsearch data.

### Production-oriented deployment

The repository provides `infra/docker-compose.prod.yml`, container build files, and `scripts/prod-deploy.sh`. Read [docs/deployment.md](docs/deployment.md) before deploying.

The production setup expects explicit environment values for core dependencies and secrets. In a real deployment, also decide how container images will be built and published, how PostgreSQL/Redis/Elasticsearch will be operated, how TLS and the reverse proxy will be configured, and how logs, backups, metrics, and upgrades will be managed.

The deployment script defaults its image registry and tag, and pushes images when `DOCKER_REGISTRY` is set. Review its registry and Compose image naming behavior and align them with your actual image registry before using it.

### Production checklist

Before exposing a deployment to users:

- Replace every development secret and placeholder with strong, unique values.
- Use HTTPS and enable secure session cookies.
- Restrict direct public access to databases, Redis, Elasticsearch, and internal service ports.
- Require appropriate authentication for administrative operations and keys.
- Configure provider credentials through a secret manager or secure environment injection.
- Review CORS, rate limits, resource limits, and crawler allow/block policies.
- Configure database and Elasticsearch backups, and test restoration.
- Set up monitoring and alerting for dependencies, API errors, worker failures, and queue depth.
- Validate the running build with readiness checks and realistic search/crawl tests.
- Document a rollback strategy, including the compatibility of database migrations and index mappings.

The presence of a production Compose file is a starting point, not a guarantee that a deployment is secure or production-ready without environment-specific review.

## Operations and Observability

### Health checks

Use the API's liveness endpoint to determine whether the process is responding, and the readiness endpoint to check whether required dependencies are available:

```bash
curl -fsS http://localhost:4000/health/live
curl -fsS http://localhost:4000/health/ready
```

A readiness failure should prompt checks of PostgreSQL connectivity, Elasticsearch status, configuration, and service logs.

### Metrics and logs

The environment template includes options for:

- Structured application logging with configurable log level and output format.
- Prometheus-oriented metrics.
- Optional OpenTelemetry export.
- Configurable health-check intervals.

Configure your monitoring stack to collect these outputs and alert on meaningful failure conditions. Avoid logging credentials, access tokens, or sensitive crawled content.

### Backups

At minimum, plan backups for PostgreSQL data and any other persistent state that is operationally important. If Elasticsearch indexes can be recreated from source data, decide whether snapshots are needed for recovery-time objectives or whether a full recrawl/reindex is acceptable. Test restoration rather than relying only on successful backup jobs.

## Security Considerations

Search infrastructure processes untrusted input from both users and the content it crawls. Secure deployments need to account for the whole pipeline.

### Secrets and authentication

- Do not commit `.env`, API keys, passwords, JWT secrets, session secrets, or encryption keys.
- Replace all development defaults before deployment.
- Use secure cookies behind HTTPS and apply appropriate session settings.
- Protect administrative functions and index/crawl-management endpoints.
- Rotate leaked credentials immediately and review the affected services.

### Crawler safety

The crawler's SSRF-related protections are especially important when users can submit URLs. Keep private-network protections enabled unless there is a well-understood, explicitly approved reason to change them. Revalidate redirects and DNS behavior at fetch time, and use allowlists where feasible in controlled deployments.

### Untrusted content and AI

Treat crawled pages as untrusted data. Prompt-injection filtering can help, but it should complement provider isolation, strict tool permissions, output validation, and careful handling of secrets. Never give the answer-generation model unrestricted access to internal credentials just because the system retrieves web content.

### Network and infrastructure

The local Compose configuration is for development and contains insecure defaults, including disabled Elasticsearch authentication and simple local database credentials. Bind and firewall internal services appropriately, enable TLS/authentication for production dependencies, and do not expose their raw ports to the public internet unless access is intentionally controlled.

For the project's documented security model, consult [docs/architecture.md](docs/architecture.md) and the deployment/configuration guides.

## Extending LumaSearch

The project uses packages and adapter interfaces to make integrations replaceable without coupling every application to one vendor.

### Add an embedding provider

Implement the shared `EmbeddingProvider` contract from `@luma-search/embeddings`, then wire the provider into the package's selection/registration flow. A provider should define its identity, model/dimension behavior, and a method for embedding batches of text.

Illustrative shape:

```typescript
import { EmbeddingProvider } from '@luma-search/embeddings';

class MyEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'my-provider';
  readonly dimensions = 768;

  async embed(texts: string[]): Promise<number[][]> {
    // Call your embedding model and return one vector per input.
    throw new Error('Implement provider integration');
  }
}
```

This snippet is an interface illustration, not a drop-in implementation. Add configuration, error handling, retry/timeout policy, tests, and compatibility checks for vector dimensions before using the provider.

### Add an LLM provider

Implement the `LLMProvider` interface from `@luma-search/llm` and register it with the package's provider selection mechanism. Respect the existing prompt/message and generation-option types, and handle provider errors, timeouts, and token usage consistently.

```typescript
import { LLMProvider } from '@luma-search/llm';

class MyLLMProvider implements LLMProvider {
  readonly name = 'my-llm';
  readonly model = 'my-model';

  async generate(messages, options) {
    // Call your provider and map its response to the shared result shape.
    throw new Error('Implement provider integration');
  }
}
```

Check the actual exported types in the repository before implementing the method signature, as the interface may evolve.

### Other extension areas

Potential extension points include query interpretation, ranking profiles, crawler parsing, telemetry, storage, and authentication. New integrations should remain behind package boundaries, have explicit configuration and failure behavior, and include tests covering normal responses and failure cases.

## Troubleshooting

### The application does not start

1. Confirm Node.js, pnpm, Docker, and the Docker Compose plugin are installed.
2. Check `docker compose -f infra/docker-compose.yml ps`.
3. Inspect service logs, especially PostgreSQL, Redis, and Elasticsearch.
4. Confirm ports 3000, 4000, 4001, 5432, 6379, 8000, and 9200 are not occupied by unrelated processes.
5. Verify that `.env` contains valid connection URLs and no malformed values.

### Elasticsearch is not ready

Elasticsearch can take some time to initialize and uses substantial memory. Check its container logs and health endpoint:

```bash
docker compose -f infra/docker-compose.yml logs -f elasticsearch
curl -fsS http://localhost:9200/_cluster/health
```

If it repeatedly exits, inspect available memory, Docker resource allocation, disk space, and Elasticsearch startup logs.

### Database generation or migrations fail

Confirm PostgreSQL is healthy and that `DATABASE_URL` points to the expected database. Then retry the documented storage commands:

```bash
pnpm --filter @luma-search/storage db:generate
pnpm --filter @luma-search/storage db:migrate
```

For shared environments, check migration history and the current schema before applying changes manually.

### Search returns no results

A healthy API and search engine do not imply that documents are indexed. Verify that content has been crawled or ingested, the correct vertical/index alias is active, and the query filters/operator syntax match the metadata available in the corpus.

### AI answers fail

Check that an LLM provider is selected, its API key or credentials are valid, the configured model is accessible, and the answer feature is enabled along the active code path. Also verify that search can return evidence and inspect API logs for provider timeouts or rate limits.

### Embedding generation fails

Confirm that the embedding service is reachable at `EMBEDDING_LOCAL_URL` when using the local provider. The local service exposes `GET /health` and `POST /embed`. Check Python dependencies and model download availability. If changing the embedding model, ensure the configured vector dimensions agree with the index mapping.

### Crawl jobs remain pending

Check that Redis is healthy, the worker process is running, and the queue configuration is consistent between API and worker. Review worker logs for rejected URLs, robots.txt policy, network failures, timeouts, and retry exhaustion.

### Formatting or linting differs between packages

The web and admin apps and the API/worker use their own package scripts and may have different framework tooling. Run the root command, then execute the relevant package-level command to isolate the failure.

## Documentation

Use the focused documentation files for deeper details:

| Document | Covers |
|---|---|
| [Architecture](docs/architecture.md) | Services, shared package boundaries, data flows, indexes, and security model |
| [API Reference](docs/api-reference.md) | Endpoints, sample payloads, response shapes, rate-limit notes, and error responses |
| [Configuration Reference](docs/configuration.md) | Environment-variable groups, defaults, and provider settings |
| [Deployment Guide](docs/deployment.md) | Local setup, production deployment, health checks, backups, upgrades, and troubleshooting |

## Contributing

Contributions that improve reliability, search quality, provider flexibility, documentation, and operational safety are welcome.

Before opening a pull request:

1. Keep changes scoped and explain the problem being solved.
2. Follow the existing package boundaries and TypeScript conventions.
3. Add or update tests for behavior changes.
4. Update relevant documentation and configuration examples.
5. Run linting, type-checking, tests, formatting checks, and a build when applicable.
6. Never include secrets, real customer data, or unreviewed crawler output.
7. Describe any required migration, index rebuild, or environment change in the pull request.

Please read the repository's contribution guidance if present in the current branch and open an issue for substantial design changes before investing in a large implementation.

## License

LumaSearch is described by the repository as MIT-licensed. See the [LICENSE](LICENSE) file in the repository for the actual license text and terms.

---

<p align="center">
  Built for search systems that are inspectable, extensible, and under your control.
</p>

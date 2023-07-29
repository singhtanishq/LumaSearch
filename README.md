# LumaSearch

A production-grade, open-source, self-hostable, SaaS-ready next-generation search engine.

## Features

- **Hybrid Search**: BM25 + kNN vector search with Reciprocal Rank Fusion
- **AI Answers**: Evidence-backed answers with inline citations and contradiction detection
- **Real Crawler**: Respects robots.txt, SSRF protection, circuit breakers, politeness delays
- **Multi-Vertical**: Web, Code, and Docs search with dedicated indexes
- **Admin Dashboard**: System health, crawl operations, index management, metrics
- **Self-Hostable**: Docker Compose for local dev, production-ready compose
- **Extensible**: Adapter pattern for embeddings, LLMs, auth, storage backends

## Quick Start

```bash
# Clone and bootstrap
git clone https://github.com/singhtanishq/LumaSearch.git
cd LumaSearch
./scripts/bootstrap.sh

# Start development
pnpm dev
```

## Services

| Service       | URL                   | Description             |
| ------------- | --------------------- | ----------------------- |
| Web UI        | http://localhost:3000 | Search interface        |
| API           | http://localhost:4000 | REST API                |
| Admin         | http://localhost:4001 | Admin dashboard         |
| Elasticsearch | http://localhost:9200 | Search engine           |
| Embeddings    | http://localhost:8000 | Local embedding service |

## Configuration

Copy `.env.example` to `.env` and customize. See [Configuration Reference](docs/configuration.md) for all options.

Key variables:

```bash
# Required for production
JWT_SECRET=your-32-char-secret
SESSION_SECRET=your-32-char-secret
CSRF_SECRET=your-32-char-secret

# Optional: Enable AI answers
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

## Architecture

See [Architecture Documentation](docs/architecture.md) for details on:

- Package structure and boundaries
- Data flows (search, answer, crawl)
- Elasticsearch index strategy
- Security model
- Deployment

## Development

```bash
# Start all services in watch mode
pnpm dev

# Run specific service
pnpm --filter @luma-search/api dev
pnpm --filter @luma-search/web dev
pnpm --filter @luma-search/worker dev

# Build all
pnpm build

# Lint + typecheck + format
pnpm lint && pnpm typecheck && pnpm format:check
```

## Production Deployment

```bash
# Configure production env
cp .env.example .env.production
# Edit .env.production with production values

# Deploy
./scripts/prod-deploy.sh v1.0.0
```

## API Usage

```bash
# Search
curl -X POST http://localhost:4000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"q": "typescript tutorial site:github.com", "profile": "hybrid"}'

# AI Answer (requires LLM_PROVIDER)
curl -X POST http://localhost:4000/api/v1/answer \
  -H "Content-Type: application/json" \
  -d '{"q": "What is TypeScript?", "profile": "research"}'

# Submit crawl job
curl -X POST http://localhost:4000/api/v1/crawl/jobs \
  -H "Content-Type: application/json" \
  -d '{"seeds": ["https://example.com"], "maxPages": 100}'
```

## Search Operators

| Operator    | Example              | Description           |
| ----------- | -------------------- | --------------------- |
| `site:`     | `site:github.com`    | Restrict to domain    |
| `filetype:` | `filetype:pdf`       | File extension filter |
| `intitle:`  | `intitle:typescript` | Title must contain    |
| `inurl:`    | `inurl:api`          | URL must contain      |
| `before:`   | `before:2024-01-01`  | Published before date |
| `after:`    | `after:2023-01-01`   | Published after date  |
| `lang:`     | `lang:en`            | Language filter       |
| `"phrase"`  | `"exact phrase"`     | Exact phrase match    |
| `-term`     | `-deprecated`        | Exclude term          |

## Ranking Profiles

| Profile           | Use Case                        |
| ----------------- | ------------------------------- |
| `fastest`         | Pure BM25, minimal processing   |
| `hybrid`          | BM25 + vector (default)         |
| `recent`          | Heavy freshness boost           |
| `primary-sources` | Boost .gov, .edu, official docs |
| `technical`       | Boost code, technical docs      |
| `documentation`   | Boost official docs             |
| `research`        | Maximize recall + rerank        |

## Extending

### Custom Embedding Provider

```typescript
import { EmbeddingProvider } from '@luma-search/embeddings';

class MyEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'my-provider';
  readonly dimensions = 768;
  async embed(texts: string[]): Promise<number[][]> { ... }
}
```

### Custom LLM Provider

```typescript
import { LLMProvider } from '@luma-search/llm';

class MyLLMProvider implements LLMProvider {
  readonly name = 'my-llm';
  readonly model = 'my-model';
  async generate(messages: PromptMessage[], options?: GenerateOptions) { ... }
}
```

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](docs/contributing.md) for guidelines.

## Security

See [SECURITY.md](docs/security.md) for vulnerability reporting and security model.

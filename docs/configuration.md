# LumaSearch Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` and modify.

## Application

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `APP_NAME` | `LumaSearch` | Display name |
| `APP_URL` | `http://localhost:3000` | Frontend URL |
| `API_URL` | `http://localhost:4000` | API URL |
| `ADMIN_URL` | `http://localhost:4001` | Admin dashboard URL |

## Database (PostgreSQL)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://luma:luma@localhost:5432/luma_search` | Full connection string |
| `DB_POOL_MIN` | `2` | Min pool connections |
| `DB_POOL_MAX` | `10` | Max pool connections |
| `DB_CONNECT_TIMEOUT` | `10000` | Connection timeout (ms) |

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `REDIS_CLUSTER_NODES` | — | Comma-separated cluster nodes (optional) |

## Elasticsearch / OpenSearch

| Variable | Default | Description |
|----------|---------|-------------|
| `ELASTICSEARCH_URL` | `http://localhost:9200` | ES endpoint |
| `ELASTICSEARCH_USERNAME` | — | Username (if auth enabled) |
| `ELASTICSEARCH_PASSWORD` | — | Password |
| `ELASTICSEARCH_CA_CERT` | — | Path to CA cert for TLS |
| `ELASTICSEARCH_VERIFY_CERTS` | `true` | Verify TLS certs |
| `ELASTICSEARCH_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |
| `ELASTICSEARCH_MAX_RETRIES` | `3` | Max retries |
| `ES_INDEX_PREFIX` | `luma` | Index name prefix |
| `ES_NUMBER_OF_SHARDS` | `1` | Primary shards per index |
| `ES_NUMBER_OF_REPLICAS` | `0` | Replica shards |
| `ES_REFRESH_INTERVAL` | `1s` | Index refresh interval |

## Authentication & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | **required** | Min 32 chars, for access tokens |
| `JWT_EXPIRES_IN` | `15m` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `API_KEY_PREFIX` | `luma_` | API key prefix |
| `API_KEY_HASH_ROUNDS` | `12` | bcrypt rounds for API key hashing |
| `BCRYPT_ROUNDS` | `12` | Password hashing rounds |
| `SESSION_SECRET` | **required** | Min 32 chars, for admin sessions |
| `SESSION_COOKIE_NAME` | `luma_session` | Session cookie name |
| `SESSION_COOKIE_SECURE` | `false` | Set `true` in production with HTTPS |
| `SESSION_COOKIE_SAME_SITE` | `lax` | `strict` \| `lax` \| `none` |
| `CSRF_SECRET` | **required** | CSRF protection secret |
| `ENCRYPTION_KEY` | — | 32-byte base64 key for AES-256-GCM |

## Email (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | — | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASSWORD` | — | SMTP password |
| `SMTP_FROM` | `noreply@luma-search.local` | From address |
| `SMTP_TLS` | `true` | Use TLS |

## Crawler

| Variable | Default | Description |
|----------|---------|-------------|
| `CRAWLER_USER_AGENT` | `LumaSearch/0.1 (+https://github.com/luma-search/luma-search)` | User-Agent header |
| `CRAWLER_MAX_CONCURRENT` | `10` | Global concurrent fetches |
| `CRAWLER_PER_DOMAIN_CONCURRENT` | `2` | Per-domain concurrent fetches |
| `CRAWLER_POLITENESS_DELAY` | `1000` | Min delay between requests (ms) |
| `CRAWLER_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |
| `CRAWLER_MAX_REDIRECTS` | `10` | Max redirect hops |
| `CRAWLER_MAX_CONTENT_SIZE` | `10485760` | Max compressed size (10MB) |
| `CRAWLER_MAX_DECOMPRESSED_SIZE` | `52428800` | Max decompressed size (50MB) |
| `CRAWLER_RESPECT_ROBOTS_TXT` | `true` | Obey robots.txt |
| `CRAWLER_CRAWL_DELAY_MS` | `1000` | Delay from robots.txt |
| `CRAWLER_ALLOWED_DOMAINS` | — | Comma-separated allowlist |
| `CRAWLER_BLOCKED_DOMAINS` | — | Comma-separated blocklist |
| `CRAWLER_SEED_URLS` | — | Comma-separated seed URLs |
| `CRAWLER_BLOCK_PRIVATE_IPS` | `true` | SSRF protection |
| `CRAWLER_DNS_REBINDING_PROTECTION` | `true` | DNS rebinding guard |
| `CRAWLER_MAX_URL_LENGTH` | `2048` | Max URL length |
| `CRAWLER_MAX_PARAMS` | `50` | Max query params |

## Embeddings

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_PROVIDER` | `local` | `local` \| `openai` \| `cohere` \| `voyage` |
| `EMBEDDING_LOCAL_URL` | `http://localhost:8000` | Python service URL |
| `EMBEDDING_LOCAL_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Model name |
| `EMBEDDING_LOCAL_BATCH_SIZE` | `32` | Batch size |
| `EMBEDDING_LOCAL_DIMENSIONS` | `384` | Vector dimensions |
| `OPENAI_API_KEY` | — | For OpenAI embeddings |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Model |
| `OPENAI_EMBEDDING_DIMENSIONS` | `1536` | Dimensions |
| `OPENAI_EMBEDDING_BATCH_SIZE` | `100` | Batch size |
| `COHERE_API_KEY` | — | For Cohere |
| `COHERE_EMBEDDING_MODEL` | `embed-english-v3.0` | Model |
| `COHERE_EMBEDDING_DIMENSIONS` | `1024` | Dimensions |
| `VOYAGE_API_KEY` | — | For Voyage |
| `VOYAGE_EMBEDDING_MODEL` | `voyage-3` | Model |
| `VOYAGE_EMBEDDING_DIMENSIONS` | `1024` | Dimensions |
| `EMBEDDING_CACHE_TTL` | `86400` | Cache TTL (seconds) |
| `EMBEDDING_CACHE_MAX_SIZE` | `100000` | Max cache entries |

## LLM / AI Answers

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `disabled` | `openai` \| `anthropic` \| `ollama` \| `vertex` \| `bedrock` \| `disabled` |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `OPENAI_CHAT_MODEL` | `gpt-4o-mini` | Chat model |
| `OPENAI_MAX_TOKENS` | `4096` | Max output tokens |
| `OPENAI_TEMPERATURE` | `0.1` | Temperature |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `ANTHROPIC_CHAT_MODEL` | `claude-3-haiku-20240307` | Model |
| `ANTHROPIC_MAX_TOKENS` | `4096` | Max tokens |
| `ANTHROPIC_TEMPERATURE` | `0.1` | Temperature |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama URL |
| `OLLAMA_CHAT_MODEL` | `llama3.1:8b` | Chat model |
| `OLLAMA_EMBEDDING_MODEL` | `nomic-embed-text` | Embedding model |
| `VERTEX_AI_PROJECT` | — | GCP project |
| `VERTEX_AI_LOCATION` | `us-central1` | GCP location |
| `VERTEX_AI_CHAT_MODEL` | `gemini-1.5-flash` | Model |
| `AWS_REGION` | `us-east-1` | AWS region |
| `AWS_ACCESS_KEY_ID` | — | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | — | AWS secret key |
| `BEDROCK_CHAT_MODEL` | `anthropic.claude-3-haiku-20240307-v1:0` | Bedrock model |
| `ANSWER_MAX_EVIDENCE_PASSAGES` | `10` | Max passages for answer |
| `ANSWER_MAX_EVIDENCE_TOKENS` | `8000` | Max evidence tokens |
| `ANSWER_TOKEN_BUDGET` | `2000` | Output token budget |
| `ANSWER_TIMEOUT_MS` | `30000` | Generation timeout |
| `ANSWER_CACHE_TTL` | `3600` | Answer cache TTL (seconds) |
| `ANSWER_ENABLE_RESEARCH_MODE` | `true` | Enable research mode |
| `ANSWER_ENABLE_CITATIONS` | `true` | Enable citations |
| `ANSWER_PROMPT_INJECTION_DEFENSE` | `true` | Sanitize evidence |

## Search & Ranking

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_DEFAULT_LIMIT` | `10` | Default results per page |
| `SEARCH_MAX_LIMIT` | `100` | Max results per page |
| `SEARCH_DEFAULT_RANKING_PROFILE` | `hybrid` | Default ranking profile |
| `SEARCH_ENABLE_HYBRID` | `true` | Enable hybrid search |
| `SEARCH_HYBRID_RRF_K` | `60` | RRF rank constant |
| `SEARCH_HYBRID_RRF_WINDOW` | `100` | RRF window size |
| `SEARCH_ENABLE_QUERY_EXPANSION` | `true` | Enable query expansion |
| `SEARCH_ENABLE_SPELL_CORRECTION` | `true` | Enable spell correction |
| `SEARCH_HIGHLIGHT_FRAGMENT_SIZE` | `150` | Highlight fragment size |
| `SEARCH_HIGHLIGHT_NUM_FRAGMENTS` | `3` | Number of fragments |

## Queue (BullMQ)

| Variable | Default | Description |
|----------|---------|-------------|
| `QUEUE_CONCURRENCY` | `5` | Default worker concurrency |
| `QUEUE_MAX_RETRIES` | `3` | Max job retries |
| `QUEUE_BACKOFF_MS` | `5000` | Initial backoff (ms) |
| `QUEUE_BACKOFF_TYPE` | `exponential` | `exponential` \| `fixed` |
| `QUEUE_RATE_LIMIT_MAX` | `100` | Rate limit max |
| `QUEUE_RATE_LIMIT_WINDOW` | `60000` | Rate limit window (ms) |

## Telemetry & Observability

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` |
| `LOG_FORMAT` | `json` | `json` \| `pretty` |
| `LOG_PRETTY_PRINT` | `false` | Pretty print in development |
| `OTEL_ENABLED` | `false` | Enable OpenTelemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP endpoint |
| `OTEL_SERVICE_NAME` | `luma-search` | Service name |
| `OTEL_SAMPLING_RATIO` | `0.1` | Trace sampling ratio |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics |
| `METRICS_PORT` | `9090` | Metrics port |
| `METRICS_PATH` | `/metrics` | Metrics path |
| `HEALTH_CHECK_INTERVAL` | `30000` | Health check interval (ms) |

## Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `FEATURE_AI_ANSWERS` | `false` | Enable AI answers |
| `FEATURE_RESEARCH_WORKSPACE` | `false` | Enable research workspaces |
| `FEATURE_CRAWL_SCHEDULER` | `true` | Enable crawl scheduler |
| `FEATURE_VERTICAL_SEARCH` | `false` | Enable vertical search |
| `FEATURE_ADMIN_DASHBOARD` | `true` | Enable admin dashboard |
| `FEATURE_MULTI_TENANCY` | `false` | Enable multi-tenancy |
| `FEATURE_BILLING` | `false` | Enable billing |

## Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests/window |
| `RATE_LIMIT_SEARCH_MAX` | `30` | Search max/window |
| `RATE_LIMIT_CRAWL_MAX` | `10` | Crawl max/window |
| `RATE_LIMIT_AUTH_MAX` | `5` | Auth max/window |

## Storage (S3-compatible)

| Variable | Default | Description |
|----------|---------|-------------|
| `S3_ENDPOINT` | — | S3 endpoint (e.g., MinIO) |
| `S3_REGION` | `us-east-1` | Region |
| `S3_ACCESS_KEY_ID` | — | Access key |
| `S3_SECRET_ACCESS_KEY` | — | Secret key |
| `S3_BUCKET` | `luma-search` | Bucket name |
| `S3_FORCE_PATH_STYLE` | `false` | Force path style |

## Demo / Development

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_DEMO_DATA` | `false` | Auto-seed demo corpus |
| `DEMO_CORPUS_URL` | `https://demo-data.luma-search.dev/corpus.json.gz` | Demo corpus URL |
| `SKIP_EXTERNAL_SERVICES` | `false` | Run without ES/Redis/Postgres |
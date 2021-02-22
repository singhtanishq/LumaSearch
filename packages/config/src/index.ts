import { z } from 'zod';

/**
 * Application environment schema
 */
export const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().default('LumaSearch'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  ADMIN_URL: z.string().url().default('http://localhost:4001'),
});

/**
 * Database environment schema
 */
export const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DB_POOL_MIN: z.coerce.number().int().min(1).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  DB_CONNECT_TIMEOUT: z.coerce.number().int().min(1000).default(10000),
});

/**
 * Redis environment schema
 */
export const redisEnvSchema = z.object({
  REDIS_URL: z.string().url().default('redis://localhost:6379/0'),
  REDIS_CLUSTER_NODES: z.string().optional(),
});

/**
 * Elasticsearch environment schema
 */
export const elasticsearchEnvSchema = z.object({
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_CA_CERT: z.string().optional(),
  ELASTICSEARCH_VERIFY_CERTS: z.coerce.boolean().default(true),
  ELASTICSEARCH_REQUEST_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
  ELASTICSEARCH_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  ES_INDEX_PREFIX: z.string().default('luma'),
  ES_NUMBER_OF_SHARDS: z.coerce.number().int().min(1).default(1),
  ES_NUMBER_OF_REPLICAS: z.coerce.number().int().min(0).default(0),
  ES_REFRESH_INTERVAL: z.string().default('1s'),
});

/**
 * Authentication environment schema
 */
export const authEnvSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  API_KEY_PREFIX: z.string().default('luma_'),
  API_KEY_HASH_ROUNDS: z.coerce.number().int().min(10).default(12),
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).default(12),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('luma_session'),
  SESSION_COOKIE_SECURE: z.coerce.boolean().default(false),
  SESSION_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
  CSRF_SECRET: z.string().min(32),
});

/**
 * Encryption environment schema
 */
export const encryptionEnvSchema = z.object({
  ENCRYPTION_KEY: z.string().optional(),
});

/**
 * Email environment schema
 */
export const emailEnvSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().default('noreply@luma-search.local'),
  SMTP_TLS: z.coerce.boolean().default(true),
});

/**
 * Crawler environment schema
 */
export const crawlerEnvSchema = z.object({
  CRAWLER_USER_AGENT: z
    .string()
    .default('LumaSearch/0.1 (+https://github.com/luma-search/luma-search)'),
  CRAWLER_MAX_CONCURRENT: z.coerce.number().int().min(1).default(10),
  CRAWLER_PER_DOMAIN_CONCURRENT: z.coerce.number().int().min(1).default(2),
  CRAWLER_POLITENESS_DELAY: z.coerce.number().int().min(0).default(1000),
  CRAWLER_REQUEST_TIMEOUT: z.coerce.number().int().min(1000).default(30000),
  CRAWLER_MAX_REDIRECTS: z.coerce.number().int().min(0).default(10),
  CRAWLER_MAX_CONTENT_SIZE: z.coerce.number().int().min(1024).default(10485760),
  CRAWLER_MAX_DECOMPRESSED_SIZE: z.coerce.number().int().min(1024).default(52428800),
  CRAWLER_RESPECT_ROBOTS_TXT: z.coerce.boolean().default(true),
  CRAWLER_CRAWL_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  CRAWLER_ALLOWED_DOMAINS: z.string().optional(),
  CRAWLER_BLOCKED_DOMAINS: z.string().optional(),
  CRAWLER_SEED_URLS: z.string().optional(),
  CRAWLER_BLOCK_PRIVATE_IPS: z.coerce.boolean().default(true),
  CRAWLER_DNS_REBINDING_PROTECTION: z.coerce.boolean().default(true),
  CRAWLER_MAX_URL_LENGTH: z.coerce.number().int().min(256).default(2048),
  CRAWLER_MAX_PARAMS: z.coerce.number().int().min(1).default(50),
});

/**
 * Embeddings environment schema
 */
export const embeddingsEnvSchema = z.object({
  EMBEDDING_PROVIDER: z.enum(['local', 'openai', 'cohere', 'voyage']).default('local'),
  EMBEDDING_LOCAL_URL: z.string().url().default('http://localhost:8000'),
  EMBEDDING_LOCAL_MODEL: z.string().default('sentence-transformers/all-MiniLM-L6-v2'),
  EMBEDDING_LOCAL_BATCH_SIZE: z.coerce.number().int().min(1).default(32),
  EMBEDDING_LOCAL_DIMENSIONS: z.coerce.number().int().min(1).default(384),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).default(1536),
  OPENAI_EMBEDDING_BATCH_SIZE: z.coerce.number().int().min(1).default(100),
  COHERE_API_KEY: z.string().optional(),
  COHERE_EMBEDDING_MODEL: z.string().default('embed-english-v3.0'),
  COHERE_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).default(1024),
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_EMBEDDING_MODEL: z.string().default('voyage-3'),
  VOYAGE_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(1).default(1024),
  EMBEDDING_CACHE_TTL: z.coerce.number().int().min(60).default(86400),
  EMBEDDING_CACHE_MAX_SIZE: z.coerce.number().int().min(100).default(100000),
});

/**
 * LLM environment schema
 */
export const llmEnvSchema = z.object({
  LLM_PROVIDER: z
    .enum(['openai', 'anthropic', 'ollama', 'vertex', 'bedrock', 'disabled'])
    .default('disabled'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_MAX_TOKENS: z.coerce.number().int().min(1).default(4096),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_CHAT_MODEL: z.string().default('claude-3-haiku-20240307'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().min(1).default(4096),
  ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('llama3.1:8b'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  VERTEX_AI_PROJECT: z.string().optional(),
  VERTEX_AI_LOCATION: z.string().default('us-central1'),
  VERTEX_AI_CHAT_MODEL: z.string().default('gemini-1.5-flash'),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_CHAT_MODEL: z.string().default('anthropic.claude-3-haiku-20240307-v1:0'),
  ANSWER_MAX_EVIDENCE_PASSAGES: z.coerce.number().int().min(1).default(10),
  ANSWER_MAX_EVIDENCE_TOKENS: z.coerce.number().int().min(100).default(8000),
  ANSWER_TOKEN_BUDGET: z.coerce.number().int().min(100).default(2000),
  ANSWER_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30000),
  ANSWER_CACHE_TTL: z.coerce.number().int().min(60).default(3600),
  ANSWER_ENABLE_RESEARCH_MODE: z.coerce.boolean().default(true),
  ANSWER_ENABLE_CITATIONS: z.coerce.boolean().default(true),
  ANSWER_PROMPT_INJECTION_DEFENSE: z.coerce.boolean().default(true),
});

/**
 * Search environment schema
 */
export const searchEnvSchema = z.object({
  SEARCH_DEFAULT_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  SEARCH_MAX_LIMIT: z.coerce.number().int().min(1).max(1000).default(100),
  SEARCH_DEFAULT_RANKING_PROFILE: z.string().default('hybrid'),
  SEARCH_ENABLE_HYBRID: z.coerce.boolean().default(true),
  SEARCH_HYBRID_RRF_K: z.coerce.number().int().min(1).default(60),
  SEARCH_HYBRID_RRF_WINDOW: z.coerce.number().int().min(1).default(100),
  SEARCH_ENABLE_QUERY_EXPANSION: z.coerce.boolean().default(true),
  SEARCH_ENABLE_SPELL_CORRECTION: z.coerce.boolean().default(true),
  SEARCH_HIGHLIGHT_FRAGMENT_SIZE: z.coerce.number().int().min(50).default(150),
  SEARCH_HIGHLIGHT_NUM_FRAGMENTS: z.coerce.number().int().min(1).default(3),
  SEARCH_RANKING_PROFILES: z.string().optional(),
});

/**
 * Queue environment schema
 */
export const queueEnvSchema = z.object({
  QUEUE_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  QUEUE_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  QUEUE_BACKOFF_MS: z.coerce.number().int().min(100).default(5000),
  QUEUE_BACKOFF_TYPE: z.enum(['exponential', 'fixed']).default('exponential'),
  QUEUE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(100),
  QUEUE_RATE_LIMIT_WINDOW: z.coerce.number().int().min(1000).default(60000),
  QUEUE_CRAWL_FETCH: z.string().default('crawl:fetch'),
  QUEUE_CRAWL_PARSE: z.string().default('crawl:parse'),
  QUEUE_INDEX_INGEST: z.string().default('index:ingest'),
  QUEUE_EMBED_GENERATE: z.string().default('embed:generate'),
  QUEUE_ANSWER_GENERATE: z.string().default('answer:generate'),
  QUEUE_ANALYTICS_AGGREGATE: z.string().default('analytics:aggregate'),
});

/**
 * Telemetry environment schema
 */
export const telemetryEnvSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  LOG_PRETTY_PRINT: z.coerce.boolean().default(false),
  OTEL_ENABLED: z.coerce.boolean().default(false),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('luma-search'),
  OTEL_SAMPLING_RATIO: z.coerce.number().min(0).max(1).default(0.1),
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9090),
  METRICS_PATH: z.string().default('/metrics'),
  HEALTH_CHECK_INTERVAL: z.coerce.number().int().min(1000).default(30000),
});

/**
 * Feature flags environment schema
 */
export const featureFlagsEnvSchema = z.object({
  FEATURE_AI_ANSWERS: z.coerce.boolean().default(false),
  FEATURE_RESEARCH_WORKSPACE: z.coerce.boolean().default(false),
  FEATURE_CRAWL_SCHEDULER: z.coerce.boolean().default(true),
  FEATURE_VERTICAL_SEARCH: z.coerce.boolean().default(false),
  FEATURE_ADMIN_DASHBOARD: z.coerce.boolean().default(true),
  FEATURE_MULTI_TENANCY: z.coerce.boolean().default(false),
  FEATURE_BILLING: z.coerce.boolean().default(false),
});

/**
 * Rate limiting environment schema
 */
export const rateLimitEnvSchema = z.object({
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(100),
  RATE_LIMIT_SEARCH_MAX: z.coerce.number().int().min(1).default(30),
  RATE_LIMIT_CRAWL_MAX: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).default(5),
});

/**
 * Storage environment schema
 */
export const storageEnvSchema = z.object({
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().default('luma-search'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
});

/**
 * Demo/Development environment schema
 */
export const demoEnvSchema = z.object({
  SEED_DEMO_DATA: z.coerce.boolean().default(false),
  DEMO_CORPUS_URL: z.string().url().default('https://demo-data.luma-search.dev/corpus.json.gz'),
  SKIP_EXTERNAL_SERVICES: z.coerce.boolean().default(false),
});

/**
 * Combined environment schema
 */
export const envSchema = z.object({
  ...appEnvSchema.shape,
  ...databaseEnvSchema.shape,
  ...redisEnvSchema.shape,
  ...elasticsearchEnvSchema.shape,
  ...authEnvSchema.shape,
  ...encryptionEnvSchema.shape,
  ...emailEnvSchema.shape,
  ...crawlerEnvSchema.shape,
  ...embeddingsEnvSchema.shape,
  ...llmEnvSchema.shape,
  ...searchEnvSchema.shape,
  ...queueEnvSchema.shape,
  ...telemetryEnvSchema.shape,
  ...featureFlagsEnvSchema.shape,
  ...rateLimitEnvSchema.shape,
  ...storageEnvSchema.shape,
  ...demoEnvSchema.shape,
});

/**
 * Type inference from the schema
 */
export type AppEnv = z.infer<typeof appEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type RedisEnv = z.infer<typeof redisEnvSchema>;
export type ElasticsearchEnv = z.infer<typeof elasticsearchEnvSchema>;
export type AuthEnv = z.infer<typeof authEnvSchema>;
export type EncryptionEnv = z.infer<typeof encryptionEnvSchema>;
export type EmailEnv = z.infer<typeof emailEnvSchema>;
export type CrawlerEnv = z.infer<typeof crawlerEnvSchema>;
export type EmbeddingsEnv = z.infer<typeof embeddingsEnvSchema>;
export type LLMEnv = z.infer<typeof llmEnvSchema>;
export type SearchEnv = z.infer<typeof searchEnvSchema>;
export type QueueEnv = z.infer<typeof queueEnvSchema>;
export type TelemetryEnv = z.infer<typeof telemetryEnvSchema>;
export type FeatureFlagsEnv = z.infer<typeof featureFlagsEnvSchema>;
export type RateLimitEnv = z.infer<typeof rateLimitEnvSchema>;
export type StorageEnv = z.infer<typeof storageEnvSchema>;
export type DemoEnv = z.infer<typeof demoEnvSchema>;
export type Env = z.infer<typeof envSchema>;

/**
 * Format a Zod validation error into a human-readable message
 */
function formatZodError(error: z.ZodError): string {
  const errors = error.flatten();
  return [
    'Environment validation failed:',
    ...Object.entries(errors.fieldErrors).flatMap(([field, messages]) =>
      (messages ?? []).map((msg) => `  ${field}: ${msg}`)
    ),
    ...errors.formErrors.map((msg) => `  ${msg}`),
  ].join('\n');
}

/**
 * Validate and parse environment variables
 */
export function validateEnv(config: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

/**
 * Validate a subset of environment variables
 */
export function validateEnvPartial<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  config: Record<string, string | undefined> = process.env
): z.infer<z.ZodObject<T>> {
  const result = schema.safeParse(config);
  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }
  return result.data;
}

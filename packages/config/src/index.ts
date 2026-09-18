import { z } from 'zod';

// ============================================================
// Base Environment Schema
// ============================================================

const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

// ============================================================
// Database Configuration
// ============================================================

const DatabaseSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgresql://'),
  DATABASE_POOL_SIZE: z.coerce.number().int().positive().default(20),
  DATABASE_SSL: z.coerce.boolean().default(false),
  DATABASE_MIGRATION_TABLE: z.string().default('_prisma_migrations'),
});

// ============================================================
// Redis Configuration
// ============================================================

const RedisSchema = z.object({
  REDIS_URL: z.string().url().startsWith('redis://'),
  REDIS_TLS: z.coerce.boolean().default(false),
  REDIS_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  REDIS_RETRY_DELAY: z.coerce.number().int().positive().default(100),
  QUEUE_PREFIX: z.string().default('lumasearch'),
  QUEUE_DEFAULT_JOB_OPTIONS: z.string().default('{"attempts":3,"backoff":{"type":"exponential","delay":5000},"removeOnComplete":100,"removeOnFail":500}'),
});

// ============================================================
// Elasticsearch Configuration
// ============================================================

const ElasticsearchSchema = z.object({
  ELASTICSEARCH_URL: z.string().url(),
  ELASTICSEARCH_USERNAME: z.string().optional(),
  ELASTICSEARCH_PASSWORD: z.string().optional(),
  ELASTICSEARCH_API_KEY: z.string().optional(),
  ELASTICSEARCH_CA_CERT_PATH: z.string().optional(),
  ELASTICSEARCH_REQUEST_TIMEOUT: z.coerce.number().int().positive().default(30000),
  ELASTICSEARCH_SNIFF_INTERVAL: z.coerce.number().int().positive().default(300000),
  ELASTICSEARCH_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  ES_INDEX_PREFIX: z.string().default('lumasearch'),
  ES_NUMBER_OF_SHARDS: z.coerce.number().int().positive().default(1),
  ES_NUMBER_OF_REPLICAS: z.coerce.number().int().nonnegative().default(0),
  ES_REFRESH_INTERVAL: z.string().default('1s'),
});

// ============================================================
// Embedding Configuration
// ============================================================

const EmbeddingProviderSchema = z.enum(['local', 'openai', 'cohere', 'voyage']);

const EmbeddingSchema = z.object({
  EMBEDDING_PROVIDER: EmbeddingProviderSchema.default('local'),
  
  // Local
  LOCAL_EMBEDDING_URL: z.string().url().default('http://localhost:8000'),
  LOCAL_EMBEDDING_MODEL: z.string().default('sentence-transformers/all-mpnet-base-v2'),
  LOCAL_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  LOCAL_EMBEDDING_BATCH_SIZE: z.coerce.number().int().positive().default(32),
  LOCAL_EMBEDDING_MAX_LENGTH: z.coerce.number().int().positive().default(512),
  
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),
  OPENAI_ORGANIZATION: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  
  // Cohere
  COHERE_API_KEY: z.string().optional(),
  COHERE_EMBEDDING_MODEL: z.string().default('embed-english-v3.0'),
  COHERE_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
  
  // Voyage
  VOYAGE_API_KEY: z.string().optional(),
  VOYAGE_EMBEDDING_MODEL: z.string().default('voyage-2'),
  VOYAGE_EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),
});

// ============================================================
// LLM Configuration
// ============================================================

const LLMProviderSchema = z.enum(['openai', 'anthropic', 'ollama', 'vertex', 'bedrock', 'disabled']);

const LLMSchema = z.object({
  LLM_PROVIDER: LLMProviderSchema.default('disabled'),
  
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  OPENAI_TIMEOUT: z.coerce.number().int().positive().default(60000),
  
  // Anthropic
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_CHAT_MODEL: z.string().default('claude-3-haiku-20240307'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(4096),
  ANTHROPIC_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.1),
  
  // Ollama
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('llama3.1:8b'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  
  // Vertex AI
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_LOCATION: z.string().default('us-central1'),
  VERTEX_CHAT_MODEL: z.string().default('gemini-1.5-flash'),
  
  // Bedrock
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  BEDROCK_CHAT_MODEL: z.string().default('anthropic.claude-3-haiku-20240307-v1:0'),
  
  // Answer Generation
  ANSWER_MAX_EVIDENCE_PASSAGES: z.coerce.number().int().positive().default(10),
  ANSWER_MAX_EVIDENCE_CHARS: z.coerce.number().int().positive().default(8000),
  ANSWER_TOKEN_BUDGET: z.coerce.number().int().positive().default(2000),
  ANSWER_CACHE_TTL: z.coerce.number().int().positive().default(3600),
  ANSWER_COST_LIMIT_USD: z.coerce.number().positive().default(0.10),
});

// ============================================================
// Crawler Configuration
// ============================================================

const CrawlerSchema = z.object({
  CRAWLER_USER_AGENT: z.string().default('LumaSearch/0.1 (+https://lumasearch.example.com/bot)'),
  CRAWLER_MAX_CONCURRENT_REQUESTS: z.coerce.number().int().positive().default(10),
  CRAWLER_MAX_CONCURRENT_PER_DOMAIN: z.coerce.number().int().positive().default(2),
  CRAWLER_REQUEST_TIMEOUT: z.coerce.number().int().positive().default(30000),
  CRAWLER_MAX_RESPONSE_SIZE: z.coerce.number().int().positive().default(10485760),
  CRAWLER_MAX_REDIRECTS: z.coerce.number().int().positive().default(10),
  CRAWLER_POLITENESS_DELAY: z.coerce.number().int().nonnegative().default(1000),
  CRAWLER_RESPECT_ROBOTS_TXT: z.coerce.boolean().default(true),
  CRAWLER_FOLLOW_NO_FOLLOW: z.coerce.boolean().default(false),
  CRAWLER_INDEX_NO_INDEX: z.coerce.boolean().default(false),
  CRAWLER_CRAWL_DELAY_MULTIPLIER: z.coerce.number().positive().default(1.0),
  
  // Playwright
  PLAYWRIGHT_BROWSER: z.enum(['chromium', 'firefox', 'webkit']).default('chromium'),
  PLAYWRIGHT_HEADLESS: z.coerce.boolean().default(true),
  PLAYWRIGHT_TIMEOUT: z.coerce.number().int().positive().default(60000),
  PLAYWRIGHT_MAX_CONCURRENT: z.coerce.number().int().positive().default(4),
  
  // Safety
  CRAWLER_BLOCK_PRIVATE_IPS: z.coerce.boolean().default(true),
  CRAWLER_ALLOWED_SCHEMES: z.string().default('http,https'),
  CRAWLER_MAX_DEPTH: z.coerce.number().int().positive().default(5),
  CRAWLER_URL_PARAM_LIMIT: z.coerce.number().int().positive().default(10),
  CRAWLER_TRAP_PATTERNS: z.string().default('calendar,page/\\d+,sort=,filter=,?page=\\d+'),
});

// ============================================================
// Search & Ranking Configuration
// ============================================================

const SearchSchema = z.object({
  DEFAULT_RANKING_PROFILE: z.string().default('hybrid'),
  RANKING_PROFILES: z.string().default('fastest,recent,primary-sources,technical,community,documentation,research,visual'),
  RRF_WINDOW_SIZE: z.coerce.number().int().positive().default(100),
  RRF_CONSTANT: z.coerce.number().int().positive().default(60),
  BM25_TITLE_WEIGHT: z.coerce.number().positive().default(3.0),
  BM25_HEADINGS_WEIGHT: z.coerce.number().positive().default(2.0),
  BM25_CONTENT_WEIGHT: z.coerce.number().positive().default(1.0),
  BM25_ANCHORS_WEIGHT: z.coerce.number().positive().default(1.5),
  BM25_URL_WEIGHT: z.coerce.number().positive().default(1.0),
  FRESHNESS_HALF_LIFE_DAYS: z.coerce.number().positive().default(365),
  FRESHNESS_BOOST_MAX: z.coerce.number().positive().default(2.0),
  DOMAIN_DIVERSITY_ENABLED: z.coerce.boolean().default(true),
  DOMAIN_DIVERSITY_FACTOR: z.coerce.number().min(0).max(1).default(0.3),
});

// ============================================================
// Authentication Configuration
// ============================================================

const AuthSchema = z.object({
  JWT_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().default('lumasearch'),
  JWT_AUDIENCE: z.string().default('lumasearch-api'),
  JWT_ACCESS_TOKEN_TTL: z.string().default('15m'),
  JWT_REFRESH_TOKEN_TTL: z.string().default('7d'),
  API_KEY_PREFIX: z.string().default('lms_'),
  API_KEY_HASH_ROUNDS: z.coerce.number().int().positive().default(12),
  OAUTH_GOOGLE_CLIENT_ID: z.string().optional(),
  OAUTH_GOOGLE_CLIENT_SECRET: z.string().optional(),
  OAUTH_GITHUB_CLIENT_ID: z.string().optional(),
  OAUTH_GITHUB_CLIENT_SECRET: z.string().optional(),
  OAUTH_MICROSOFT_CLIENT_ID: z.string().optional(),
  OAUTH_MICROSOFT_CLIENT_SECRET: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_NAME: z.string().default('lumasearch_session'),
  SESSION_COOKIE_SECURE: z.coerce.boolean().default(false),
  SESSION_COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),
});

// ============================================================
// Feature Flags
// ============================================================

const FeatureFlagsSchema = z.object({
  FF_AI_ANSWERS_ENABLED: z.coerce.boolean().default(false),
  FF_CRAWLER_ENABLED: z.coerce.boolean().default(true),
  FF_SEMANTIC_SEARCH_ENABLED: z.coerce.boolean().default(false),
  FF_RESEARCH_WORKSPACE_ENABLED: z.coerce.boolean().default(true),
  FF_ADMIN_DASHBOARD_ENABLED: z.coerce.boolean().default(true),
  FF_MULTI_TENANCY_ENABLED: z.coerce.boolean().default(false),
  FF_PUBLIC_REGISTRATION_ENABLED: z.coerce.boolean().default(false),
});

// ============================================================
// External Search Providers
// ============================================================

const ExternalProvidersSchema = z.object({
  BRAVE_API_KEY: z.string().optional(),
  BRAVE_SEARCH_ENABLED: z.coerce.boolean().default(false),
  SERPER_API_KEY: z.string().optional(),
  SERPER_ENABLED: z.coerce.boolean().default(false),
});

// ============================================================
// Telemetry Configuration
// ============================================================

const TelemetrySchema = z.object({
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().default('http://localhost:4318/v1/traces'),
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().url().default('http://localhost:4318/v1/metrics'),
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: z.string().url().default('http://localhost:4318/v1/logs'),
  OTEL_SERVICE_NAME: z.string().default('lumasearch'),
  OTEL_RESOURCE_ATTRIBUTES: z.string().default('deployment.environment=development'),
  OTEL_TRACES_SAMPLER: z.enum(['always_on', 'always_off', 'traceidratio', 'parentbased_traceidratio']).default('traceidratio'),
  OTEL_TRACES_SAMPLER_ARG: z.string().default('0.1'),
  PROMETHEUS_PORT: z.coerce.number().int().positive().default(9090),
  METRICS_PREFIX: z.string().default('lumasearch'),
  SENTRY_DSN: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default('development'),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),
});

// ============================================================
// Email Configuration
// ============================================================

const EmailSchema = z.object({
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('LumaSearch <noreply@lumasearch.example.com>'),
  SMTP_TLS: z.coerce.boolean().default(true),
});

// ============================================================
// Billing Configuration
// ============================================================

const BillingSchema = z.object({
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  BILLING_PROVIDER: z.enum(['stripe', 'paddle', 'lemonsqueezy']).default('stripe'),
});

// ============================================================
// Storage Configuration
// ============================================================

const StorageSchema = z.object({
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
});

// ============================================================
// Security Configuration
// ============================================================

const SecuritySchema = z.object({
  CORS_ORIGIN: z.string().default('http://localhost:3001,http://localhost:3002'),
  CSRF_SECRET: z.string().min(32),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_SEARCH_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_CRAWL_MAX: z.coerce.number().int().positive().default(10),
});

// ============================================================
// Demo Configuration
// ============================================================

const DemoSchema = z.object({
  SEED_DEMO_ON_STARTUP: z.coerce.boolean().default(false),
  DEMO_CORPUS_URL: z.string().url().optional(),
});

// ============================================================
// Complete Configuration
// ============================================================

export const EnvSchema = BaseEnvSchema
  .merge(DatabaseSchema)
  .merge(RedisSchema)
  .merge(ElasticsearchSchema)
  .merge(EmbeddingSchema)
  .merge(LLMSchema)
  .merge(CrawlerSchema)
  .merge(SearchSchema)
  .merge(AuthSchema)
  .merge(FeatureFlagsSchema)
  .merge(ExternalProvidersSchema)
  .merge(TelemetrySchema)
  .merge(EmailSchema)
  .merge(BillingSchema)
  .merge(StorageSchema)
  .merge(SecuritySchema)
  .merge(DemoSchema);

export type Env = z.infer<typeof EnvSchema>;

// ============================================================
// Configuration Loader
// ============================================================

let cachedConfig: Env | null = null;

export function loadConfig(overrides?: Partial<Env>): Env {
  if (cachedConfig && !overrides) {
    return cachedConfig;
  }
  
  const env = {
    ...process.env,
    ...overrides,
  };
  
  const result = EnvSchema.safeParse(env);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Configuration validation failed:\n${errors}`);
  }
  
  cachedConfig = result.data;
  return cachedConfig;
}

export function getConfig(): Env {
  if (!cachedConfig) {
    return loadConfig();
  }
  return cachedConfig;
}

export function resetConfig(): void {
  cachedConfig = null;
}

// ============================================================
// Feature Flag Helpers
// ============================================================

export function isFeatureEnabled(flag: keyof z.infer<typeof FeatureFlagsSchema>): boolean {
  const config = getConfig();
  return config[flag] === true;
}

export function requireFeature(flag: keyof z.infer<typeof FeatureFlagsSchema>): void {
  if (!isFeatureEnabled(flag)) {
    throw new Error(`Feature ${flag} is not enabled`);
  }
}
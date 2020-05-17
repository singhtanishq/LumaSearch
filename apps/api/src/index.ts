import fastify from 'fastify';
import fp from 'fastify-plugin';
import { Env, loadConfig, resetConfig } from '@luma-search/config';
import { createRequestLogger } from '@luma-search/telemetry';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import pino from 'pino';
import { createLogger, childLogger, logInfo, logWarn, logError } from '@luma-search/telemetry';

async function bootstrap() {
  // Load configuration
  const config = loadConfig();
  const logger = pino({
    level: config.LOG_LEVEL,
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    base: { service: config.OTEL_SERVICE_NAME },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-api-key"]'],
      censor: '[REDACTED]',
    },
  });
  
  // Create Fastify server
  const server = fastify({
    logger,
    maxParamNameChars: 200,
    maxQuerystringChars: 200,
  });
  
  // Register plugins
  await server.register(fastifyCors, {
    origin: config.CORS_ORIGIN.split(','),
  });
  
  await server.register(fastifyHelmet);
  await server.register(fastifyCompress);
  await server.register(fastifySensible);
  
  // JWT Authentication
  await server.register(fastifyJwt, {
    secret: config.JWT_SECRET,
    cookie: config.SESSION_COOKIE_NAME,
    timeout: config.JWT_ACCESS_TOKEN_TTL,
  });
  
  // Rate limiting
  await server.register(fastifyRateLimit, {
    max: config.RATE_LIMIT_MAX_REQUESTS,
    timeout: config.RATE_LIMIT_WINDOW_MS,
    group: (req) => req.ip || 'unknown',
    onLimitExceeded: (req, res) => {
      throw new Error('Rate limit exceeded');
    },
  });
  
  // Request correlation IDs and logging
  const requestLogger = createRequestLogger();
  server.addHook('onRequest', requestLogger);
  
  // Health check endpoint
  server.get('/health/live', async () => ({ status: 'ok' }));
  server.get('/health/ready', async () => {
    const { status } = await checkDependencies();
    return { status, checks: checkDependencies() };
  });
  
  // Metrics endpoint
  server.get('/metrics', async () => {
    // Return Prometheus metrics
    return {};
  });
  
  // Start server
  const port = config.API_PORT || 3000;
  await server.listen({ port, host: '0.0.0.0' });
  
  logger.info(`LumaSearch API listening on port ${port}`);
  
  return server;
}

async function checkDependencies() {
  // Check Elasticsearch, PostgreSQL, Redis connectivity
  return { status: 'healthy', checks: [] };
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  // Shut down gracefully
  process.exit(0);
});

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});

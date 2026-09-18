import fastify from 'fastify';
import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifySensible from '@fastify/sensible';
import fastifySw from '@fastify/swagger';
import fpSw from '@fastify/swagger';

async function main() {
  const app = fastify({
    logger: true,
  });

  await app.register(fastifyCors, {
    origin: true,
  });

  await app.register(fastifyHelmet);
  await app.register(fastifyCompress);
  await app.register(fastifySensible);

  // Swagger docs
  await app.register(fpSw, {
    routePrefix: '/docs',
    swagger: {
      info: {
        title: 'LumaSearch Admin API',
        description: 'Admin dashboard API for LumaSearch',
        version: '0.1.0',
      },
    },
    staticCSP: true,
    transformSwaggerObject: (swaggerObject) => {
      return swaggerObject;
    },
  });

  // Admin-specific endpoints
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({ status: 'ready' }));

  // API key management
  app.get('/api/keys', async () => ({ keys: [] }));

  // Crawl job management
  app.get('/api/crawl/jobs', async () => ({ jobs: [] }));

  // Index management
  app.get('/api/index', async () => ({ indexes: [] }));

  // Analytics
  app.get('/api/analytics', async () => ({ metrics: {} }));

  await app.listen({ port: 3002, host: '0.0.0.0' });
  console.log('LumaSearch Admin listening on port 3002');
}

main().catch((err) => {
  console.error('Admin app failed to start', err);
  process.exit(1);
});

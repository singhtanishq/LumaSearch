import fastify from 'fastify';
import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import fastifySensible from '@fastify/sensible';
import fastifySw from '@fastify/swagger-ui';
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
        title: 'LumaSearch API',
        description: 'Next-generation search platform API',
        version: '0.1.0',
      },
    },
    staticCSP: true,
    transformSwaggerObject: (swaggerObject) => {
      return swaggerObject;
    },
  });

  // Health checks
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({ status: 'ready' }));

  // Search endpoint
  app.get('/', async () => {
    return { message: 'LumaSearch Welcome' };
  });

  await app.listen({ port: 3001, host: '0.0.0.0' });
  console.log('LumaSearch Web listening on port 3001');
}

main().catch((err) => {
  console.error('Web app failed to start', err);
  process.exit(1);
});

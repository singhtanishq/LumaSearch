import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client singleton with sensible connection defaults.
 * In development, the client is cached on globalThis to survive hot reloads.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(
  options: { url?: string; log?: ('query' | 'info' | 'warn' | 'error')[] } = {}
): PrismaClient {
  return new PrismaClient({
    datasources: options.url ? { db: { url: options.url } } : undefined,
    log: options.log ?? ['warn', 'error'],
  });
}

export function getPrismaClient(
  options: { url?: string; log?: ('query' | 'info' | 'warn' | 'error')[] } = {}
): PrismaClient {
  if (process.env.NODE_ENV === 'production') {
    return createPrismaClient(options);
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient(options);
  }
  return globalForPrisma.prisma;
}

export async function checkDbHealth(
  prisma: PrismaClient
): Promise<{ status: 'ok' | 'down'; latencyMs: number }> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch {
    return { status: 'down', latencyMs: Date.now() - started };
  }
}

/**
 * LumaSearch local job queue — SQLite-backed, in-process workers.
 * Fully self-contained: no Redis required. Jobs persist across restarts.
 */
import { PrismaClient } from '@prisma/client';
import { createLogger } from '@luma-search/telemetry';

const log = createLogger({ service: 'queue' });

export type QueueName =
  | 'crawl:fetch'
  | 'crawl:parse'
  | 'index:ingest'
  | 'embed:generate'
  | 'answer:generate'
  | 'analytics:aggregate';

export interface JobPayload {
  [key: string]: unknown;
}

export interface JobHandler<T = JobPayload> {
  (data: T, job: { id: string; attempts: number }): Promise<void>;
}

export interface LocalQueueOptions {
  concurrency?: number;
  pollIntervalMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

export class LocalQueue {
  private handlers = new Map<QueueName, JobHandler>();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeCount = 0;
  private readonly concurrency: number;
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly backoffMs: number;

  constructor(
    private readonly prisma: PrismaClient,
    options: LocalQueueOptions = {}
  ) {
    this.concurrency = options.concurrency ?? 5;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.backoffMs = options.backoffMs ?? 5000;
  }

  /** Register a handler for a queue. */
  process<T = JobPayload>(queue: QueueName, handler: JobHandler<T>): void {
    this.handlers.set(queue, handler as JobHandler);
    log.info({ queue }, 'Handler registered');
  }

  /** Enqueue a job. */
  async add(
    queue: QueueName,
    payload: JobPayload,
    options: { delayMs?: number; priority?: number } = {}
  ): Promise<string> {
    const runAt = new Date(Date.now() + (options.delayMs ?? 0));
    const job = await this.prisma.job.create({
      data: {
        queue,
        payload: JSON.stringify(payload),
        status: 'waiting',
        priority: options.priority ?? 0,
        runAt,
        maxAttempts: this.maxAttempts,
      },
    });
    return job.id;
  }

  /** Start polling for jobs. */
  start(): void {
    if (this.running) return;
    this.running = true;
    log.info({ concurrency: this.concurrency }, 'Queue worker started');
    this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs);
    // Kick off immediately too
    this.poll();
  }

  /** Stop polling and wait for active jobs. */
  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    // Wait for active jobs to complete (max 10s)
    const deadline = Date.now() + 10_000;
    while (this.activeCount > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    log.info('Queue worker stopped');
  }

  /** Poll for waiting jobs and dispatch them. */
  private async poll(): Promise<void> {
    if (!this.running) return;
    while (this.activeCount < this.concurrency) {
      const job = await this.claimNext();
      if (!job) break;
      this.activeCount++;
      void this.execute(job).finally(() => {
        this.activeCount--;
      });
    }
  }

  /** Atomically claim the next waiting job. */
  private async claimNext() {
    // Find the highest-priority waiting job whose runAt has passed
    const candidates = await this.prisma.job.findMany({
      where: { status: 'waiting', runAt: { lte: new Date() } },
      orderBy: [{ priority: 'desc' }, { runAt: 'asc' }],
      take: 1,
    });
    const candidate = candidates[0];
    if (!candidate) return null;

    // Atomic claim: update to active only if still waiting
    const claimed = await this.prisma.job.updateMany({
      where: { id: candidate.id, status: 'waiting' },
      data: { status: 'active', startedAt: new Date() },
    });
    if (claimed.count === 0) return null; // Another worker got it
    return candidate;
  }

  /** Execute a claimed job with retry/backoff. */
  private async execute(job: {
    id: string;
    queue: string;
    payload: string;
    attempts: number;
  }): Promise<void> {
    const handler = this.handlers.get(job.queue as QueueName);
    const payload = JSON.parse(job.payload) as JobPayload;

    if (!handler) {
      log.warn({ queue: job.queue, jobId: job.id }, 'No handler for queue');
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'failed', lastError: 'No handler registered', finishedAt: new Date() },
      });
      return;
    }

    try {
      await handler(payload, { id: job.id, attempts: job.attempts + 1 });
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: 'completed', finishedAt: new Date() },
      });
      log.debug({ queue: job.queue, jobId: job.id }, 'Job completed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const attempts = job.attempts + 1;
      if (attempts >= this.maxAttempts) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { status: 'failed', lastError: message, attempts, finishedAt: new Date() },
        });
        log.error({ queue: job.queue, jobId: job.id, err: message }, 'Job failed permanently');
      } else {
        // Exponential backoff with jitter
        const delay = this.backoffMs * Math.pow(2, job.attempts) * (0.5 + Math.random() * 0.5);
        await this.prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'waiting',
            attempts,
            lastError: message,
            runAt: new Date(Date.now() + delay),
          },
        });
        log.warn(
          { queue: job.queue, jobId: job.id, attempt: attempts, err: message },
          'Job retry scheduled'
        );
      }
    }
  }

  /** Get queue depth stats. */
  async depths(): Promise<
    Record<string, { waiting: number; active: number; failed: number; completed: number }>
  > {
    const jobs = await this.prisma.job.groupBy({
      by: ['queue', 'status'],
      _count: { _all: true },
    });
    const out: Record<
      string,
      { waiting: number; active: number; failed: number; completed: number }
    > = {};
    for (const row of jobs) {
      const q = (out[row.queue] ??= { waiting: 0, active: 0, failed: 0, completed: 0 });
      if (row.status === 'waiting' || row.status === 'delayed') q.waiting += row._count._all;
      else if (row.status === 'active') q.active += row._count._all;
      else if (row.status === 'failed') q.failed += row._count._all;
      else if (row.status === 'completed') q.completed += row._count._all;
    }
    return out;
  }

  /** Clean up old completed jobs. */
  async clean(olderThanMs = 24 * 3600_000): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const res = await this.prisma.job.deleteMany({
      where: { status: 'completed', finishedAt: { lt: cutoff } },
    });
    return res.count;
  }
}

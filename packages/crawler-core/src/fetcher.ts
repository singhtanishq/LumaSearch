/**
 * Fetcher with robots.txt enforcement, per-host circuit breakers,
 * conditional requests, size limits, and redirect tracking.
 */
import { CircuitBreaker, withBackoff } from '@luma-search/utils';
import robotsParser from 'robots-parser';
import { resolveAndCheck } from './ssrf';

export interface FetcherOptions {
  userAgent: string;
  timeoutMs?: number;
  maxContentSize?: number;
  maxDecompressedSize?: number;
  maxRedirects?: number;
  respectRobots?: boolean;
  blockPrivateIps?: boolean;
  perDomainConcurrency?: number;
  politenessDelayMs?: number;
}

export interface FetchResult {
  ok: boolean;
  url: string;
  finalUrl: string;
  statusCode?: number;
  contentType?: string;
  contentLength?: number;
  body?: string;
  etag?: string;
  lastModified?: string;
  redirectChain: string[];
  latencyMs: number;
  error?: string;
  skipped?: 'robots' | 'private-ip' | 'circuit-open' | 'too-large';
}

interface RobotsCacheEntry {
  robots: ReturnType<typeof robotsParser> | null;
  fetchedAt: number;
}

export class Fetcher {
  private circuit = new CircuitBreaker({ threshold: 5, cooldownMs: 60_000 });
  private robotsCache = new Map<string, RobotsCacheEntry>();
  private lastFetchAt = new Map<string, number>();
  private activePerHost = new Map<string, number>();

  constructor(private readonly opts: Required<FetcherOptions>) {}

  async allowedByRobots(url: string): Promise<boolean> {
    if (!this.opts.respectRobots) return true;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    const origin = parsed.origin;
    let entry = this.robotsCache.get(origin);
    if (!entry || Date.now() - entry.fetchedAt > 30 * 60_000) {
      const robots = await this.fetchRobots(origin);
      entry = { robots, fetchedAt: Date.now() };
      this.robotsCache.set(origin, entry);
    }
    if (!entry.robots) return true; // no robots.txt → allowed
    return entry.robots.isAllowed(url, this.opts.userAgent) !== false;
  }

  crawlDelay(url: string): number {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return this.opts.politenessDelayMs;
    }
    const entry = this.robotsCache.get(parsed.origin);
    const delay = entry?.robots?.getCrawlDelay(this.opts.userAgent);
    const ms = delay !== undefined && delay > 0 ? delay * 1000 : this.opts.politenessDelayMs;
    return Math.min(ms, 30_000);
  }

  private async fetchRobots(origin: string): Promise<ReturnType<typeof robotsParser> | null> {
    try {
      const res = await fetch(`${origin}/robots.txt`, {
        headers: { 'user-agent': this.opts.userAgent },
        signal: AbortSignal.timeout(10_000),
        redirect: 'follow',
      });
      if (!res.ok) return null;
      const text = await res.text();
      return robotsParser(`${origin}/robots.txt`, text);
    } catch {
      return null;
    }
  }

  async fetch(
    url: string,
    conditional?: { etag?: string; lastModified?: string }
  ): Promise<FetchResult> {
    const result: FetchResult = {
      ok: false,
      url,
      finalUrl: url,
      redirectChain: [],
      latencyMs: 0,
    };
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      result.error = 'invalid URL';
      return result;
    }

    // Circuit breaker per host
    if (this.circuit.isOpen(parsed.host)) {
      result.skipped = 'circuit-open';
      result.error = `circuit open for ${parsed.host}`;
      return result;
    }

    // SSRF guard: resolve + check immediately before fetching
    const dnsCheck = await resolveAndCheck(parsed.hostname, {
      blockPrivateIps: this.opts.blockPrivateIps,
    });
    if (!dnsCheck.allowed) {
      result.skipped = 'private-ip';
      result.error = dnsCheck.reason;
      return result;
    }

    // Politeness delay per host
    const host = parsed.host;
    const last = this.lastFetchAt.get(host) ?? 0;
    const waitMs = Math.max(0, last + this.crawlDelay(url) - Date.now());
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    this.lastFetchAt.set(host, Date.now());

    const started = Date.now();
    try {
      const headers: Record<string, string> = {
        'user-agent': this.opts.userAgent,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      };
      if (conditional?.etag) headers['if-none-match'] = conditional.etag;
      if (conditional?.lastModified) headers['if-modified-since'] = conditional.lastModified;

      const res = await withBackoff(
        async () =>
          fetch(url, {
            headers,
            redirect: 'follow',
            signal: AbortSignal.timeout(this.opts.timeoutMs),
          }),
        { attempts: 3, initialMs: 500, maxMs: 5000 }
      );

      result.latencyMs = Date.now() - started;
      result.finalUrl = res.url || url;
      result.statusCode = res.status;

      const chain = [url, ...(res.url !== url ? [res.url] : [])];
      result.redirectChain = chain;

      const contentLength = Number(res.headers.get('content-length') ?? 0);
      result.contentLength = contentLength || undefined;
      result.contentType = res.headers.get('content-type') ?? undefined;
      result.etag = res.headers.get('etag') ?? undefined;
      result.lastModified = res.headers.get('last-modified') ?? undefined;

      if (res.status === 304) {
        result.ok = true;
        result.body = undefined;
        return result;
      }
      if (!res.ok) {
        result.error = `HTTP ${res.status}`;
        this.circuit.recordFailure(host);
        return result;
      }

      const totalLength = contentLength || Number.MAX_SAFE_INTEGER;
      if (contentLength > this.opts.maxContentSize) {
        result.skipped = 'too-large';
        result.error = `content-length ${contentLength} exceeds limit`;
        return result;
      }

      // Read body with a hard cap
      const reader = res.body?.getReader();
      if (!reader) {
        result.error = 'empty body';
        return result;
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      let tooLarge = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > this.opts.maxContentSize) {
          tooLarge = true;
          reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }
      if (tooLarge) {
        result.skipped = 'too-large';
        result.error = `decompressed body exceeds ${this.opts.maxContentSize} bytes`;
        return result;
      }
      void totalLength;
      const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
      result.body = buffer.toString('utf8');
      result.ok = true;
      this.circuit.recordSuccess(host);
      return result;
    } catch (err) {
      result.latencyMs = Date.now() - started;
      result.error = err instanceof Error ? err.message : String(err);
      this.circuit.recordFailure(host);
      return result;
    }
  }

  activeCount(host: string): number {
    return this.activePerHost.get(host) ?? 0;
  }
}

export function createFetcher(options: FetcherOptions): Fetcher {
  const defaults: Required<FetcherOptions> = {
    timeoutMs: 30_000,
    maxContentSize: 10 * 1024 * 1024,
    maxDecompressedSize: 50 * 1024 * 1024,
    maxRedirects: 10,
    respectRobots: true,
    blockPrivateIps: true,
    perDomainConcurrency: 2,
    politenessDelayMs: 1000,
    ...options,
  };
  return new Fetcher(defaults);
}

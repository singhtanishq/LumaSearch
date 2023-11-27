/**
 * Crawl orchestrator: BFS frontier with per-host politeness, trap detection,
 * dedup-by-canonical-URL, and output of normalized page payloads for ingestion.
 */
import { canonicalizeUrl, sameUrl } from '@luma-search/utils';
import { createFetcher, Fetcher } from './fetcher';
import { parseHtml } from './parser';
import { TrapDetector } from './traps';

export interface CrawledPage {
  url: string;
  finalUrl: string;
  html: string;
  statusCode: number;
  contentType?: string;
  crawledAt: string;
  depth: number;
  redirectChain: string[];
}

export interface OrchestratorOptions {
  userAgent: string;
  maxPages: number;
  maxDepth: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  respectRobots?: boolean;
  blockPrivateIps?: boolean;
  politenessDelayMs?: number;
  maxContentSize?: number;
  onPage?: (page: CrawledPage) => Promise<void> | void;
  onError?: (url: string, error: string) => Promise<void> | void;
  shouldStop?: () => boolean;
}

export class CrawlOrchestrator {
  private fetcher: Fetcher;
  private traps = new TrapDetector();
  private seen = new Set<string>();
  private stopped = false;

  constructor(private readonly opts: OrchestratorOptions) {
    this.fetcher = createFetcher({
      userAgent: opts.userAgent,
      respectRobots: opts.respectRobots ?? true,
      blockPrivateIps: opts.blockPrivateIps ?? true,
      politenessDelayMs: opts.politenessDelayMs ?? 1000,
      maxContentSize: opts.maxContentSize,
    });
  }

  stop(): void {
    this.stopped = true;
  }

  matchesPatterns(url: string): boolean {
    const { includePatterns, excludePatterns } = this.opts;
    if (excludePatterns?.some((p) => new RegExp(p).test(url))) return false;
    if (includePatterns?.length && !includePatterns.some((p) => new RegExp(p).test(url)))
      return false;
    return true;
  }

  /**
   * Crawl from seed URLs. Returns crawled pages; calls onPage as each completes.
   */
  async crawl(seeds: string[]): Promise<CrawledPage[]> {
    type QueueItem = { url: string; depth: number };
    const frontier: QueueItem[] = [];
    const pages: CrawledPage[] = [];

    for (const seed of seeds) {
      const canonical = canonicalizeUrl(seed);
      if (canonical && !this.seen.has(canonical)) {
        this.seen.add(canonical);
        frontier.push({ url: canonical, depth: 0 });
      }
    }

    while (frontier.length > 0 && !this.stopped) {
      if (this.opts.shouldStop?.()) break;
      if (pages.length >= this.opts.maxPages) break;

      // breadth-first: shallow URLs first, respecting politeness inside fetcher
      frontier.sort((a, b) => a.depth - b.depth);
      const item = frontier.shift();
      if (!item) break;

      const trap = this.traps.check(item.url, item.depth);
      if (trap) {
        await this.opts.onError?.(item.url, `trap: ${trap}`);
        continue;
      }
      if (!this.matchesPatterns(item.url)) continue;
      if (!(await this.fetcher.allowedByRobots(item.url))) {
        await this.opts.onError?.(item.url, 'blocked by robots.txt');
        continue;
      }

      const res = await this.fetcher.fetch(item.url);
      if (!res.ok) {
        await this.opts.onError?.(item.url, res.error ?? 'fetch failed');
        continue;
      }
      if (res.statusCode === 304 || !res.body) {
        // unchanged; do not re-enqueue links
        continue;
      }

      const page: CrawledPage = {
        url: item.url,
        finalUrl: res.finalUrl,
        html: res.body,
        statusCode: res.statusCode ?? 0,
        contentType: res.contentType,
        crawledAt: new Date().toISOString(),
        depth: item.depth,
        redirectChain: res.redirectChain,
      };
      pages.push(page);
      await this.opts.onPage?.(page);

      // Enqueue outlinks
      if (item.depth < this.opts.maxDepth && pages.length < this.opts.maxPages) {
        let parsedPage;
        try {
          parsedPage = parseHtml(res.body, res.finalUrl);
        } catch {
          continue;
        }
        for (const link of parsedPage.links) {
          const canonical = canonicalizeUrl(link.url);
          if (!canonical || this.seen.has(canonical)) continue;
          if (sameUrl(canonical, res.finalUrl)) continue;
          this.seen.add(canonical);
          frontier.push({ url: canonical, depth: item.depth + 1 });
        }
      }
    }

    return pages;
  }
}

export function crawlOrchestrator(opts: OrchestratorOptions): CrawlOrchestrator {
  return new CrawlOrchestrator(opts);
}

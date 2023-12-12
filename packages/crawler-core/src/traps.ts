/**
 * Crawl-trap detection: URL-pattern analysis to avoid infinite pagination,
 * calendar loops, and parameter explosion.
 */
export interface TrapConfig {
  maxUrlLength?: number;
  maxParams?: number;
  maxDepthSegments?: number;
  maxSamePatternUrls?: number;
  blockedExtensions?: string[];
  sessionParamPattern?: RegExp;
}

const DEFAULTS: Required<TrapConfig> = {
  maxUrlLength: 2048,
  maxParams: 50,
  maxDepthSegments: 12,
  maxSamePatternUrls: 100,
  blockedExtensions: [
    '.zip',
    '.tar',
    '.gz',
    '.bz2',
    '.7z',
    '.rar',
    '.exe',
    '.dmg',
    '.pkg',
    '.iso',
    '.img',
    '.mp4',
    '.mkv',
    '.avi',
    '.mov',
    '.mp3',
    '.flac',
    '.apk',
    '.deb',
    '.rpm',
    '.bin',
    '.woff',
    '.woff2',
    '.ttf',
    '.pdf.download',
  ],
  sessionParamPattern:
    /^(phpsessid|jsessionid|aspsessionid|sid|sessionid|session_id|cfid|cftoken)$/i,
};

export class TrapDetector {
  private config: Required<TrapConfig>;
  private patternCounts = new Map<string, number>();

  constructor(config: TrapConfig = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  /**
   * Returns null when URL is safe to crawl, or a reason string when trapped.
   */
  check(url: string, depth: number): string | null {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return 'malformed-url';
    }

    if (url.length > this.config.maxUrlLength) return 'url-too-long';
    if (parsed.pathname.split('/').length > this.config.maxDepthSegments) return 'too-deep-path';

    const params = Array.from(parsed.searchParams.entries());
    if (params.length > this.config.maxParams) return 'too-many-params';
    if (params.some(([k]) => this.config.sessionParamPattern.test(k))) return 'session-param';

    // Numeric calendar / pagination explosion: /2024/05/17/12/34 patterns
    const path = parsed.pathname;
    const numSegments = path.split('/').filter((s) => /^\d+$/.test(s)).length;
    if (numSegments >= 4) return 'calendar-trap';

    const lowerPath = path.toLowerCase();
    if (this.config.blockedExtensions.some((ext) => lowerPath.endsWith(ext))) {
      return 'blocked-extension';
    }

    // Pattern-frequency cap: normalize digits/ids → catch paginated loops
    const pattern = this.patternKey(parsed);
    const count = (this.patternCounts.get(pattern) ?? 0) + 1;
    this.patternCounts.set(pattern, count);
    if (count > this.config.maxSamePatternUrls) return 'pattern-explosion';

    if (depth > 30) return 'max-depth';
    return null;
  }

  private patternKey(parsed: URL): string {
    // Collapse digit runs and long hex/base64 segments to a bucket shape
    const pathShape = parsed.pathname
      .split('/')
      .map((seg) => (/^\d+$/.test(seg) ? '{n}' : /^[a-f0-9]{16,}$/i.test(seg) ? '{h}' : seg))
      .join('/');
    const paramKeys = Array.from(parsed.searchParams.keys()).sort().join(',');
    return `${parsed.host}${pathShape}?${paramKeys}`;
  }
}

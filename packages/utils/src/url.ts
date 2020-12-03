/**
 * URL normalization and canonicalization.
 * Strips tracking parameters, resolves relative URLs, bounds length.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'dclid',
  'twclid',
  'igshid',
  'mc_eid',
  '_ga',
  '_gl',
  'ref',
  'ref_src',
  'ref_url',
  'spm',
  'scm',
  'yclid',
  'vero_id',
  'wickedid',
  'hsa_cam',
  'hsa_grp',
  'hsa_ad',
  'mtm_source',
  'mtm_medium',
  'mtm_campaign',
  'pk_campaign',
  'pk_kwd',
]);

const FRAGMENT_ONLY_PARAMS = new Set(['share', 'fb_action_ids']);

export interface CanonicalUrlOptions {
  stripTrackingParams?: boolean;
  stripFragment?: boolean;
  stripWww?: boolean;
  forceHttps?: boolean;
  maxParams?: number;
  maxLength?: number;
}

const DEFAULTS: Required<CanonicalUrlOptions> = {
  stripTrackingParams: true,
  stripFragment: true,
  stripWww: false,
  forceHttps: false,
  maxParams: 50,
  maxLength: 2048,
};

/**
 * Canonicalize a URL: normalize case, sort query params, drop tracking noise.
 * Returns null for URLs that are not valid http(s).
 */
export function canonicalizeUrl(rawUrl: string, options: CanonicalUrlOptions = {}): string | null {
  const opts = { ...DEFAULTS, ...options };
  if (!rawUrl || rawUrl.length > opts.maxLength * 4) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;

  if (opts.forceHttps && parsed.protocol === 'http:') parsed.protocol = 'https:';
  if (opts.stripFragment) parsed.hash = '';
  if (opts.stripWww && parsed.hostname.startsWith('www.')) {
    parsed.hostname = parsed.hostname.slice(4);
  }

  if (opts.stripTrackingParams) {
    const keep: [string, string][] = [];
    for (const [key, value] of parsed.searchParams.entries()) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower)) continue;
      if (FRAGMENT_ONLY_PARAMS.has(lower) && value === '') continue;
      keep.push([key, value]);
    }
    parsed.search = '';
    for (const [k, v] of keep.slice(0, opts.maxParams)) {
      parsed.searchParams.append(k, v);
    }
  }

  // Normalize empty path
  if (parsed.pathname === '' || parsed.pathname === '/') {
    parsed.pathname = '/';
  }

  // Drop default ports
  if (parsed.port === '80' && parsed.protocol === 'http:') parsed.port = '';
  if (parsed.port === '443' && parsed.protocol === 'https:') parsed.port = '';

  // Trailing slash normalization for non-file paths
  if (
    parsed.pathname.length > 1 &&
    parsed.pathname.endsWith('/') &&
    !parsed.pathname.endsWith('//')
  ) {
    parsed.pathname = parsed.pathname.slice(0, -1);
  }

  return parsed.toString();
}

/**
 * Extract registrable domain (approximate: last two labels; handles common multi-part TLDs).
 */
const MULTIPART_TLDS = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'co.jp', 'co.kr', 'com.au', 'co.nz',
  'com.br', 'com.mx', 'co.in', 'com.tr', 'com.cn', 'com.tw', 'co.za', 'com.sg',
  'com.hk', 'org.au', 'net.au', 'gov.au', 'edu.au', 'co.il', 'com.ar', 'com.pl',
]);

export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const labels = host.split('.');
    if (labels.length < 2) return host;
    const lastTwo = labels.slice(-2).join('.');
    if (MULTIPART_TLDS.has(lastTwo) && labels.length >= 3) {
      return labels.slice(-3).join('.');
    }
    return lastTwo;
  } catch {
    return null;
  }
}

/**
 * Check whether two URLs are the same after canonicalization.
 */
export function sameUrl(a: string, b: string): boolean {
  const ca = canonicalizeUrl(a);
  const cb = canonicalizeUrl(b);
  return ca !== null && cb !== null && ca === cb;
}

/**
 * Validate a URL is http(s) and within bounds (for crawl input).
 */
export function isValidHttpUrl(url: string, maxLength = 2048): boolean {
  if (!url || url.length > maxLength) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
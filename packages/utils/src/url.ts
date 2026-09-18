// ============================================================
// URL Utilities
// ============================================================

import { URL as NodeURL } from 'node:url';

/**
 * Normalize a URL by:
 * - Lowercasing the hostname
 * - Removing default ports (80 for http, 443 for https)
 * - Removing fragment
 * - Sorting query parameters
 * - Removing tracking parameters (optional)
 * - Ensuring trailing slash consistency
 */
export function normalizeUrl(
  url: string,
  options: {
    removeTrackingParams?: boolean;
    removeFragment?: boolean;
    sortQueryParams?: boolean;
    ensureTrailingSlash?: boolean;
    trackingParams?: string[];
  } = {}
): string {
  const {
    removeTrackingParams = true,
    removeFragment = true,
    sortQueryParams = true,
    ensureTrailingSlash = false,
    trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'ref', 'source', 'campaign_id',
      '_ga', '_gl', 'mc_cid', 'mc_eid', 'yclid', 'dm_i',
    ],
  } = options;

  try {
    const parsed = new NodeURL(url);
    
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    
    // Remove default ports
    if ((parsed.protocol === 'http:' && parsed.port === '80') ||
        (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }
    
    // Remove fragment
    if (removeFragment) {
      parsed.hash = '';
    }
    
    // Sort and filter query parameters
    if (sortQueryParams || removeTrackingParams) {
      const params = new URLSearchParams(parsed.search);
      const entries: [string, string][] = [];
      
      for (const [key, value] of params.entries()) {
        if (removeTrackingParams && trackingParams.includes(key.toLowerCase())) {
          continue;
        }
        entries.push([key, value]);
      }
      
      if (sortQueryParams) {
        entries.sort(([a], [b]) => a.localeCompare(b));
      }
      
      parsed.search = new URLSearchParams(entries).toString();
    }
    
    // Ensure trailing slash for directory-like paths
    if (ensureTrailingSlash && parsed.pathname !== '/' && !parsed.pathname.includes('.') && !parsed.pathname.endsWith('/')) {
      parsed.pathname += '/';
    }
    
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Canonicalize a URL - more aggressive normalization for deduplication
 */
export function canonicalizeUrl(url: string): string {
  return normalizeUrl(url, {
    removeTrackingParams: true,
    removeFragment: true,
    sortQueryParams: true,
    ensureTrailingSlash: true,
  });
}

/**
 * Extract domain from URL
 */
export function extractDomain(url: string): string {
  try {
    return new NodeURL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Extract registrable domain (e.g., example.com from sub.example.com)
 * Uses a simple heuristic - in production use psl (public suffix list)
 */
export function extractRegistrableDomain(url: string): string {
  const hostname = extractDomain(url);
  const parts = hostname.split('.');
  
  if (parts.length <= 2) return hostname;
  
  // Common TLDs that have two parts (co.uk, com.au, etc.)
  const twoPartTlds = new Set([
    'co.uk', 'co.jp', 'co.kr', 'co.nz', 'co.za', 'co.il',
    'com.au', 'com.br', 'com.cn', 'com.hk', 'com.mx', 'com.my',
    'com.pe', 'com.ph', 'com.pk', 'com.sg', 'com.tw', 'com.vn',
    'org.uk', 'org.au', 'net.uk', 'net.au', 'gov.uk', 'gov.au',
    'edu.au', 'ac.uk', 'ac.jp', 'ac.nz', 'ac.za',
  ]);
  
  const lastTwo = parts.slice(-2).join('.');
  if (twoPartTlds.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  
  return parts.slice(-2).join('.');
}

/**
 * Check if URL is allowed (not private IP, not blocked scheme)
 */
export function isUrlAllowed(
  url: string,
  options: {
    allowedSchemes?: string[];
    blockPrivateIps?: boolean;
    blockLocalhost?: boolean;
  } = {}
): { allowed: boolean; reason?: string } {
  const { allowedSchemes = ['http', 'https'], blockPrivateIps = true, blockLocalhost = true } = options;
  
  try {
    const parsed = new NodeURL(url);
    
    // Check scheme
    const scheme = parsed.protocol.replace(':', '');
    if (!allowedSchemes.includes(scheme)) {
      return { allowed: false, reason: `Scheme '${scheme}' not allowed` };
    }
    
    // Check for localhost
    if (blockLocalhost && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')) {
      return { allowed: false, reason: 'Localhost not allowed' };
    }
    
    // Check for private IPs
    if (blockPrivateIps) {
      const ip = parsed.hostname;
      if (isPrivateIp(ip)) {
        return { allowed: false, reason: 'Private IP not allowed' };
      }
    }
    
    return { allowed: true };
  } catch (e) {
    return { allowed: false, reason: 'Invalid URL' };
  }
}

/**
 * Check if an IP address is private (RFC 1918, RFC 4193, etc.)
 */
function isPrivateIp(ip: string): boolean {
  // IPv4
  const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    // 10.0.0.0/8
    if (a === 10) return true;
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;
    // 127.0.0.0/8 (localhost)
    if (a === 127) return true;
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;
    // 0.0.0.0/8
    if (a === 0) return true;
    // 224.0.0.0/4 (multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (reserved)
    if (a >= 240) return true;
  }
  
  // IPv6 - simplified check for common private ranges
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    // ::1/128 (localhost)
    if (lower === '::1') return true;
    // fc00::/7 (unique local)
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // fe80::/10 (link-local)
    if (lower.startsWith('fe80:')) return true;
    // ::ffff:0:0/96 (IPv4-mapped)
    if (lower.startsWith('::ffff:')) {
      const ipv4 = lower.replace('::ffff:', '');
      return isPrivateIp(ipv4);
    }
  }
  
  return false;
}

/**
 * Resolve relative URL against base
 */
export function resolveUrl(base: string, relative: string): string {
  try {
    return new NodeURL(relative, base).toString();
  } catch {
    return relative;
  }
}

/**
 * Check if two URLs are same origin
 */
export function sameOrigin(url1: string, url2: string): boolean {
  try {
    const u1 = new NodeURL(url1);
    const u2 = new NodeURL(url2);
    return u1.origin === u2.origin;
  } catch {
    return false;
  }
}

/**
 * Get URL path depth (number of segments)
 */
export function getUrlDepth(url: string): number {
  try {
    const parsed = new NodeURL(url);
    return parsed.pathname.split('/').filter(Boolean).length;
  } catch {
    return 0;
  }
}

/**
 * Check if URL looks like a crawl trap (calendar, pagination, etc.)
 */
export function isCrawlTrap(url: string, patterns: string[] = []): boolean {
  const defaultPatterns = [
    /calendar/i,
    /page\/\d+/i,
    /sort=/i,
    /filter=/i,
    /\?page=\d+/i,
    /\?p=\d+/i,
    /offset=\d+/i,
    /limit=\d+/i,
    /view=print/i,
    /format=amp/i,
    /amp$/i,
    /\.xml$/i,
    /rss$/i,
    /atom$/i,
    /feed$/i,
    /sitemap/i,
  ];
  
  const allPatterns = [...defaultPatterns, ...patterns.map(p => new RegExp(p, 'i'))];
  
  return allPatterns.some(pattern => pattern.test(url));
}

/**
 * Strip URL of query parameters that don't affect content
 */
export function stripNonContentParams(url: string): string {
  const contentParams = new Set([
    'q', 'query', 'search', 'keyword', 'term',
    'id', 'slug', 'path', 'file', 'page',
    'category', 'tag', 'topic', 'section',
    'lang', 'language', 'locale',
    'v', 'version', 'revision',
  ]);
  
  try {
    const parsed = new NodeURL(url);
    const params = new URLSearchParams(parsed.search);
    const filtered = new URLSearchParams();
    
    for (const [key, value] of params.entries()) {
      if (contentParams.has(key.toLowerCase())) {
        filtered.append(key, value);
      }
    }
    
    parsed.search = filtered.toString();
    return parsed.toString();
  } catch {
    return url;
  }
}
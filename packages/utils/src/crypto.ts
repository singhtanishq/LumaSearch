/**
 * Content fingerprinting: exact hash (SHA-256) + near-duplicate (simhash).
 */
import { createHash } from 'node:crypto';

export function contentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function hashToId(prefix: string, hash: string, length = 24): string {
  return `${prefix}_${hash.slice(0, length)}`;
}

// ─── Simhash ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'if',
  'then',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'it',
  'this',
  'that',
  'as',
  'from',
  'we',
  'you',
  'they',
  'he',
  'she',
  'its',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function fnv1a(str: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}

/**
 * 64-bit simhash over word 3-grams. Near-duplicates produce small hamming distance.
 */
export function simhash(text: string): string {
  const tokens = tokenize(text);
  const bits = new Array<number>(64).fill(0);

  const shingles: string[] = [];
  if (tokens.length <= 3) {
    shingles.push(tokens.join(' '));
  } else {
    for (let i = 0; i <= tokens.length - 3; i++) {
      shingles.push(tokens.slice(i, i + 3).join(' '));
    }
  }

  for (const shingle of shingles) {
    const h = fnv1a(shingle);
    for (let b = 0; b < 64; b++) {
      if ((h >> BigInt(b)) & 1n) {
        bits[b] = (bits[b] ?? 0) + 1;
      } else {
        bits[b] = (bits[b] ?? 0) - 1;
      }
    }
  }

  let out = 0n;
  for (let b = 0; b < 64; b++) {
    if ((bits[b] ?? 0) > 0) out |= 1n << BigInt(b);
  }
  return out.toString(16).padStart(16, '0');
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    if (ca === undefined || cb === undefined) return 64;
    let x = parseInt(ca, 16) ^ parseInt(cb, 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/**
 * True when two simhashes are within near-duplicate threshold (default 6 of 64 bits).
 */
export function isNearDuplicate(
  a: string | undefined,
  b: string | undefined,
  threshold = 6
): boolean {
  if (!a || !b) return false;
  return hammingDistance(a, b) <= threshold;
}

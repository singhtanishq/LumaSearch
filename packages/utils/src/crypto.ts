// ============================================================
// Crypto Utilities
// ============================================================

import { createHash, createHmac, randomBytes, timingSafeEqual, scrypt, scryptSync } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

// ============================================================
// Hashing
// ============================================================

/**
 * SHA-256 hash as hex string
 */
export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * SHA-256 hash as base64 string
 */
export function sha256Base64(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('base64');
}

/**
 * HMAC-SHA256
 */
export function hmacSha256(key: string | Buffer, data: string | Buffer): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Generate a secure random string
 */
export function randomString(length: number, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[bytes[i] % charset.length];
  }
  return result;
}

/**
 * Generate a URL-safe random string
 */
export function randomUrlSafeString(length: number): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate a ULID-like ID (timestamp + random)
 */
export function generateId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const random = randomBytes(10).toString('base64url').toUpperCase().replace(/[_-]/g, '');
  return timestamp + random.slice(0, 16);
}

// ============================================================
// Password Hashing (scrypt)
// ============================================================

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_DKLEN = 64;
const SCRYPT_SALT_LENGTH = 16;

/**
 * Hash a password using scrypt
 * Returns: salt:hash (both hex)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const derivedKey = await scryptAsync(password, salt, SCRYPT_DKLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return salt.toString('hex') + ':' + derivedKey.toString('hex');
}

/**
 * Hash a password synchronously (for testing only)
 */
export function hashPasswordSync(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_LENGTH);
  const derivedKey = scryptSync(password, salt, SCRYPT_DKLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return salt.toString('hex') + ':' + derivedKey.toString('hex');
}

/**
 * Verify a password against a scrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(':');
  if (!saltHex || !keyHex) return false;
  
  const salt = Buffer.from(saltHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');
  
  const derivedKey = await scryptAsync(password, salt, SCRYPT_DKLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  
  return timingSafeEqual(key, derivedKey);
}

/**
 * Verify a password synchronously (for testing only)
 */
export function verifyPasswordSync(password: string, hash: string): boolean {
  const [saltHex, keyHex] = hash.split(':');
  if (!saltHex || !keyHex) return false;
  
  const salt = Buffer.from(saltHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');
  
  const derivedKey = scryptSync(password, salt, SCRYPT_DKLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  
  return timingSafeEqual(key, derivedKey);
}

// ============================================================
// API Key Hashing
// ============================================================

const API_KEY_HASH_ROUNDS = 12;
const API_KEY_SALT_LENGTH = 16;

/**
 * Hash an API key for storage
 * Returns: salt:hash (both hex)
 */
export async function hashApiKey(apiKey: string, rounds = API_KEY_HASH_ROUNDS): Promise<string> {
  const salt = randomBytes(API_KEY_SALT_LENGTH);
  const derivedKey = await scryptAsync(apiKey, salt, 64, {
    N: 1 << rounds,
    r: 8,
    p: 1,
  });
  return salt.toString('hex') + ':' + derivedKey.toString('hex');
}

/**
 * Verify an API key against its hash
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(':');
  if (!saltHex || !keyHex) return false;
  
  const salt = Buffer.from(saltHex, 'hex');
  const key = Buffer.from(keyHex, 'hex');
  
  // Extract rounds from salt length or use default
  const rounds = Math.log2(salt.length * 8 / 16) || API_KEY_HASH_ROUNDS;
  
  const derivedKey = await scryptAsync(apiKey, salt, 64, {
    N: 1 << rounds,
    r: 8,
    p: 1,
  });
  
  return timingSafeEqual(key, derivedKey);
}

// ============================================================
// Content Fingerprinting
// ============================================================

/**
 * Generate a content fingerprint (SHA-256 of normalized content)
 */
export function contentFingerprint(content: string): string {
  // Normalize: lowercase, trim, collapse whitespace
  const normalized = content
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  return sha256(normalized);
}

/**
 * Simhash implementation for near-duplicate detection
 * Returns 64-bit hash as hex string (16 chars)
 */
export function simhash(content: string, bits = 64): string {
  const weights = new Map<string, number>();
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  
  // Weight words by frequency
  for (const word of words) {
    weights.set(word, (weights.get(word) || 0) + 1);
  }
  
  // Calculate hash vector
  const vector = new Int32Array(bits);
  
  for (const [word, weight] of weights) {
    const hash = createHash('md5').update(word).digest();
    for (let i = 0; i < bits; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = i % 8;
      const bit = (hash[byteIndex] >> bitIndex) & 1;
      vector[i] += bit ? weight : -weight;
    }
  }
  
  // Build final hash
  let result = 0n;
  for (let i = 0; i < bits; i++) {
    if (vector[i] > 0) {
      result |= 1n << BigInt(i);
    }
  }
  
  // Convert to hex (pad to 16 chars for 64 bits)
  return result.toString(16).padStart(bits / 4, '0');
}

/**
 * Calculate Hamming distance between two simhashes
 */
export function hammingDistance(hash1: string, hash2: string): number {
  const n1 = BigInt('0x' + hash1);
  const n2 = BigInt('0x' + hash2);
  let diff = n1 ^ n2;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/**
 * Check if two simhashes are similar (near-duplicate)
 */
export function isNearDuplicate(hash1: string, hash2: string, threshold = 3): boolean {
  return hammingDistance(hash1, hash2) <= threshold;
}

/**
 * Generate shingles for near-duplicate detection
 */
export function generateShingles(content: string, k = 5): string[] {
  const words = content.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const shingles: string[] = [];
  
  for (let i = 0; i <= words.length - k; i++) {
    shingles.push(words.slice(i, i + k).join(' '));
  }
  
  return shingles;
}

/**
 * Jaccard similarity on shingles
 */
export function shingleSimilarity(content1: string, content2: string, k = 5): number {
  const shingles1 = new Set(generateShingles(content1, k));
  const shingles2 = new Set(generateShingles(content2, k));
  
  if (shingles1.size === 0 && shingles2.size === 0) return 1;
  if (shingles1.size === 0 || shingles2.size === 0) return 0;
  
  let intersection = 0;
  for (const s of shingles1) {
    if (shingles2.has(s)) intersection++;
  }
  
  const union = shingles1.size + shingles2.size - intersection;
  return intersection / union;
}

// ============================================================
// Token Generation
// ============================================================

/**
 * Generate a secure token (for sessions, CSRF, etc.)
 */
export function generateToken(length = 32): string {
  return randomBytes(length).toString('base64url');
}

/**
 * Generate a prefixed API key
 */
export function generateApiKey(prefix = 'lms'): { key: string; hash: string } {
  const randomPart = randomBytes(24).toString('base64url');
  const key = `${prefix}_${randomPart}`;
  const hash = hashApiKey(key);
  return { key, hash };
}

/**
 * Parse API key to extract prefix
 */
export function parseApiKey(apiKey: string): { prefix: string; randomPart: string } | null {
  const match = apiKey.match(/^([a-z]+)_([A-Za-z0-9_-]+)$/);
  if (!match) return null;
  return { prefix: match[1], randomPart: match[2] };
}

// ============================================================
// Signature Verification
// ============================================================

/**
 * Create a signed payload (for webhooks, etc.)
 */
export function signPayload(payload: string, secret: string): string {
  return hmacSha256(secret, payload);
}

/**
 * Verify a signed payload
 */
export function verifyPayload(payload: string, signature: string, secret: string): boolean {
  const expected = signPayload(payload, secret);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Constant-time string comparison
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
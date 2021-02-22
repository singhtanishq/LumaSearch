import { randomUUID } from 'node:crypto';

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 12);
}

export function chunkId(documentId: string, index: number): string {
  return `${documentId}_c${index}`;
}

/** Deterministic document id from canonical URL — idempotent re-ingest. */
export async function documentIdFromUrl(canonicalUrl: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 24);
  return `doc_${hash}`;
}

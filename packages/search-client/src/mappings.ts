/**
 * Elasticsearch index mappings per vertical. Embedding dimension is injected
 * at index creation because it depends on the configured embedding provider.
 */
import type { Vertical } from '@luma-search/types';

export interface MappingOptions {
  embeddingDims?: number;
  numberOfShards?: number;
  numberOfReplicas?: number;
  refreshInterval?: string;
}

const BASE_SETTINGS = (opts: MappingOptions) => ({
  number_of_shards: opts.numberOfShards ?? 1,
  number_of_replicas: opts.numberOfReplicas ?? 0,
  refresh_interval: opts.refreshInterval ?? '1s',
  'index.mapping.total_fields.limit': 2000,
});

const EMBEDDING_PROPERTY = (opts: MappingOptions) => {
  const dims = opts.embeddingDims ?? 384;
  return {
    type: 'dense_vector',
    dims,
    index: true,
    similarity: 'cosine',
  };
};

export const SHARED_PROPERTIES: Record<string, unknown> = {
  id: { type: 'keyword' },
  url: { type: 'keyword' },
  canonicalUrl: { type: 'keyword' },
  title: {
    type: 'text',
    analyzer: 'english',
    fields: { keyword: { type: 'keyword', ignore_above: 512 } },
  },
  domain: { type: 'keyword' },
  language: { type: 'keyword' },
  vertical: { type: 'keyword' },
  publishedAt: { type: 'date' },
  modifiedAt: { type: 'date' },
  crawledAt: { type: 'date' },
  contentHash: { type: 'keyword' },
  simhash: { type: 'keyword' },
  status: { type: 'keyword' },
  headings: { type: 'text', analyzer: 'english' },
  anchorText: { type: 'text', analyzer: 'english' },
  embedding: null, // filled per-vertical
  metadata: { type: 'object', enabled: false },
};

export function webIndexMapping(opts: MappingOptions = {}) {
  return {
    settings: BASE_SETTINGS(opts),
    mappings: {
      dynamic: 'strict',
      properties: {
        ...SHARED_PROPERTIES,
        embedding: EMBEDDING_PROPERTY(opts),
        content: { type: 'text', analyzer: 'english' },
        author: { type: 'keyword' },
        organization: { type: 'keyword' },
        contentType: { type: 'keyword' },
        wordCount: { type: 'integer' },
        structuredData: { type: 'object', enabled: false },
      },
    },
  };
}

export function codeIndexMapping(opts: MappingOptions = {}) {
  return {
    settings: BASE_SETTINGS(opts),
    mappings: {
      dynamic: 'strict',
      properties: {
        ...SHARED_PROPERTIES,
        embedding: EMBEDDING_PROPERTY(opts),
        content: { type: 'text', analyzer: 'english' },
        repository: { type: 'keyword' },
        filePath: { type: 'keyword' },
        symbol: { type: 'keyword' },
        codeLanguage: { type: 'keyword' },
        license: { type: 'keyword' },
      },
    },
  };
}

export function docsIndexMapping(opts: MappingOptions = {}) {
  return {
    settings: BASE_SETTINGS(opts),
    mappings: {
      dynamic: 'strict',
      properties: {
        ...SHARED_PROPERTIES,
        embedding: EMBEDDING_PROPERTY(opts),
        content: { type: 'text', analyzer: 'english' },
        project: { type: 'keyword' },
        version: { type: 'keyword' },
        sectionHierarchy: { type: 'keyword' },
      },
    },
  };
}

export function mappingFor(vertical: Vertical, opts: MappingOptions = {}) {
  switch (vertical) {
    case 'code':
      return codeIndexMapping(opts);
    case 'docs':
      return docsIndexMapping(opts);
    default:
      return webIndexMapping(opts);
  }
}

/** Payload for ingesting; maps shared + vertical-specific fields. */
export function verticalIndexName(prefix: string, vertical: Vertical): string {
  return `${prefix}_${vertical}`;
}

export const INDEX_SUFFIX_ALIASED = true;

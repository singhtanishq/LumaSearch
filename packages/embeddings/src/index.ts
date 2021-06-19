/**
 * Embedding provider adapter interface + implementations.
 * Providers: local (Python service), OpenAI, Cohere, Voyage.
 */
import { withBackoff } from '@luma-search/utils';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
  estimateCostUsd?(tokens: number): number;
}

export interface LocalProviderConfig {
  url: string;
  model?: string;
  dimensions?: number;
  batchSize?: number;
}

/**
 * Local embeddings via the bundled Python service (sentence-transformers).
 * Deterministic, free, offline — the default self-hosted path.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'local';
  readonly dimensions: number;
  private readonly url: string;
  private readonly model: string;
  private readonly batchSize: number;

  constructor(cfg: LocalProviderConfig) {
    this.url = cfg.url;
    this.model = cfg.model ?? 'sentence-transformers/all-MiniLM-L6-v2';
    this.dimensions = cfg.dimensions ?? 384;
    this.batchSize = cfg.batchSize ?? 32;
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      const batch = texts.slice(i, i + this.batchSize).map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));
      const res = await withBackoff(
        async () => {
          const r = await fetch(`${this.url}/embed`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ texts: batch, model: this.model }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!r.ok) throw new Error(`embedding service HTTP ${r.status}`);
          return r.json() as Promise<{ embeddings: number[][] }>;
        },
        { attempts: 3, initialMs: 1000 }
      );
      out.push(...res.embeddings);
    }
    return out;
  }
}

export interface ApiProviderConfig {
  apiKey?: string;
  model: string;
  dimensions: number;
  batchSize: number;
  costPerMillionTokens?: number;
}

/** OpenAI text-embedding API. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly dimensions: number;
  private cfg: ApiProviderConfig;

  constructor(cfg: ApiProviderConfig) {
    if (!cfg.apiKey) throw new Error('OpenAIEmbeddingProvider requires OPENAI_API_KEY');
    this.cfg = cfg;
    this.dimensions = cfg.dimensions;
  }

  estimateCostUsd(tokens: number): number {
    return ((tokens / 1_000_000) * (this.cfg.costPerMillionTokens ?? 0.02));
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.cfg.batchSize) {
      const batch = texts.slice(i, i + this.cfg.batchSize).map((t) => (t.length > 8000 ? t.slice(0, 8000) : t));
      const res = await withBackoff(async () => {
        const r = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.cfg.apiKey}`,
          },
          body: JSON.stringify({ model: this.cfg.model, input: batch, dimensions: this.dimensions }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!r.ok) throw new Error(`openai embeddings HTTP ${r.status}`);
        return r.json() as Promise<{ data: Array<{ embedding: number[]; index: number }> }>;
      }, { attempts: 3, initialMs: 1000 });
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      out.push(...sorted.map((d) => d.embedding));
    }
    return out;
  }
}

/**
 * Factory from env-style config.
 */
export type EmbeddingProviderKind = 'local' | 'openai' | 'cohere' | 'voyage';

export interface EmbeddingFactoryConfig {
  provider: EmbeddingProviderKind;
  local?: LocalProviderConfig;
  openai?: ApiProviderConfig;
  cohere?: ApiProviderConfig;
  voyage?: ApiProviderConfig;
}

export function createEmbeddingProvider(cfg: EmbeddingFactoryConfig): EmbeddingProvider {
  switch (cfg.provider) {
    case 'openai':
      return new OpenAIEmbeddingProvider(cfg.openai!);
    case 'local':
    default: {
      if (cfg.provider !== 'local') {
        throw new Error(`embedding provider ${cfg.provider} requires configuration`);
      }
      if (!cfg.local) throw new Error('local embedding provider requires config');
      return new LocalEmbeddingProvider(cfg.local);
    }
  }
}
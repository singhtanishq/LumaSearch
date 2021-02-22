/**
 * Index lifecycle: create (versioned) → bulk ingest → alias swap → verify → cleanup.
 * Zero-downtime reindexing via timestamped concrete index names behind stable aliases.
 */
import { Client } from '@elastic/elasticsearch';
import type { Vertical } from '@luma-search/types';
import { mappingFor, verticalIndexName } from './mappings';

export interface IndexManagerOptions {
  prefix: string;
  embeddingDims?: number;
  numberOfShards?: number;
  numberOfReplicas?: number;
  refreshInterval?: string;
}

export class IndexManager {
  constructor(
    private readonly client: Client,
    private readonly opts: IndexManagerOptions
  ) {}

  aliasName(vertical: Vertical): string {
    return verticalIndexName(this.opts.prefix, vertical);
  }

  /**
   * Concrete index name with version suffix, e.g. luma_web_v1737450000000.
   */
  concreteName(vertical: Vertical, version: number): string {
    return `${this.aliasName(vertical)}_v${version}`;
  }

  async aliasExists(vertical: Vertical): Promise<boolean> {
    return this.client.indices
      .existsAlias({ name: this.aliasName(vertical) })
      .then((r) => r === true || Boolean((r as { body?: boolean }).body));
  }

  async getActiveIndex(vertical: Vertical): Promise<string | null> {
    try {
      const res = await this.client.indices.getAlias({ name: this.aliasName(vertical) });
      const indices = Object.keys(res.body ?? res);
      if (indices.length === 0) return null;
      // newest version wins
      return indices.sort().at(-1) ?? null;
    } catch {
      return null;
    }
  }

  async ensureIndex(vertical: Vertical): Promise<{ index: string; created: boolean }> {
    const existing = await this.getActiveIndex(vertical);
    if (existing) return { index: existing, created: false };

    const version = Date.now();
    const index = this.concreteName(vertical, version);
    const body = mappingFor(vertical, {
      embeddingDims: this.opts.embeddingDims,
      numberOfShards: this.opts.numberOfShards,
      numberOfReplicas: this.opts.numberOfReplicas,
      refreshInterval: this.opts.refreshInterval,
    });
    await this.client.indices.create({ index, ...body });
    await this.client.indices.putAlias({ index, name: this.aliasName(vertical) });
    return { index, created: true };
  }

  async ensureAll(): Promise<Record<Vertical, string>> {
    const out = {} as Record<Vertical, string>;
    for (const vertical of ['web', 'code', 'docs'] as const) {
      out[vertical] = (await this.ensureIndex(vertical)).index;
    }
    return out;
  }

  async bulkIngest<T extends Record<string, unknown>>(
    vertical: Vertical,
    documents: Array<{ id: string; doc: T }>,
    options: { refresh?: boolean } = {}
  ): Promise<{ indexed: number; errors: string[] }> {
    if (documents.length === 0) return { indexed: 0, errors: [] };
    const alias = this.aliasName(vertical);
    const body = documents.flatMap(({ id, doc }) => [{ index: { _index: alias, _id: id } }, doc]);
    const res = await this.client.bulk({ operations: body, refresh: options.refresh ?? false });
    const items = (res.body?.items ?? []) as Array<{
      index?: { error?: unknown; status?: number };
    }>;
    const errors: string[] = [];
    for (const item of items) {
      if (item.index?.error) {
        errors.push(
          typeof item.index.error === 'string' ? item.index.error : JSON.stringify(item.index.error)
        );
      }
    }
    return { indexed: documents.length - errors.length, errors };
  }

  async refresh(vertical: Vertical): Promise<void> {
    await this.client.indices.refresh({ index: this.aliasName(vertical) });
  }

  async count(vertical: Vertical, query?: Record<string, unknown>): Promise<number> {
    const res = await this.client.count({
      index: this.aliasName(vertical),
      ...(query ? { query } : {}),
    });
    return (res.body?.count as number) ?? 0;
  }

  /**
   * Verify a candidate index has reasonable content before swapping the alias.
   */
  async verifyIndex(indexName: string, minDocs = 1): Promise<boolean> {
    try {
      const res = await this.client.count({ index: indexName });
      return ((res.body?.count as number) ?? 0) >= minDocs;
    } catch {
      return false;
    }
  }

  /**
   * Atomically swap alias to a new (verified) index and delete the old one.
   */
  async swapAlias(
    vertical: Vertical,
    newIndex: string,
    opts: { deleteOld?: boolean } = {}
  ): Promise<void> {
    const alias = this.aliasName(vertical);
    const oldIndex = await this.getActiveIndex(vertical);
    const actions: Array<Record<string, unknown>> = [];
    if (oldIndex && oldIndex !== newIndex) {
      actions.push({ remove: { index: oldIndex, alias } });
    }
    actions.push({ add: { index: newIndex, alias } });
    await this.client.indices.updateAliases({ actions });

    if (opts.deleteOld !== false && oldIndex && oldIndex !== newIndex) {
      // keep old index briefly in prod; delete here since we can rebuild via reindex job
      await this.client.indices.delete({ index: oldIndex }).catch(() => undefined);
    }
  }

  async deleteIndex(indexName: string): Promise<void> {
    await this.client.indices.delete({ index: indexName }).catch(() => undefined);
  }

  async indexStats(vertical: Vertical): Promise<{ docs: number; sizeBytes: number } | null> {
    try {
      const res = await this.client.indices.stats({ index: this.aliasName(vertical) });
      const totals = (
        res.body as {
          _all?: { primaries?: { docs?: { count?: number }; store?: { size_in_bytes?: number } } };
        }
      )._all?.primaries;
      return {
        docs: totals?.docs?.count ?? 0,
        sizeBytes: totals?.store?.size_in_bytes ?? 0,
      };
    } catch {
      return null;
    }
  }
}

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/worker.ts'],
  format: ['cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  external: ['@luma-search/llm', '@luma-search/evidence', '@luma-search/search-client', '@luma-search/storage', '@luma-search/queue', '@luma-search/crawler-core', '@luma-search/embeddings', '@luma-search/telemetry', '@luma-search/types', '@luma-search/utils', '@luma-search/config', 'bullmq', 'ioredis', '@elastic/elasticsearch'],
});
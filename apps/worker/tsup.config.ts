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
  external: ['@luma-search/*', 'bullmq', 'ioredis', '@elastic/elasticsearch'],
});
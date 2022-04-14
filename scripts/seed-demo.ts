#!/usr/bin/env tsx
// Seed demo corpus into LumaSearch
// Run: pnpm --filter @luma-search/scripts tsx scripts/seed-demo.ts

import { createSearchClient, IndexManager } from '@luma-search/search-client';
import { validateEnv } from '@luma-search/config';
import { canonicalizeUrl, simhash, contentHash } from '@luma-search/utils';

const env = validateEnv();
const es = createSearchClient({
  url: env.ELASTICSEARCH_URL,
  username: env.ELASTICSEARCH_USERNAME,
  password: env.ELASTICSEARCH_PASSWORD,
});

const indexManager = new IndexManager(es, {
  prefix: env.ES_INDEX_PREFIX,
  embeddingDims: env.EMBEDDING_LOCAL_DIMENSIONS,
});

const DEMO_DOCS = [
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    title: 'JavaScript | MDN',
    content: `JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions. While it is most well-known as the scripting language for Web pages, many non-browser environments also use it, such as Node.js, Apache CouchDB and Adobe Acrobat. JavaScript is a prototype-based, multi-paradigm, single-threaded, dynamic language, supporting object-oriented, imperative, and declarative (e.g. functional programming) styles.`,
    domain: 'developer.mozilla.org',
    language: 'en',
    headings: ['Description', 'History', 'Features', 'Data structures', 'Variables', 'Functions'],
    publishedAt: '2024-01-15T00:00:00Z',
  },
  {
    url: 'https://github.com/microsoft/TypeScript',
    title: 'TypeScript - GitHub',
    content: `TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. TypeScript extends JavaScript by adding types to the language. TypeScript speeds up your development experience by catching errors and providing fixes before you even run your code.`,
    domain: 'github.com',
    language: 'en',
    headings: ['README', 'Installation', 'Usage', 'Contributing'],
    publishedAt: '2024-02-01T00:00:00Z',
  },
  {
    url: 'https://nodejs.org/en/docs',
    title: 'Node.js Documentation',
    content: `Node.js is an open-source, cross-platform JavaScript runtime environment that executes JavaScript code outside of a browser. Node.js lets developers use JavaScript to write command line tools and for server-side scripting. The Node.js runtime is built on Chrome's V8 JavaScript engine.`,
    domain: 'nodejs.org',
    language: 'en',
    headings: ['About', 'Getting Started', 'API Reference', 'Guides'],
    publishedAt: '2024-01-20T00:00:00Z',
  },
  {
    url: 'https://react.dev',
    title: 'React - A JavaScript library for building user interfaces',
    content: `React is the library for web and native user interfaces. Build user interfaces out of individual pieces called components written in JavaScript. React is designed to let you seamlessly combine components written by independent people.`,
    domain: 'react.dev',
    language: 'en',
    headings: ['Learn React', 'API Reference', 'Community', 'Blog'],
    publishedAt: '2024-03-01T00:00:00Z',
  },
  {
    url: 'https://en.wikipedia.org/wiki/Elasticsearch',
    title: 'Elasticsearch - Wikipedia',
    content: `Elasticsearch is a search engine based on the Lucene library. It provides a distributed, multitenant-capable full-text search engine with an HTTP web interface and schema-free JSON documents. Elasticsearch is developed in Java and is released as open source under the terms of the Apache License.`,
    domain: 'en.wikipedia.org',
    language: 'en',
    headings: ['History', 'Features', 'Architecture', 'Use cases'],
    publishedAt: '2023-12-10T00:00:00Z',
  },
];

async function main() {
  console.log('🌱 Seeding demo corpus...');

  // Ensure index exists
  await indexManager.ensureIndex('web');

  for (const doc of DEMO_DOCS) {
    const url = doc.url;
    const canonical = canonicalizeUrl(url)!;
    const hash = contentHash(doc.content);
    const shash = simhash(doc.content);
    const now = new Date().toISOString();

    const result = await es.index({
      index: 'luma_web',
      id: `doc_${hash.slice(0, 24)}`,
      document: {
        id: `doc_${hash.slice(0, 24)}`,
        url,
        canonicalUrl: canonical,
        title: doc.title,
        content: doc.content,
        headings: doc.headings,
        domain: doc.domain,
        language: doc.language,
        vertical: 'web',
        publishedAt: doc.publishedAt,
        crawledAt: now,
        contentHash: hash,
        simhash: shash,
        status: 'indexed',
        wordCount: doc.content.split(/\s+/).length,
        metadata: {},
      },
    });

    console.log(`  ✅ Indexed: ${doc.title}`);
  }

  await es.indices.refresh({ index: 'luma_web' });
  console.log('🎉 Demo corpus seeded successfully!');
  await es.close();
}

main().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
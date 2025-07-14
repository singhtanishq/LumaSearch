/**
 * LumaSearch seed script — populates the SQLite FTS5 index with a demo corpus.
 * Run: pnpm --filter @luma-search/server seed
 */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./data/luma.db';
}

import { SearchEngine } from '@luma-search/search-engine';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DATA_DIR = resolve(process.env.LUMA_DATA_DIR ?? './data');
mkdirSync(DATA_DIR, { recursive: true });

const engine = new SearchEngine({ dbPath: resolve(DATA_DIR, 'search.db') });

const DEMO_DOCS = [
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    title: 'JavaScript | MDN',
    content:
      'JavaScript (JS) is a lightweight, interpreted, or just-in-time compiled programming language with first-class functions. While it is most well-known as the scripting language for Web pages, many non-browser environments also use it, such as Node.js, Apache CouchDB and Adobe Acrobat. JavaScript is a prototype-based, multi-paradigm, single-threaded, dynamic language, supporting object-oriented, imperative, and declarative (e.g. functional programming) styles.',
    headings: ['Description', 'History', 'Features', 'Data structures', 'Variables', 'Functions'],
    domain: 'developer.mozilla.org',
    language: 'en',
    vertical: 'docs',
    publishedAt: '2024-01-15T00:00:00Z',
  },
  {
    url: 'https://github.com/microsoft/TypeScript',
    title: 'TypeScript - GitHub',
    content:
      'TypeScript is a strongly typed programming language that builds on JavaScript, giving you better tooling at any scale. TypeScript extends JavaScript by adding types to the language. TypeScript speeds up your development experience by catching errors and providing fixes before you even run your code.',
    headings: ['README', 'Installation', 'Usage', 'Contributing'],
    domain: 'github.com',
    language: 'en',
    vertical: 'code',
    publishedAt: '2024-02-01T00:00:00Z',
  },
  {
    url: 'https://nodejs.org/en/docs',
    title: 'Node.js Documentation',
    content:
      "Node.js is an open-source, cross-platform JavaScript runtime environment that executes JavaScript code outside of a browser. Node.js lets developers use JavaScript to write command line tools and for server-side scripting. The Node.js runtime is built on Chrome's V8 JavaScript engine.",
    headings: ['About', 'Getting Started', 'API Reference', 'Guides'],
    domain: 'nodejs.org',
    language: 'en',
    vertical: 'docs',
    publishedAt: '2024-01-20T00:00:00Z',
  },
  {
    url: 'https://react.dev',
    title: 'React - A JavaScript library for building user interfaces',
    content:
      'React is the library for web and native user interfaces. Build user interfaces out of individual pieces called components written in JavaScript. React is designed to let you seamlessly combine components written by independent people.',
    headings: ['Learn React', 'API Reference', 'Community', 'Blog'],
    domain: 'react.dev',
    language: 'en',
    vertical: 'docs',
    publishedAt: '2024-03-01T00:00:00Z',
  },
  {
    url: 'https://en.wikipedia.org/wiki/Elasticsearch',
    title: 'Elasticsearch - Wikipedia',
    content:
      'Elasticsearch is a search engine based on the Lucene library. It provides a distributed, multitenant-capable full-text search engine with an HTTP web interface and schema-free JSON documents. Elasticsearch is developed in Java and is released as open source under the terms of the Apache License.',
    headings: ['History', 'Features', 'Architecture', 'Use cases'],
    domain: 'en.wikipedia.org',
    language: 'en',
    vertical: 'docs',
    publishedAt: '2023-12-10T00:00:00Z',
  },
  {
    url: 'https://en.wikipedia.org/wiki/Web_crawler',
    title: 'Web crawler - Wikipedia',
    content:
      "A Web crawler, sometimes called a spider or spiderbot, is an Internet bot that systematically browses the World Wide Web, typically for the purpose of Web indexing. Search engines use Web crawling or spidering to update their web content or indices of other sites' web content.",
    headings: ['Overview', 'Crawling policy', 'URL normalization', 'Distribution'],
    domain: 'en.wikipedia.org',
    language: 'en',
    vertical: 'docs',
    publishedAt: '2024-01-05T00:00:00Z',
  },
  {
    url: 'https://stackoverflow.com/questions/what-is-hybrid-search',
    title: 'What is hybrid search in information retrieval?',
    content:
      'Hybrid search combines lexical (keyword-based) and semantic (vector-based) retrieval strategies to improve search relevance. Lexical search uses BM25 or TF-IDF scoring to find exact keyword matches, while semantic search uses dense vector embeddings to capture meaning similarity. Reciprocal Rank Fusion (RRF) is a common technique to merge results from both approaches.',
    headings: ['Lexical search', 'Semantic search', 'Fusion techniques'],
    domain: 'stackoverflow.com',
    language: 'en',
    vertical: 'web',
    publishedAt: '2024-04-10T00:00:00Z',
  },
  {
    url: 'https://www.sqlite.org/fts5.html',
    title: 'FTS5 - SQLite full-text search extension',
    content:
      'FTS5 is an SQLite virtual table module that provides full-text search functionality to database applications. FTS5 provides the ability to create full-text search indexes on tables, perform complex full-text queries using the MATCH operator, and rank results using the bm25() ranking function.',
    headings: [
      'Overview',
      'Full-text Query Syntax',
      'The bm25() function',
      'External Content Tables',
    ],
    domain: 'sqlite.org',
    language: 'en',
    vertical: 'docs',
    publishedAt: '2024-05-01T00:00:00Z',
  },
];

async function main() {
  console.log('🌱 Seeding demo corpus into SQLite FTS5...');
  const now = new Date().toISOString();

  const docs = DEMO_DOCS.map((d, i) => ({
    ...d,
    id: `doc_seed_${i + 1}`,
    status: 'indexed' as const,
    crawledAt: now,
    wordCount: d.content.split(/\s+/).length,
  }));

  const { indexed, errors } = engine.indexDocuments(docs);
  console.log(
    `  ✅ Indexed ${indexed} documents${errors.length ? ` (${errors.length} errors)` : ''}`
  );
  for (const e of errors) console.error(`  ⚠️  ${e}`);

  console.log(`🎉 Demo corpus seeded: ${engine.totalDocuments()} documents in search index`);
  console.log(
    '\nTry: curl -X POST http://localhost:4000/api/v1/search -H "Content-Type: application/json" -d \'{"q":"typescript"}\''
  );
  engine.close();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});

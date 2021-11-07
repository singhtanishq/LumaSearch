'use client';

import { useState, useEffect, useRef, useCallback, FormEvent, KeyboardEvent } from 'react';
import SearchResults from './SearchResults';
import AnswerPanel from './AnswerPanel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface SearchResult {
  id: string;
  url: string;
  canonicalUrl?: string;
  title: string;
  snippet: string;
  domain: string;
  vertical: string;
  language?: string;
  publishedAt?: string;
  crawledAt: string;
  score: number;
  highlights?: Array<{ field: string; fragments: string[] }>;
  source: string;
}

interface SearchResponse {
  query: string;
  interpretation: any;
  results: SearchResult[];
  total: number;
  nextCursor?: string;
  took: number;
  profile: string;
  facets?: any;
  debug?: any;
}

interface AnswerResponse {
  answer: string;
  citations: Array<{
    id: string;
    resultId: string;
    url: string;
    title: string;
    passage: string;
    crawledAt: string;
  }>;
  confidence: string;
  contradictions?: any[];
  coverage: number;
  model?: string;
  tokensUsed?: { prompt: number; completion: number };
  took: number;
  cached?: boolean;
}

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [answer, setAnswer] = useState<AnswerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [answerLoading, setAnswerLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [took, setTook] = useState(0);
  const [profile, setProfile] = useState<'hybrid' | 'fastest' | 'recent' | 'exact'>('hybrid');
  const [showAnswer, setShowAnswer] = useState(false);
  const [offset, setOffset] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const search = useCallback(async (q: string, isLoadMore = false) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    if (!isLoadMore) {
      setOffset(0);
      setResults([]);
      setAnswer(null);
    }
    try {
      const res = await fetch(`${API_URL}/api/v1/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, profile, limit: 10, offset }),
      });
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data: SearchResponse = await res.json();
      if (isLoadMore) {
        setResults(prev => [...prev, ...data.results]);
      } else {
        setResults(data.results);
      }
      setTotal(data.total);
      setTook(data.took);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [profile, offset]);

  const generateAnswer = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setAnswerLoading(true);
    setShowAnswer(true);
    try {
      const res = await fetch(`${API_URL}/api/v1/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q, profile: 'research' }),
      });
      if (!res.ok) throw new Error(`Answer failed: ${res.status}`);
      const data: AnswerResponse = await res.json();
      setAnswer(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Answer generation failed');
    } finally {
      setAnswerLoading(false);
    }
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      search(query);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      generateAnswer(query);
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
    document.addEventListener('keydown', (e) => {
      if ((e.key === '/' || (e.metaKey && e.key === 'k')) && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    });
    return () => {};
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 dark:border-gray-800 px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <span className="text-2xl">🔍</span>
            LumaSearch
          </h1>
          <div className="flex items-center gap-2">
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as any)}
              className="text-sm px-2 py-1 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
            >
              <option value="hybrid">Hybrid (BM25 + Vector)</option>
              <option value="fastest">Fastest (BM25 only)</option>
              <option value="recent">Recent</option>
              <option value="exact">Exact Match</option>
            </select>
            <button
              onClick={() => generateAnswer(query)}
              disabled={answerLoading || !query.trim()}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {answerLoading ? 'Answering…' : 'Answer'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-8 max-w-5xl mx-auto w-full">
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="relative">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search the web, code, docs… (/, ⌘K to focus, ⌘+Enter for answer)"
              className="w-full px-6 py-4 text-lg border-2 border-gray-300 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 placeholder-gray-400"
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {(results.length > 0 || loading) && (
          <SearchResults
            results={results}
            loading={loading}
            total={total}
            took={took}
            query={query}
            onLoadMore={() => { setOffset(o => o + 10); search(query, true); }}
            hasMore={results.length < total}
          />
        )}

        {showAnswer && (
          <AnswerPanel
            answer={answer}
            loading={answerLoading}
            query={query}
            onClose={() => setShowAnswer(false)}
          />
        )}

        {!query && !results.length && !loading && (
          <div className="text-center py-16 text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">Start typing to search</p>
            <p className="text-sm">
              Try: <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">site:github.com typescript</code>{' '}
              or <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">"exact phrase" -exclude</code>
            </p>
            <p className="text-sm mt-2">Shortcuts: <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">/</kbd> focus · <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">⌘K</kbd> focus · <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">⌘+Enter</kbd> answer</p>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 px-4 py-4">
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 max-w-5xl mx-auto">
          LumaSearch — Self-hostable, open-source search engine.{' '}
          <a href="https://github.com/singhtanishq/LumaSearch" target="_blank" rel="noopener" className="underline hover:text-blue-600">
            GitHub
          </a>
        </p>
      </footer>
    </div>
  );
}
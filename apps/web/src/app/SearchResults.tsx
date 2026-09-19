'use client';

import { useState } from 'react';
import { SearchResult } from '../types';

interface SearchResultsProps {
  results: SearchResult[];
  loading: boolean;
  total: number;
  took: number;
  query: string;
  onLoadMore: () => void;
  hasMore: boolean;
}

export default function SearchResults({
  results,
  loading,
  total,
  took,
  query,
  onLoadMore,
  hasMore,
}: SearchResultsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!results.length && !loading) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
        <span>
          {total.toLocaleString()} results in {took}ms
        </span>
        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
          query: "{query}"
        </span>
      </div>

      {results.map((result) => (
        <ResultCard
          key={result.id}
          result={result}
          isExpanded={expanded === result.id}
          onToggle={() => setExpanded(expanded === result.id ? null : result.id)}
        />
      ))}

      {loading && <div className="text-center py-4 text-gray-500">Loading more…</div>}

      {hasMore && !loading && (
        <button
          onClick={onLoadMore}
          className="w-full mt-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Load more results
        </button>
      )}
    </div>
  );
}

function ResultCard({
  result,
  isExpanded,
  onToggle,
}: {
  result: SearchResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const displayUrl = result.canonicalUrl || result.url;
  const domain = new URL(displayUrl).hostname.replace('www.', '');

  return (
    <article className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-lg font-medium text-blue-700 dark:text-blue-400 hover:underline line-clamp-1"
            >
              {result.title || displayUrl}
            </a>
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400">
              {result.vertical}
            </span>
            <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
              {result.source}
            </span>
          </div>
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            <a
              href={displayUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {domain}
            </a>
            {result.publishedAt && (
              <>
                {' '}
                ·{' '}
                <time dateTime={result.publishedAt}>
                  {new Date(result.publishedAt).toLocaleDateString()}
                </time>
              </>
            )}
            {result.crawledAt && (
              <>
                {' '}
                · crawled{' '}
                <time dateTime={result.crawledAt}>
                  {new Date(result.crawledAt).toLocaleDateString()}
                </time>
              </>
            )}
          </div>
          <p className="text-gray-700 dark:text-gray-300 line-clamp-3 mb-2">
            {result.highlights?.flatMap((h) => h.fragments).join(' … ') || result.snippet}
          </p>
          {isExpanded && (
            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-800 text-sm space-y-1">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <span>ID:</span>
                <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs font-mono">
                  {result.id}
                </code>
              </div>
              {result.language && (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <span>Language:</span>
                  <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                    {result.language}
                  </code>
                </div>
              )}
              {result.score && (
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                  <span>Score:</span>
                  <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-xs">
                    {result.score.toFixed(3)}
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onToggle}
          className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </article>
  );
}

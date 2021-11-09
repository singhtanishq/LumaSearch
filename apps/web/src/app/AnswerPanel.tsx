'use client';

import { AnswerResponse } from './page';

interface AnswerPanelProps {
  answer: AnswerResponse | null;
  loading: boolean;
  query: string;
  onClose: () => void;
}

export default function AnswerPanel({ answer, loading, query, onClose }: AnswerPanelProps) {
  if (!answer && !loading) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-labelledby="answer-title">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative flex-1 max-w-3xl mx-auto my-auto w-full max-h-[85vh] flex flex-col bg-white dark:bg-gray-950 rounded-2xl shadow-xl overflow-hidden">
        <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 sticky top-0 bg-white/95 dark:bg-gray-950/95 backdrop-blur">
          <h2 id="answer-title" className="text-lg font-semibold">AI Answer for: <span className="font-normal text-gray-600 dark:text-gray-400">"{query}"</span></h2>
          <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          )}

          {answer && !loading && (
            <div className="space-y-4 markdown-content">
              <div className="prose prose-gray dark:prose-invert max-w-none whitespace-pre-wrap">
                {answer.answer}
              </div>

              {answer.citations.length > 0 && (
                <details className="mt-6">
                  <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-300">
                    Sources ({answer.citations.length})
                  </summary>
                  <div className="mt-3 space-y-2">
                    {answer.citations.map((cite, i) => (
                      <div key={cite.id} className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800">
                        <div className="flex items-start gap-2">
                          <span className="text-sm font-mono text-blue-600 dark:text-blue-400 mt-0.5">[{i + 1}]</span>
                          <div className="flex-1 min-w-0">
                            <a
                              href={cite.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-700 dark:text-blue-400 hover:underline line-clamp-1"
                            >
                              {cite.title}
                            </a>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{cite.passage}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <a href={cite.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {new URL(cite.url).hostname}
                              </a>
                              <time dateTime={cite.crawledAt}>{new Date(cite.crawledAt).toLocaleDateString()}</time>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {answer.confidence && (
                <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <span className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 capitalize">
                    Confidence: {answer.confidence}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                    Coverage: {Math.round(answer.coverage * 100)}%
                  </span>
                  {answer.model && (
                    <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">Model: {answer.model}</span>
                  )}
                  {answer.took && (
                    <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800">{answer.took}ms</span>
                  )}
                  {answer.cached && <span className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Cached</span>}
                </div>
              )}

              {answer.contradictions && answer.contradictions.length > 0 && (
                <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">⚠ Contradictions detected</h4>
                  {answer.contradictions.map((c, i) => (
                    <div key={i} className="text-sm text-amber-700 dark:text-amber-300">
                      <p className="font-medium">{c.claim}</p>
                      <ul className="list-disc list-inside mt-1 space-y-1">
                        {c.sources.map((s, j) => (
                          <li key={j}>[{s.citationId}] {s.statement}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="p-4 border-t border-gray-200 dark:border-gray-800 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
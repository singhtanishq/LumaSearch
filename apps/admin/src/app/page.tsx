'use client';

import { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface HealthCheck {
  status: 'ok' | 'down';
  latencyMs?: number;
  detail?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptimeSeconds: number;
  checks: Record<string, HealthCheck>;
}

interface IndexStatus {
  activeIndex: string | null;
  docs?: number;
  sizeBytes?: number;
}

interface CrawlJob {
  id: string;
  name?: string;
  seeds: string[];
  status: string;
  maxPages: number;
  maxDepth: number;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  stats: { discovered: number; fetched: number; succeeded: number; failed: number; deduplicated: number; indexed: number };
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'health' | 'crawl' | 'index' | 'metrics'>('health');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [indexStatus, setIndexStatus] = useState<Record<string, IndexStatus>>({});
  const [crawlJobs, setCrawlJobs] = useState<CrawlJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_URL}/health/ready`);
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      setError('Failed to fetch health');
    }
  };

  const fetchIndexStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/index/status`);
      const data = await res.json();
      setIndexStatus(data);
    } catch (err) {
      setError('Failed to fetch index status');
    }
  };

  const fetchCrawlJobs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/crawl/jobs`);
      const data = await res.json();
      setCrawlJobs(data);
    } catch (err) {
      setError('Failed to fetch crawl jobs');
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchIndexStatus();
    fetchCrawlJobs();
    const interval = setInterval(() => {
      if (activeTab === 'health') fetchHealth();
      if (activeTab === 'index') fetchIndexStatus();
      if (activeTab === 'crawl') fetchCrawlJobs();
    }, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const tabs = [
    { id: 'health', label: 'System Health', icon: '🏥' },
    { id: 'crawl', label: 'Crawl Operations', icon: '🕷️' },
    { id: 'index', label: 'Index Management', icon: '📊' },
    { id: 'metrics', label: 'Metrics', icon: '📈' },
  ];

  return (
    <div className="min-h-screen">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <span className="text-2xl">🔍</span> LumaSearch Admin
          </h1>
          <div className="flex gap-2">
            <button onClick={fetchHealth} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Refresh</button>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto pb-2" aria-label="Admin tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {activeTab === 'health' && <HealthTab health={health} />}
        {activeTab === 'crawl' && <CrawlTab jobs={crawlJobs} />}
        {activeTab === 'index' && <IndexTab status={indexStatus} />}
        {activeTab === 'metrics' && <MetricsTab />}
      </main>
    </div>
  );
}

function HealthTab({ health }: { health: HealthResponse | null }) {
  if (!health) return <div className="text-center py-12">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span className={`w-3 h-3 rounded-full ${health.status === 'ok' ? 'bg-green-500' : health.status === 'degraded' ? 'bg-amber-500' : 'bg-red-500'}`} />
        <h2 className="text-lg font-medium capitalize">System status: {health.status}</h2>
        <span className="text-sm text-gray-500">Version: {health.version}</span>
        <span className="text-sm text-gray-500">Uptime: {Math.floor(health.uptimeSeconds / 60)}m</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Object.entries(health.checks).map(([name, check]) => (
          <div key={name} className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="font-medium capitalize">{name}</h3>
              <span className={`w-2 h-2 rounded-full ${check.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <p className="text-sm text-gray-500 mt-1">{check.latencyMs ? `${check.latencyMs}ms` : 'N/A'}</p>
            {check.detail && <p className="text-xs text-gray-400 mt-1">{check.detail}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function CrawlTab({ jobs }: { jobs: CrawlJob[] }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Crawl Jobs ({jobs.length})</h2>
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No crawl jobs yet. Submit one via API.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Seeds</th>
                <th className="pb-2 font-medium">Progress</th>
                <th className="pb-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(job => (
                <tr key={job.id} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-3 font-mono text-sm">{job.name || job.id.slice(0, 8)}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      job.status === 'running' ? 'bg-blue-100 text-blue-700' :
                      job.status === 'completed' ? 'bg-green-100 text-green-700' :
                      job.status === 'failed' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>{job.status}</span>
                  </td>
                  <td className="py-3 text-sm text-gray-600 dark:text-gray-400">{job.seeds.length} URLs</td>
                  <td className="py-3 text-sm">
                    {job.stats.succeeded}/{job.stats.discovered} ({job.stats.indexed} indexed)
                  </td>
                  <td className="py-3 text-sm text-gray-500">{new Date(job.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IndexTab({ status }: { status: Record<string, IndexStatus> }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Index Status</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(status).map(([vertical, data]) => (
          <div key={vertical} className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg">
            <h3 className="font-medium capitalize mb-2">{vertical}</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Active Index</dt>
                <dd className="font-mono text-xs">{data.activeIndex || 'none'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Documents</dt>
                <dd>{data.docs?.toLocaleString() ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Size</dt>
                <dd>{data.sizeBytes ? (data.sizeBytes / 1e6).toFixed(1) + ' MB' : '—'}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricsTab() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Metrics (Prometheus)</h2>
      <p className="text-gray-500">
        Metrics are exposed at <code className="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{API_URL}/metrics</code>.
        Scrape with Prometheus or view raw output.
      </p>
      <div className="p-4 border border-gray-200 dark:border-gray-800 rounded-lg font-mono text-xs bg-gray-50 dark:bg-gray-900 overflow-x-auto">
        <a href={`${API_URL}/metrics`} target="_blank" rel="noopener" className="text-blue-600 hover:underline">
          View raw metrics →
        </a>
      </div>
    </div>
  );
}
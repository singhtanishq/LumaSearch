/**
 * Text normalization, chunking, and snippet helpers.
 */

export interface ChunkOptions {
  maxTokens?: number;
  overlapTokens?: number;
  minChunkChars?: number;
}

const DEFAULT_CHUNK: Required<ChunkOptions> = {
  maxTokens: 220,
  overlapTokens: 40,
  minChunkChars: 40,
};

/**
 * Approximate token count (words + punctuation split). Good enough for budgeting.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text on paragraph/sentence boundaries with token overlap.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const opts = { ...DEFAULT_CHUNK, ...options };
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    const joined = current.join('\n\n');
    if (joined.length >= opts.minChunkChars) chunks.push(joined);
    current = [];
    currentTokens = 0;
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);
    if (paraTokens > opts.maxTokens) {
      // Split long paragraphs by sentence, preserving overlap
      flush();
      const sentences = para.split(/(?<=[.!?。！？])\s+/);
      let window: string[] = [];
      let windowTokens = 0;
      for (const sentence of sentences) {
        const st = estimateTokens(sentence);
        if (windowTokens + st > opts.maxTokens && window.length > 0) {
          const joined = window.join(' ');
          if (joined.length >= opts.minChunkChars) chunks.push(joined);
          // keep tail for overlap
          const keepFrom = Math.max(0, windowTokens - opts.overlapTokens);
          let kept: string[] = [];
          let keptTokens = 0;
          for (let i = window.length - 1; i >= 0; i--) {
            keptTokens += estimateTokens(window[i]!);
            if (windowTokens - keptTokens <= keepFrom) {
              kept = window.slice(i);
              break;
            }
          }
          window = kept;
          windowTokens = keptTokens;
        }
        window.push(sentence);
        windowTokens += st;
      }
      if (window.length > 0) {
        const joined = window.join(' ');
        if (joined.length >= opts.minChunkChars) chunks.push(joined);
      }
      continue;
    }

    if (currentTokens + paraTokens > opts.maxTokens && current.length > 0) {
      flush();
    }
    current.push(para);
    currentTokens += paraTokens;
  }
  flush();
  return chunks;
}

/**
 * Strip HTML tags and decode common entities for snippet generation.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text for display, preferring word boundaries.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice).trimEnd() + '…';
}

/**
 * Extract a query-aware snippet from content around best matching region.
 */
export function extractSnippet(content: string, query: string, maxLength = 160): string {
  if (!query) return truncate(content, maxLength);
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  const lower = content.toLowerCase();
  let bestPos = -1;
  let bestScore = 0;
  const step = Math.max(1, Math.floor((content.length - maxLength) / 20) || 1);
  for (let pos = 0; pos < Math.max(1, content.length - maxLength); pos += step) {
    const window = lower.slice(pos, pos + maxLength);
    const score = terms.reduce((acc, t) => acc + (window.includes(t) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }
  if (bestPos <= 0 && bestScore === 0) return truncate(content, maxLength);
  const start = Math.max(0, bestPos - 20);
  return (start > 0 ? '…' : '') + truncate(content.slice(start, start + maxLength + 20), maxLength);
}

/**
 * Normalize unicode whitespace and typographic variants.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}
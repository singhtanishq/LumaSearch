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
  minChunkChars: 10,
};

/**
 * Approximate token count (words + punctuation split). Good enough for budgeting.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Chunk text on paragraph/sentence boundaries with token overlap.
 * Handles both multi-paragraph and single-paragraph text.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const opts = { ...DEFAULT_CHUNK, ...options };
  const chunks: string[] = [];

  // First, try to split by paragraphs (double newlines)
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    // Multi-paragraph: process each paragraph
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
        // Long paragraph: split by sentences
        flush();
        chunks.push(...splitLongParagraph(para, opts));
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

  // Single paragraph or no paragraphs: split by sentences
  return splitLongParagraph(text, opts);
}

function splitLongParagraph(text: string, opts: Required<ChunkOptions>): string[] {
  const chunks: string[] = [];
  
  // Try to split by sentence boundaries
  const sentences = text.split(/(?<=[.!?。！？])\s+/).filter(Boolean);
  
  // If no sentence boundaries found, fall back to word-based chunking
  if (sentences.length <= 1) {
    return chunkByWords(text, opts);
  }

  let window: string[] = [];
  let windowTokens = 0;

  for (const sentence of sentences) {
    const st = estimateTokens(sentence);
    if (windowTokens + st > opts.maxTokens && window.length > 0) {
      const joined = window.join(' ');
      if (joined.length >= opts.minChunkChars) chunks.push(joined);

      // Keep tail for overlap
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

  return chunks;
}

function chunkByWords(text: string, opts: Required<ChunkOptions>): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let window: string[] = [];
  let windowTokens = 0;

  for (const word of words) {
    const wt = estimateTokens(word);
    if (windowTokens + wt > opts.maxTokens && window.length > 0) {
      const joined = window.join(' ');
      if (joined.length >= opts.minChunkChars) chunks.push(joined);

      // Keep tail for overlap
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
    window.push(word);
    windowTokens += wt;
  }

  if (window.length > 0) {
    const joined = window.join(' ');
    if (joined.length >= opts.minChunkChars) chunks.push(joined);
  }

  return chunks;
}

/**
 * Strip HTML tags and decode common entities for snippet generation.
 * Preserves literal < > characters that aren't part of valid HTML tags.
 */
export function stripHtml(html: string): string {
  // First decode entities (but only the common ones)
  let text = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'");

  // Remove script/style content entirely (these are always valid tags)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // Remove HTML tags but preserve standalone < and > characters
  // Match tags like <p>, <div class="...">, <br/>, etc. but not standalone < >
  text = text.replace(/<\/?[a-zA-Z][^>]*>/g, ' ');

  // Clean up whitespace
  return text.replace(/\s+/g, ' ').trim();
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
 * Ensures matched terms are preserved in the output.
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
  if (bestPos < 0 && bestScore === 0) return truncate(content, maxLength);
  
  // Extend window to include full matched terms
  const start = Math.max(0, bestPos - 20);
  let end = bestPos + maxLength + 20;
  
  // Extend end to include any matched terms that cross the boundary
  for (const term of terms) {
    const termIdx = lower.indexOf(term, bestPos);
    if (termIdx >= 0 && termIdx + term.length > end) {
      end = termIdx + term.length;
    }
  }
  
  const snippet = content.slice(start, end);
  const prefix = start > 0 ? '…' : '';
  return prefix + truncate(snippet, maxLength);
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
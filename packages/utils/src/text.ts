// ============================================================
// Text Utilities
// ============================================================

/**
 * Truncate text to a maximum length, preserving word boundaries
 */
export function truncate(text: string, maxLength: number, suffix = '…'): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= suffix.length) return suffix.slice(0, maxLength);
  
  const truncated = text.slice(0, maxLength - suffix.length);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.5) {
    return truncated.slice(0, lastSpace) + suffix;
  }
  
  return truncated + suffix;
}

/**
 * Extract snippet around a query match
 */
export function extractSnippet(
  text: string,
  query: string,
  options: {
    maxLength?: number;
    contextChars?: number;
    highlightTags?: { open: string; close: string };
  } = {}
): { snippet: string; highlighted: string; hasMatch: boolean } {
  const { maxLength = 300, contextChars = 100, highlightTags = { open: '<mark>', close: '</mark>' } } = options;
  
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const matchIndex = lowerText.indexOf(lowerQuery);
  
  if (matchIndex === -1) {
    return {
      snippet: truncate(text, maxLength),
      highlighted: truncate(text, maxLength),
      hasMatch: false,
    };
  }
  
  const start = Math.max(0, matchIndex - contextChars);
  const end = Math.min(text.length, matchIndex + query.length + contextChars);
  
  let snippet = text.slice(start, end);
  let highlighted = snippet;
  
  // Add context indicators
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  
  // Highlight the match in the highlighted version
  const matchStart = matchIndex - start;
  const matchEnd = matchStart + query.length;
  highlighted = 
    snippet.slice(0, matchStart) +
    highlightTags.open +
    snippet.slice(matchStart, matchEnd) +
    highlightTags.close +
    snippet.slice(matchEnd);
  
  // Truncate if still too long
  if (snippet.length > maxLength) {
    snippet = truncate(snippet, maxLength);
    highlighted = truncate(highlighted, maxLength + highlightTags.open.length + highlightTags.close.length);
  }
  
  return { snippet, highlighted, hasMatch: true };
}

/**
 * Clean and normalize text for indexing
 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')             // CR to LF
    .replace(/\t/g, ' ')              // Tabs to spaces
    .replace(/\u00A0/g, ' ')          // Non-breaking spaces
    .replace(/\u200B/g, '')           // Zero-width spaces
    .replace(/\uFEFF/g, '')           // BOM
    .replace(/[ \t]+/g, ' ')          // Multiple spaces/tabs to single space
    .replace(/\n{3,}/g, '\n\n')       // Max 2 consecutive newlines
    .trim();
}

/**
 * Strip HTML tags and return plain text
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')   // Remove styles
    .replace(/<!--[\s\S]*?-->/g, '')                                     // Remove comments
    .replace(/<[^>]+>/g, ' ')                                            // Remove tags
    .replace(/&nbsp;/g, ' ')                                             // Replace &nbsp;
    .replace(/&[a-z]+;/gi, '')                                           // Remove other entities (simplified)
    .replace(/\s+/g, ' ')                                                // Normalize whitespace
    .trim();
}

/**
 * Extract text content from HTML, preserving some structure
 */
export function extractTextFromHtml(html: string): {
  text: string;
  headings: Array<{ level: number; text: string; anchor?: string }>;
  links: Array<{ url: string; text: string }>;
} {
  const headings: Array<{ level: number; text: string; anchor?: string }> = [];
  const links: Array<{ url: string; text: string }> = [];
  
  // Extract headings
  const headingRegex = /<h([1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  while ((match = headingRegex.exec(html)) !== null) {
    const level = parseInt(match[1], 10);
    const content = stripHtml(match[2]);
    const anchorMatch = match[0].match(/id=["']([^"']+)["']/i);
    headings.push({
      level,
      text: content,
      anchor: anchorMatch ? anchorMatch[1] : undefined,
    });
  }
  
  // Extract links
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const text = stripHtml(match[2]);
    if (url && text) {
      links.push({ url, text });
    }
  }
  
  // Get main text
  const text = stripHtml(html);
  
  return { text, headings, links };
}

/**
 * Calculate word count
 */
export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculate reading time in minutes
 */
export function readingTime(text: string, wordsPerMinute = 200): number {
  return Math.ceil(wordCount(text) / wordsPerMinute);
}

/**
 * Generate slug from text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')     // Remove special chars
    .replace(/[\s_-]+/g, '-')     // Replace spaces/underscores with hyphens
    .replace(/^-+|-+$/g, '');     // Trim hyphens
}

/**
 * Check if text contains potential prompt injection
 */
export function detectPromptInjection(text: string): { detected: boolean; patterns: string[] } {
  const injectionPatterns = [
    /ignore\s+(?:previous|above|all)\s+(?:instructions|prompts?|rules?)/i,
    /disregard\s+(?:previous|above|all)\s+(?:instructions|prompts?|rules?)/i,
    /forget\s+(?:previous|above|all)\s+(?:instructions|prompts?|rules?)/i,
    /system\s*:\s*you\s+are/i,
    /you\s+are\s+(?:now|an?)\s+/i,
    /act\s+as\s+(?:an?|if\s+you\s+were)\s+/i,
    /pretend\s+(?:to\s+be|you\s+are)\s+/i,
    /roleplay\s+as\s+/i,
    /<\|system\|>/i,
    /<\|user\|>/i,
    /<\|assistant\|>/i,
    /\[INST\]/i,
    /\[SYS\]/i,
    /###\s*Instruction/i,
    /###\s*System/i,
    /output\s+only\s+(?:the|json)/i,
    /return\s+only\s+(?:the|json)/i,
    /print\s+(?:your|the)\s+(?:prompt|instructions|system)/i,
    /reveal\s+(?:your|the)\s+(?:prompt|instructions|system)/i,
    /what\s+(?:is|are)\s+your\s+(?:instructions|prompt|rules)/i,
    /repeat\s+(?:your|the)\s+(?:prompt|instructions|system)/i,
    /bypass\s+(?:safety|security|filters?)/i,
    /disable\s+(?:safety|security|filters?)/i,
  ];
  
  const detected: string[] = [];
  for (const pattern of injectionPatterns) {
    if (pattern.test(text)) {
      detected.push(pattern.source);
    }
  }
  
  return { detected: detected.length > 0, patterns: detected };
}

/**
 * Sanitize text by removing potential prompt injection patterns
 */
export function sanitizePromptInjection(text: string): string {
  const { patterns } = detectPromptInjection(text);
  let sanitized = text;
  
  for (const patternSource of patterns) {
    const pattern = new RegExp(patternSource, 'gi');
    sanitized = sanitized.replace(pattern, '[REDACTED: PROMPT INJECTION]');
  }
  
  return sanitized;
}

/**
 * Split text into overlapping chunks
 */
export function chunkText(
  text: string,
  options: {
    chunkSize?: number;
    overlap?: number;
    separator?: string;
  } = {}
): string[] {
  const { chunkSize = 512, overlap = 50, separator = '\n\n' } = options;
  
  if (text.length <= chunkSize) return [text];
  
  const chunks: string[] = [];
  const paragraphs = text.split(separator).filter(p => p.trim().length > 0);
  
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length + separator.length <= chunkSize) {
      currentChunk += (currentChunk ? separator : '') + paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      
      // If paragraph is longer than chunkSize, split it
      if (paragraph.length > chunkSize) {
        let start = 0;
        while (start < paragraph.length) {
          const end = Math.min(start + chunkSize, paragraph.length);
          chunks.push(paragraph.slice(start, end).trim());
          start += chunkSize - overlap;
        }
        currentChunk = '';
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) chunks.push(currentChunk.trim());
  
  return chunks.filter(c => c.length > 0);
}

/**
 * Calculate similarity between two strings (Jaccard on words)
 */
export function jaccardSimilarity(text1: string, text2: string): number {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(Boolean));
  
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  
  const union = words1.size + words2.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extract potential key phrases (simple frequency-based)
 */
export function extractKeyPhrases(text: string, maxPhrases = 10): string[] {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const freq = new Map<string, number>();
  
  for (const word of words) {
    freq.set(word, (freq.get(word) || 0) + 1);
  }
  
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxPhrases)
    .map(([word]) => word);
}

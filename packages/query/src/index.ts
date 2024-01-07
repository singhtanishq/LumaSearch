/**
 * Query understanding: parsing, operator extraction, normalization,
 * intent detection, spell-correction candidates.
 */
import type {
  QueryInterpretation,
  QueryOperators,
  QueryIntent,
  SearchFilters,
} from '@luma-search/types';
import { normalizeText } from '@luma-search/utils';

// ─── Operator parsing ───────────────────────────────────────────────────────

const OPERATOR_KEYS = [
  'site',
  'filetype',
  'intitle',
  'inurl',
  'before',
  'after',
  'lang',
  'domain',
  'language',
] as const;
type OperatorKey = (typeof OPERATOR_KEYS)[number];

const DATE_WORDS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/**
 * Parse operators like site:example.com, filetype:pdf, intitle:"foo bar",
 * -excluded, "exact phrase", before:2024-01-01, after:2023, lang:de.
 */
export function parseOperators(rawQuery: string): { operators: QueryOperators; cleaned: string } {
  const operators: QueryOperators = {
    phrases: [],
    exclusions: [],
  };
  let cleaned = rawQuery;

  // Quoted phrases (remove from cleaned, keep in operators)
  const phraseRe = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = phraseRe.exec(rawQuery)) !== null) {
    operators.phrases.push(m[1]!);
  }
  cleaned = cleaned.replace(phraseRe, ' ');

  // key:value operators (value may be quoted)
  const opRe = new RegExp(`-?(?:${OPERATOR_KEYS.join('|')}):(?:"([^"]+)"|(\\S+))`, 'gi');
  while ((m = opRe.exec(rawQuery)) !== null) {
    const key = m[0]!.split(':')[0]!.replace(/^-/, '').toLowerCase() as OperatorKey;
    const value = (m[1] ?? m[2] ?? '').trim();
    if (!value) continue;
    switch (key) {
      case 'site':
      case 'domain':
        operators.site = value.replace(/^https?:\/\//, '').replace(/\/$/, '');
        break;
      case 'filetype':
        operators.filetype = value.replace(/^\./, '');
        break;
      case 'intitle':
        operators.intitle = [...(operators.intitle ?? []), value];
        break;
      case 'inurl':
        operators.inurl = [...(operators.inurl ?? []), value];
        break;
      case 'before':
        operators.before = normalizeDate(value);
        break;
      case 'after':
        operators.after = normalizeDate(value);
        break;
      case 'lang':
      case 'language':
        operators.lang = value.slice(0, 2).toLowerCase();
        break;
      default:
        break;
    }
    cleaned = cleaned.replace(m[0], ' ');
  }

  // Exclusions: -term
  const exclRe = /(?:^|\s)-([^\s"]+)/g;
  while ((m = exclRe.exec(rawQuery)) !== null) {
    operators.exclusions.push(m[1]!);
  }
  cleaned = cleaned.replace(exclRe, ' ');

  cleaned = normalizeText(cleaned.replace(/\s+/g, ' ').trim());
  return { operators, cleaned: cleaned === '' ? normalizeText(rawQuery) : cleaned };
}

function normalizeDate(value: string): string {
  const lower = value.toLowerCase();
  // year only
  if (/^\d{4}$/.test(lower)) return `${lower}-01-01`;
  // month name + year e.g. "January 2024"
  const monthYear = lower.match(/^([a-z]+)\s+(\d{4})$/);
  if (monthYear && DATE_WORDS[monthYear[1]!]) {
    return `${monthYear[2]}-${DATE_WORDS[monthYear[1]!]}-01`;
  }
  return value;
}

// ─── Intent detection ───────────────────────────────────────────────────────

const INTENT_SIGNALS: Array<[QueryIntent, RegExp]> = [
  ['definition', /\b(what is|what are|define|definition of|meaning of)\b/i],
  ['comparison', /\b(vs\.?|versus|compare|difference between|better than)\b/i],
  ['troubleshooting', /\b(error|fix|not working|fails|crash|debug|cannot|can't|broken)\b/i],
  ['news', /\b(news|latest|breaking|today|yesterday|this week)\b/i],
  [
    'code',
    /\b(code|function|api|library|npm|pip|github|stack trace|compile|typescript|python|rust|golang)\b/i,
  ],
  ['docs', /\b(documentation|docs|guide|reference|manual|tutorial|how to)\b/i],
  ['research', /\b(paper|study|research|arxiv|survey|benchmark|analysis)\b/i],
  ['transactional', /\b(buy|price|shop|order|download|subscribe|coupon|deal)\b/i],
  ['navigational', /^(login|sign in|home(page)?)\b|\.com\b|\.org\b|\.io\b/i],
];

export function detectIntent(query: string): { intent?: QueryIntent; confidence: number } {
  const matches: QueryIntent[] = [];
  for (const [intent, re] of INTENT_SIGNALS) {
    if (re.test(query)) matches.push(intent);
  }
  if (matches.length === 0) return { intent: 'informational', confidence: 0.4 };
  return { intent: matches[0], confidence: matches.length === 1 ? 0.8 : 0.6 };
}

// ─── Spell correction candidates ────────────────────────────────────────────

const COMMON_CORRECTIONS: Record<string, string> = {
  javascrip: 'javascript',
  typescirpt: 'typescript',
  nodejs: 'node.js',
  reactjs: 'react.js',
  elasticserach: 'elasticsearch',
  serach: 'search',
  databse: 'database',
  recieve: 'receive',
  seperate: 'separate',
};

export function correctionCandidates(query: string): string[] {
  const corrections: string[] = [];
  for (const [wrong, right] of Object.entries(COMMON_CORRECTIONS)) {
    const re = new RegExp(`\\b${wrong}\\b`, 'i');
    if (re.test(query)) {
      corrections.push(query.replace(re, right));
    }
  }
  return corrections;
}

// ─── Language detection (script-based heuristic; no deps) ───────────────────

export function detectLanguage(text: string): string {
  if (/[\u0400-\u04FF]/.test(text)) return 'ru';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
  if (/[\u3040-\u30FF]/.test(text)) return 'ja';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar';
  if (/[\u0590-\u05FF]/.test(text)) return 'he';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
  return 'en';
}

// ─── Full interpretation ────────────────────────────────────────────────────

export function interpretQuery(rawQuery: string): QueryInterpretation {
  const { operators, cleaned } = parseOperators(rawQuery);
  const { intent, confidence } = detectIntent(rawQuery);
  const language = operators.lang ?? detectLanguage(cleaned || rawQuery);
  const corrections = correctionCandidates(rawQuery);

  return {
    original: rawQuery,
    normalized: cleaned,
    operators,
    detectedIntent: intent,
    language,
    corrections,
    confidence,
  };
}

/**
 * Derive structured search filters from operators (shared by API + search engine).
 */
export function filtersFromOperators(
  operators: QueryOperators,
  explicit?: SearchFilters
): SearchFilters {
  return {
    ...explicit,
    domains: operators.site ? [operators.site] : explicit?.domains,
    fileTypes: operators.filetype ? [operators.filetype] : explicit?.fileTypes,
    languages: operators.lang ? [operators.lang] : explicit?.languages,
    dateTo: operators.before ?? explicit?.dateTo,
    dateFrom: operators.after ?? explicit?.dateFrom,
  };
}

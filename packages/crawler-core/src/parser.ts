/**
 * HTML parsing and main-content extraction using linkedom (fast, safe DOM).
 * Extracts title, headings, text, links with anchors, metadata, timestamps.
 */
import { parseHTML } from 'linkedom';
import { stripHtml, normalizeText } from '@luma-search/utils';

export interface ParsedPage {
  title: string;
  text: string;
  headings: string[];
  links: Array<{ url: string; anchor: string }>;
  meta: {
    description?: string;
    author?: string;
    organization?: string;
    publishedAt?: string;
    modifiedAt?: string;
    canonical?: string;
    noindex?: boolean;
    language?: string;
    ogType?: string;
    faq?: Array<{ question: string; answer: string }>;
    breadcrumb?: string[];
  };
  isBoilerplateHeavy: boolean;
  wordCount: number;
}

const BOILERPLATE_SELECTORS = [
  'script', 'style', 'noscript', 'svg', 'iframe', 'form',
  'nav', 'header', 'footer', 'aside',
  '[role=navigation]', '[role=banner]', '[role=contentinfo]',
];

export function parseHtml(html: string, baseUrl: string): ParsedPage {
  const { document } = parseHTML(html);

  // Title
  const title = normalizeText(
    document.querySelector('title')?.textContent ??
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
      ''
  );

  // Remove boilerplate from the working copy
  for (const sel of BOILERPLATE_SELECTORS) {
    document.querySelectorAll(sel).forEach((el: { remove: () => void }) => el.remove());
  }

  // Headings
  const headings: string[] = [];
  document.querySelectorAll('h1, h2, h3').forEach((h: { textContent: string | null }) => {
    const t = normalizeText(h.textContent ?? '');
    if (t) headings.push(t);
  });

  // Main content heuristics: <article>, <main>, [role=main], else body
  const main =
    document.querySelector('article') ??
    document.querySelector('main') ??
    document.querySelector('[role=main]') ??
    document.body;
  const text = normalizeText(main?.textContent?.replace(/\s+/g, ' ') ?? '');

  // Links with anchor text
  const links: Array<{ url: string; anchor: string }> = [];
  document.querySelectorAll('a[href]').forEach((a: { getAttribute: (n: string) => string | null; textContent: string | null }) => {
    try {
      const href = new URL(a.getAttribute('href') ?? '', baseUrl).toString();
      if (href.startsWith('http')) {
        links.push({ url: href, anchor: normalizeText(a.textContent ?? '').slice(0, 200) });
      }
    } catch {
      // skip malformed hrefs
    }
  });

  // rel=canonical on the ORIGINAL document (pre-removal doesn't matter for head)
  const canonicalLink = document.querySelector('link[rel=canonical]')?.getAttribute('href');

  // Metadata
  const meta = (name: string): string | undefined =>
    document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? undefined;
  const ogMeta = (name: string): string | undefined =>
    document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ?? undefined;

  const ldJson: Record<string, unknown>[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((s: { textContent: string | null }) => {
    try {
      const parsed = JSON.parse(s.textContent ?? 'null');
      if (Array.isArray(parsed)) ldJson.push(...parsed);
      else if (parsed) ldJson.push(parsed);
    } catch {
      // malformed JSON-LD ignored
    }
  });

  const findLd = (type: string): Record<string, unknown> | undefined =>
    ldJson.find((o) => String(o['@type'] ?? '').toLowerCase() === type.toLowerCase());

  const article = findLd('Article') ?? findLd('NewsArticle') ?? findLd('BlogPosting');
  const faqPage = findLd('FAQPage');
  const breadcrumbList = findLd('BreadcrumbList');

  const faq: Array<{ question: string; answer: string }> = [];
  if (faqPage && Array.isArray(faqPage['mainEntity'])) {
    for (const q of faqPage['mainEntity'] as Array<Record<string, unknown>>) {
      const question = typeof q['name'] === 'string' ? q['name'] : undefined;
      const answerObj = q['acceptedAnswer'] as { text?: string } | undefined;
      const answer = typeof answerObj?.text === 'string' ? stripHtml(answerObj.text) : undefined;
      if (question && answer) faq.push({ question, answer });
    }
  }

  const breadcrumb: string[] = [];
  if (breadcrumbList && Array.isArray(breadcrumbList['itemListElement'])) {
    for (const item of breadcrumbList['itemListElement'] as Array<Record<string, unknown>>) {
      const name = (item['item'] as { name?: string })?.name ?? (typeof item['name'] === 'string' ? item['name'] : undefined);
      if (typeof name === 'string') breadcrumb.push(name);
    }
  }

  const timeEl = document.querySelector('time[datetime]')?.getAttribute('datetime');
  const publishedAt =
    (article?.['datePublished'] as string | undefined) ??
    timeEl ??
    meta('article:published_time') ??
    ogMeta('article:published_time');
  const modifiedAt =
    (article?.['dateModified'] as string | undefined) ?? meta('article:modified_time');

  const noindex =
    (meta('robots') ?? '').toLowerCase().includes('noindex') ||
    document.querySelector('meta[name="robots"][content*="noindex"]') !== null;

  const wordCount = text ? text.split(/\s+/).length : 0;

  // Boilerplate-heavy: little content relative to links/nav — thin page signal
  const linkCount = links.length;
  const isBoilerplateHeavy = wordCount < 60 && linkCount > 40;

  return {
    title,
    text,
    headings,
    links,
    meta: {
      description: meta('description') ?? ogMeta('og:description'),
      author: meta('author') ?? (article?.['author'] as { name?: string } | undefined)?.name,
      organization: ogMeta('og:site_name') ?? (article?.['publisher'] as { name?: string } | undefined)?.name,
      publishedAt,
      modifiedAt,
      canonical: canonicalLink ?? undefined,
      noindex,
      language: document.querySelector('html')?.getAttribute('lang') ?? undefined,
      ogType: ogMeta('og:type'),
      faq: faq.length ? faq : undefined,
      breadcrumb: breadcrumb.length ? breadcrumb : undefined,
    },
    isBoilerplateHeavy,
    wordCount,
  };
}
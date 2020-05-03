// ============================================================
// Date Utilities
// ============================================================

/**
 * Parse various date formats to ISO string
 */
export function parseDate(input: string | Date | number | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input);
  
  // Try ISO string first
  const iso = new Date(input);
  if (!isNaN(iso.getTime())) return iso;
  
  // Try common formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,                    // YYYY-MM-DD
    /^(\d{4})\/(\d{2})\/(\d{2})$/,                  // YYYY/MM/DD
    /^(\d{2})-(\d{2})-(\d{4})$/,                    // DD-MM-YYYY
    /^(\d{2})\/(\d{2})\/(\d{4})$/,                  // DD/MM/YYYY
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/, // YYYY-MM-DD HH:MM:SS
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/,  // YYYY-MM-DD HH:MM
  ];
  
  for (const format of formats) {
    const match = input.match(format);
    if (match) {
      const date = new Date(match[0]);
      if (!isNaN(date.getTime())) return date;
    }
  }
  
  return null;
}

/**
 * Format date to ISO string (UTC)
 */
export function toIsoString(date: Date | string | number): string {
  const d = date instanceof Date ? date : new Date(date);
  return d.toISOString();
}

/**
 * Format date for display
 */
export function formatDate(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  },
  locale = 'en-US'
): string {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat(locale, options).format(d);
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date | string | number, locale = 'en-US'): string {
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);
  
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  
  if (diffSecs < 60) return rtf.format(-diffSecs, 'second');
  if (diffMins < 60) return rtf.format(-diffMins, 'minute');
  if (diffHours < 24) return rtf.format(-diffHours, 'hour');
  if (diffDays < 7) return rtf.format(-diffDays, 'day');
  if (diffWeeks < 4) return rtf.format(-diffWeeks, 'week');
  if (diffMonths < 12) return rtf.format(-diffMonths, 'month');
  return rtf.format(-diffYears, 'year');
}

/**
 * Get start of day (UTC)
 */
export function startOfDay(date: Date | string | number): Date {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Get end of day (UTC)
 */
export function endOfDay(date: Date | string | number): Date {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Add duration to date
 */
export function addDuration(
  date: Date | string | number,
  duration: { years?: number; months?: number; days?: number; hours?: number; minutes?: number; seconds?: number }
): Date {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  if (duration.years) d.setUTCFullYear(d.getUTCFullYear() + duration.years);
  if (duration.months) d.setUTCMonth(d.getUTCMonth() + duration.months);
  if (duration.days) d.setUTCDate(d.getUTCDate() + duration.days);
  if (duration.hours) d.setUTCHours(d.getUTCHours() + duration.hours);
  if (duration.minutes) d.setUTCMinutes(d.getUTCMinutes() + duration.minutes);
  if (duration.seconds) d.setUTCSeconds(d.getUTCSeconds() + duration.seconds);
  return d;
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date | string | number): boolean {
  return new Date(date).getTime() < Date.now();
}

/**
 * Check if date is in the future
 */
export function isFuture(date: Date | string | number): boolean {
  return new Date(date).getTime() > Date.now();
}

/**
 * Get age of date in milliseconds
 */
export function ageInMs(date: Date | string | number): number {
  return Date.now() - new Date(date).getTime();
}

/**
 * Get age of date in human-readable format
 */
export function ageHuman(date: Date | string | number): string {
  const ms = ageInMs(date);
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${secs % 60}s`;
  return `${secs}s`;
}

/**
 * Check if two dates are on the same day (UTC)
 */
export function isSameDay(date1: Date | string | number, date2: Date | string | number): boolean {
  const d1 = date1 instanceof Date ? date1 : new Date(date1);
  const d2 = date2 instanceof Date ? date2 : new Date(date2);
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
}

/**
 * Get ISO week number
 */
export function getWeekNumber(date: Date | string | number): number {
  const d = date instanceof Date ? date : new Date(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const firstThursdayDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstThursdayDayNr + 3);
  const diff = target.getTime() - firstThursday.getTime();
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
}

/**
 * Parse duration string (e.g., "1h30m", "2d", "90m") to milliseconds
 */
export function parseDuration(duration: string): number {
  const regex = /(\d+)([dhms])/g;
  let ms = 0;
  let match;
  while ((match = regex.exec(duration)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 'd': ms += value * 24 * 60 * 60 * 1000; break;
      case 'h': ms += value * 60 * 60 * 1000; break;
      case 'm': ms += value * 60 * 1000; break;
      case 's': ms += value * 1000; break;
    }
  }
  return ms;
}

/**
 * Format milliseconds as duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/**
 * Get current timestamp in milliseconds
 */
export function now(): number {
  return Date.now();
}

/**
 * Get current timestamp as ISO string
 */
export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    factor?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 30000, factor = 2, shouldRetry = () => true } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts || !shouldRetry(lastError)) {
        throw lastError;
      }
      
      const delay = Math.min(baseDelay * Math.pow(factor, attempt - 1), maxDelay);
      const jitter = Math.random() * delay * 0.3;
      await sleep(delay + jitter);
    }
  }
  
  throw lastError!;
}
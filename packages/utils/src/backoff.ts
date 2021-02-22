/**
 * Retry with exponential backoff + jitter.
 */
export interface BackoffOptions {
  initialMs?: number;
  maxMs?: number;
  factor?: number;
  jitter?: boolean;
  attempts?: number;
  onRetry?: (attempt: number, error: Error, delayMs: number) => void;
}

export async function withBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  options: BackoffOptions = {}
): Promise<T> {
  const {
    initialMs = 500,
    maxMs = 30_000,
    factor = 2,
    jitter = true,
    attempts = 5,
    onRetry,
  } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt === attempts - 1) break;
      let delay = Math.min(maxMs, initialMs * Math.pow(factor, attempt));
      if (jitter) delay = delay * (0.5 + Math.random() * 0.5);
      delay = Math.floor(delay);
      onRetry?.(attempt + 1, lastError, delay);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError ?? new Error('withBackoff: all attempts failed');
}

/**
 * Circuit breaker per key (host). Opens after N failures, half-opens after cooldown.
 */
export class CircuitBreaker {
  private failures = new Map<string, { count: number; openedAt?: number }>();
  private readonly threshold: number;
  private readonly cooldownMs: number;

  constructor(opts: { threshold?: number; cooldownMs?: number } = {}) {
    this.threshold = opts.threshold ?? 5;
    this.cooldownMs = opts.cooldownMs ?? 60_000;
  }

  isOpen(key: string): boolean {
    const state = this.failures.get(key);
    if (!state || state.openedAt === undefined) return false;
    if (Date.now() - state.openedAt > this.cooldownMs) {
      // half-open: allow one attempt
      state.openedAt = undefined;
      state.count = this.threshold - 1;
      return false;
    }
    return true;
  }

  recordSuccess(key: string): void {
    this.failures.delete(key);
  }

  recordFailure(key: string): void {
    const state = this.failures.get(key) ?? { count: 0 };
    state.count += 1;
    if (state.count >= this.threshold) state.openedAt = Date.now();
    this.failures.set(key, state);
  }
}

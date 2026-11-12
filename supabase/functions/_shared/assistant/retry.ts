/** Retry with exponential backoff + jitter for transient Gemini / network failures. */

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  isRetryable?: (err: unknown) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  sleep?: (ms: number) => Promise<void>;
}

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_MESSAGE =
  /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|UND_ERR|overloaded|RESOURCE_EXHAUSTED|UNAVAILABLE|DEADLINE_EXCEEDED|INTERNAL/i;

export function isTransientError(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; message?: unknown; name?: string } | null;
  if (!e) return false;
  const status = typeof e.status === "number" ? e.status : typeof e.code === "number" ? e.code : undefined;
  if (status !== undefined) return TRANSIENT_STATUS.has(status);
  if (e.name === "AbortError") return false;
  return typeof e.message === "string" && TRANSIENT_MESSAGE.test(e.message);
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 8000,
    isRetryable = isTransientError,
    onRetry,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (0.5 + Math.random() * 0.5);
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
}

/**
 * Retry utility with exponential backoff.
 *
 * Wraps an async function to retry on specified error conditions.
 */

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  retryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  retryable: (error: unknown) => {
    if (error instanceof Error) {
      // Only retry transient server errors and rate limits
      // Do NOT retry: auth errors, timeouts, invalid responses, client errors (4xx)
      const msg = error.message.toLowerCase();

      // Rate limits: retry with backoff
      if (msg.includes("429") || msg.includes("rate limit")) return true;
      if (msg.includes("too many requests")) return true;

      // Server errors: may be transient
      if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504"))
        return true;
      if (msg.includes("internal server error")) return true;
      if (msg.includes("service unavailable")) return true;

      // Network errors: may resolve
      if (msg.includes("network") || msg.includes("econnreset") || msg.includes("econnrefused"))
        return true;
    }
    return false;
  },
};

export function withRetry<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: Partial<RetryOptions>,
): (...args: TArgs) => Promise<TReturn> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (...args: TArgs): Promise<TReturn> => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (attempt < opts.maxRetries) {
          const shouldRetry = opts.retryable?.(error);
          if (!shouldRetry) {
            throw error;
          }

          const delay = Math.min(opts.baseDelayMs * 2 ** attempt, opts.maxDelayMs ?? 30_000);
          const jitter = Math.random() * 0.1 * delay;
          await new Promise((resolve) => setTimeout(resolve, delay + jitter));
        }
      }
    }

    throw lastError;
  };
}

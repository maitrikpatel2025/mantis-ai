/**
 * Retry a function with exponential backoff on 429 (rate limit) errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  maxDelayMs: number = 30000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      // Only retry on rate limit errors (429)
      const is429 =
        (err as { status?: number })?.status === 429 ||
        (err as { statusCode?: number })?.statusCode === 429 ||
        (err as { message?: string })?.message?.includes('429') ||
        (err as { message?: string })?.message?.includes('rate limit');

      if (!is429 || attempt >= maxRetries) {
        throw err;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      console.warn(`[retry] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

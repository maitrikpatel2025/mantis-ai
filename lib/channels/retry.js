async function withRetry(fn, maxRetries = 3, baseDelayMs = 1e3, maxDelayMs = 3e4) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const is429 = err?.status === 429 || err?.statusCode === 429 || err?.message?.includes("429") || err?.message?.includes("rate limit");
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
export {
  withRetry
};

import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../../../lib/channels/retry.js';

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await withRetry(fn, 3, 10, 100);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 errors', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('success');

    const result = await withRetry(fn, 3, 10, 100);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws non-429 errors immediately without retry', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Internal Server Error'));

    await expect(withRetry(fn, 3, 10, 100)).rejects.toThrow('Internal Server Error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after maxRetries exhausted', async () => {
    const error429 = Object.assign(new Error('Too Many Requests'), { status: 429 });
    const fn = vi.fn().mockRejectedValue(error429);

    await expect(withRetry(fn, 2, 10, 100)).rejects.toThrow('Too Many Requests');
    // 1 initial attempt + 2 retries = 3 total
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('detects 429 from message string', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3, 10, 100);

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('detects 429 from statusCode property', async () => {
    const error = Object.assign(new Error('rate limited'), { statusCode: 429 });
    const fn = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue('recovered');

    const result = await withRetry(fn, 3, 10, 100);

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

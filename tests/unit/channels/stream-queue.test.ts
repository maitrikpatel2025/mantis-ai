import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChannelStreamQueue } from '../../../lib/channels/stream-queue.js';

describe('ChannelStreamQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('enqueue schedules a flush after rateLimitMs', async () => {
    const queue = new ChannelStreamQueue(50);
    const flushFn = vi.fn().mockResolvedValue(undefined);

    queue.enqueue('key-1', 'hello world', flushFn);

    // Not called immediately
    expect(flushFn).not.toHaveBeenCalled();

    // Advance past rateLimitMs
    vi.advanceTimersByTime(50);

    // The timer fires synchronously via fake timers; flushFn is called
    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(flushFn).toHaveBeenCalledWith('hello world');
  });

  it('coalesces rapid updates — only last text is flushed', async () => {
    const queue = new ChannelStreamQueue(50);
    const flushFn = vi.fn().mockResolvedValue(undefined);

    queue.enqueue('key-1', 'first', flushFn);
    queue.enqueue('key-1', 'second', flushFn);
    queue.enqueue('key-1', 'third', flushFn);

    vi.advanceTimersByTime(50);

    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(flushFn).toHaveBeenCalledWith('third');
  });

  it('flush() sends all pending updates immediately', async () => {
    vi.useRealTimers();

    const queue = new ChannelStreamQueue(50);
    const flushFn = vi.fn().mockResolvedValue(undefined);

    queue.enqueue('key-1', 'immediate', flushFn);

    // Call flush before the timer fires
    await queue.flush();

    expect(flushFn).toHaveBeenCalledTimes(1);
    expect(flushFn).toHaveBeenCalledWith('immediate');
  });

  it('flush() clears timers so flushFn is not called again', async () => {
    const queue = new ChannelStreamQueue(50);
    const flushFn = vi.fn().mockResolvedValue(undefined);

    queue.enqueue('key-1', 'once only', flushFn);

    // Force flush immediately
    await queue.flush();

    expect(flushFn).toHaveBeenCalledTimes(1);

    // Advance well past the original timer
    vi.advanceTimersByTime(200);

    // Should still only have been called once
    expect(flushFn).toHaveBeenCalledTimes(1);
  });

  it('pendingCount reflects queued items', () => {
    const queue = new ChannelStreamQueue(50);
    const flushFn = vi.fn().mockResolvedValue(undefined);

    expect(queue.pendingCount).toBe(0);

    queue.enqueue('key-a', 'text-a', flushFn);
    queue.enqueue('key-b', 'text-b', flushFn);

    expect(queue.pendingCount).toBe(2);
  });

  it('handles flush errors gracefully', async () => {
    vi.useRealTimers();

    const queue = new ChannelStreamQueue(50);
    const flushFn = vi.fn().mockRejectedValue(new Error('send failed'));

    // Suppress the expected console.error from _flushKey / flush
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    queue.enqueue('key-1', 'will fail', flushFn);

    // flush() should not throw even though flushFn rejects
    await expect(queue.flush()).resolves.toBeUndefined();

    consoleSpy.mockRestore();
  });

  it('independent keys flush independently', () => {
    const queue = new ChannelStreamQueue(50);
    const flushA = vi.fn().mockResolvedValue(undefined);
    const flushB = vi.fn().mockResolvedValue(undefined);

    queue.enqueue('key-a', 'text-a', flushA);
    queue.enqueue('key-b', 'text-b', flushB);

    vi.advanceTimersByTime(50);

    expect(flushA).toHaveBeenCalledTimes(1);
    expect(flushA).toHaveBeenCalledWith('text-a');
    expect(flushB).toHaveBeenCalledTimes(1);
    expect(flushB).toHaveBeenCalledWith('text-b');
  });
});

/**
 * Rate-limited stream queue for channel message updates.
 * Coalesces rapid stream updates to avoid hitting API rate limits.
 */
export class ChannelStreamQueue {
  private _pending: Map<string, { text: string; flush: (text: string) => Promise<void> }> = new Map();
  private _timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private _rateLimitMs: number;

  constructor(rateLimitMs: number = 1500) {
    this._rateLimitMs = rateLimitMs;
  }

  /**
   * Enqueue an update. The latest text wins — intermediate texts are discarded.
   * The flushFn is called at most once per rateLimitMs per key.
   */
  enqueue(key: string, text: string, flushFn: (text: string) => Promise<void>): void {
    this._pending.set(key, { text, flush: flushFn });

    // If no timer is running for this key, start one
    if (!this._timers.has(key)) {
      this._timers.set(
        key,
        setTimeout(() => {
          this._flushKey(key);
        }, this._rateLimitMs)
      );
    }
  }

  /**
   * Flush a specific key immediately.
   */
  private _flushKey(key: string): void {
    const entry = this._pending.get(key);
    this._pending.delete(key);
    this._timers.delete(key);

    if (entry) {
      entry.flush(entry.text).catch((err) => {
        console.error(`[stream-queue] Flush failed for ${key}:`, err);
      });
    }
  }

  /**
   * Force-flush all pending updates immediately.
   */
  async flush(): Promise<void> {
    // Clear all timers
    for (const [key, timer] of this._timers) {
      clearTimeout(timer);
      this._timers.delete(key);
    }

    // Flush all pending
    const promises: Promise<void>[] = [];
    for (const [key, entry] of this._pending) {
      promises.push(
        entry.flush(entry.text).catch((err) => {
          console.error(`[stream-queue] Flush failed for ${key}:`, err);
        })
      );
    }
    this._pending.clear();

    await Promise.all(promises);
  }

  /**
   * Number of pending updates.
   */
  get pendingCount(): number {
    return this._pending.size;
  }
}

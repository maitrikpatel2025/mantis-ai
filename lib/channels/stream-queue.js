class ChannelStreamQueue {
  _pending = /* @__PURE__ */ new Map();
  _timers = /* @__PURE__ */ new Map();
  _rateLimitMs;
  constructor(rateLimitMs = 1500) {
    this._rateLimitMs = rateLimitMs;
  }
  /**
   * Enqueue an update. The latest text wins — intermediate texts are discarded.
   * The flushFn is called at most once per rateLimitMs per key.
   */
  enqueue(key, text, flushFn) {
    this._pending.set(key, { text, flush: flushFn });
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
  _flushKey(key) {
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
  async flush() {
    for (const [key, timer] of this._timers) {
      clearTimeout(timer);
      this._timers.delete(key);
    }
    const promises = [];
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
  get pendingCount() {
    return this._pending.size;
  }
}
export {
  ChannelStreamQueue
};

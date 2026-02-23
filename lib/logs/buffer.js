'use strict';

const MAX_ENTRIES = 500;

class LogBuffer {
  constructor() {
    this._entries = [];
  }

  push(entry) {
    this._entries.push({
      id: this._entries.length,
      level: entry.level || 'info',
      message: entry.message,
      source: entry.source || '',
      timestamp: Date.now(),
    });
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }
  }

  getAll(filters = {}) {
    let result = this._entries;
    if (filters.level && filters.level !== 'all') {
      result = result.filter((e) => e.level === filters.level);
    }
    if (filters.source) {
      const src = filters.source.toLowerCase();
      result = result.filter((e) =>
        e.message.toLowerCase().includes(src) || (e.source && e.source.toLowerCase().includes(src))
      );
    }
    return result;
  }

  clear() {
    this._entries = [];
  }
}

let _instance = null;

export function getLogBuffer() {
  if (!_instance) _instance = new LogBuffer();
  return _instance;
}

/**
 * Patch console.log/warn/error to also push entries to the log buffer.
 * Call once during server startup.
 */
export function interceptConsole() {
  const buffer = getLogBuffer();
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => {
    origLog.apply(console, args);
    buffer.push({ level: 'info', message: args.map(String).join(' ') });
  };

  console.warn = (...args) => {
    origWarn.apply(console, args);
    buffer.push({ level: 'warn', message: args.map(String).join(' ') });
  };

  console.error = (...args) => {
    origError.apply(console, args);
    buffer.push({ level: 'error', message: args.map(String).join(' ') });
  };
}

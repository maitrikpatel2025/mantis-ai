import { emitEvent } from '../events/bus.js';

const MAX_ENTRIES = 500;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogEntry {
  level?: string;
  message: string;
  source?: string;
}

export interface LogItem {
  id: number;
  level: string;
  message: string;
  source: string;
  timestamp: number;
}

export interface LogFilters {
  level?: string;
  source?: string;
}

// ---------------------------------------------------------------------------
// LogBuffer class
// ---------------------------------------------------------------------------

class LogBuffer {
  private _entries: LogItem[] = [];

  push(entry: LogEntry): void {
    const item: LogItem = {
      id: this._entries.length,
      level: entry.level || 'info',
      message: entry.message,
      source: entry.source || '',
      timestamp: Date.now(),
    };
    this._entries.push(item);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }
    emitEvent('log', item);
  }

  getAll(filters: LogFilters = {}): LogItem[] {
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

  clear(): void {
    this._entries = [];
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: LogBuffer | null = null;

export function getLogBuffer(): LogBuffer {
  if (!_instance) _instance = new LogBuffer();
  return _instance;
}

/**
 * Patch console.log/warn/error to also push entries to the log buffer.
 * Call once during server startup.
 */
export function interceptConsole(): void {
  const buffer = getLogBuffer();
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: unknown[]): void => {
    origLog.apply(console, args);
    buffer.push({ level: 'info', message: args.map(String).join(' ') });
  };

  console.warn = (...args: unknown[]): void => {
    origWarn.apply(console, args);
    buffer.push({ level: 'warn', message: args.map(String).join(' ') });
  };

  console.error = (...args: unknown[]): void => {
    origError.apply(console, args);
    buffer.push({ level: 'error', message: args.map(String).join(' ') });
  };
}

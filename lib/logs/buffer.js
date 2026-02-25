import { emitEvent } from "../events/bus.js";
const MAX_ENTRIES = 500;
class LogBuffer {
  _entries = [];
  push(entry) {
    const item = {
      id: this._entries.length,
      level: entry.level || "info",
      message: entry.message,
      source: entry.source || "",
      timestamp: Date.now()
    };
    this._entries.push(item);
    if (this._entries.length > MAX_ENTRIES) {
      this._entries = this._entries.slice(-MAX_ENTRIES);
    }
    emitEvent("log", item);
  }
  getAll(filters = {}) {
    let result = this._entries;
    if (filters.level && filters.level !== "all") {
      result = result.filter((e) => e.level === filters.level);
    }
    if (filters.source) {
      const src = filters.source.toLowerCase();
      result = result.filter(
        (e) => e.message.toLowerCase().includes(src) || e.source && e.source.toLowerCase().includes(src)
      );
    }
    return result;
  }
  clear() {
    this._entries = [];
  }
}
let _instance = null;
function getLogBuffer() {
  if (!_instance) _instance = new LogBuffer();
  return _instance;
}
function interceptConsole() {
  const buffer = getLogBuffer();
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;
  console.log = (...args) => {
    origLog.apply(console, args);
    buffer.push({ level: "info", message: args.map(String).join(" ") });
  };
  console.warn = (...args) => {
    origWarn.apply(console, args);
    buffer.push({ level: "warn", message: args.map(String).join(" ") });
  };
  console.error = (...args) => {
    origError.apply(console, args);
    buffer.push({ level: "error", message: args.map(String).join(" ") });
  };
}
export {
  getLogBuffer,
  interceptConsole
};

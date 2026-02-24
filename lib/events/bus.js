import { EventEmitter } from 'events';

// Singleton on globalThis so all Next.js route bundles share one bus.
const KEY = '__mantis_event_bus';
if (!globalThis[KEY]) {
  globalThis[KEY] = new EventEmitter();
  globalThis[KEY].setMaxListeners(100);
}

export function getEventBus() {
  return globalThis[KEY];
}

/**
 * Emit a domain event to all SSE listeners.
 * @param {string} type - Event type (e.g., 'job:created', 'notification', 'log')
 * @param {object} data - Event payload
 */
export function emitEvent(type, data) {
  globalThis[KEY].emit('event', { type, data, timestamp: Date.now() });
}

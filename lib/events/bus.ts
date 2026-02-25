import { EventEmitter } from 'events';
import type { DomainEvent } from '../types.js';

declare global {
  // eslint-disable-next-line no-var
  var __mantis_event_bus: EventEmitter | undefined;
}

// Singleton on globalThis so all Next.js route bundles share one bus.
const KEY = '__mantis_event_bus' as const;
if (!globalThis[KEY]) {
  globalThis[KEY] = new EventEmitter();
  globalThis[KEY]!.setMaxListeners(100);
}

export function getEventBus(): EventEmitter {
  return globalThis[KEY]!;
}

/**
 * Emit a domain event to all SSE listeners.
 */
export function emitEvent(type: string, data: unknown): void {
  globalThis[KEY]!.emit('event', { type, data, timestamp: Date.now() } satisfies DomainEvent);
}

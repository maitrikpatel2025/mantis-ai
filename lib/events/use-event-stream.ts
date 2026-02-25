'use client';

import { useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Global singleton — one EventSource per browser tab, shared by all components.
// Stored on globalThis to survive HMR module re-evaluation in development.
// ─────────────────────────────────────────────────────────────────────────────

interface SSEState {
  eventSource: EventSource | null;
  listeners: Map<string, Set<EventCallback>>;
  refCount: number;
  backoff: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

type EventCallback = (data: any, fullEvent?: any) => void;

interface ParsedEvent {
  type: string;
  data: unknown;
}

declare global {
  // eslint-disable-next-line no-var
  var __mantis_sse: SSEState | undefined;
}

const KEY = '__mantis_sse' as const;
if (!globalThis[KEY]) {
  globalThis[KEY] = {
    eventSource: null,
    listeners: new Map(),
    refCount: 0,
    backoff: 1000,
    reconnectTimer: null,
  };
}
const state: SSEState = globalThis[KEY]!;

function connect(): void {
  if (state.eventSource) return;

  state.eventSource = new EventSource('/stream/events');

  state.eventSource.onopen = (): void => {
    state.backoff = 1000;
  };

  state.eventSource.onmessage = (e: MessageEvent): void => {
    try {
      const event: ParsedEvent = JSON.parse(e.data);
      const callbacks = state.listeners.get(event.type);
      if (callbacks) {
        for (const cb of callbacks) {
          try { cb(event.data, event); } catch {}
        }
      }
    } catch {}
  };

  state.eventSource.onerror = (): void => {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
    if (state.refCount > 0) {
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        if (state.refCount > 0) connect();
      }, state.backoff);
      state.backoff = Math.min(state.backoff * 2, 30000);
    }
  };
}

function disconnect(): void {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.backoff = 1000;
}

/**
 * Subscribe to server-sent events of a specific type.
 * Multiple components share a single EventSource connection.
 *
 * @param eventType - Event type to listen for (e.g., 'job:created', 'notification')
 * @param callback - Called with (data, fullEvent) when an event of this type arrives
 */
export function useEventStream(eventType: string, callback: EventCallback): void {
  const callbackRef = useRef<EventCallback>(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const stableCallback: EventCallback = (...args) => callbackRef.current(...args);

    // Register listener
    if (!state.listeners.has(eventType)) state.listeners.set(eventType, new Set());
    state.listeners.get(eventType)!.add(stableCallback);

    // Connect on first subscriber
    state.refCount++;
    if (state.refCount === 1) connect();

    return () => {
      state.listeners.get(eventType)?.delete(stableCallback);
      if (state.listeners.get(eventType)?.size === 0) state.listeners.delete(eventType);

      state.refCount--;
      if (state.refCount === 0) disconnect();
    };
  }, [eventType]);
}

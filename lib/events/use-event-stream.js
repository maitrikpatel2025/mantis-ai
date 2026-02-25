"use client";
import { useEffect, useRef } from "react";
const KEY = "__mantis_sse";
if (!globalThis[KEY]) {
  globalThis[KEY] = {
    eventSource: null,
    listeners: /* @__PURE__ */ new Map(),
    refCount: 0,
    backoff: 1e3,
    reconnectTimer: null
  };
}
const state = globalThis[KEY];
function connect() {
  if (state.eventSource) return;
  state.eventSource = new EventSource("/stream/events");
  state.eventSource.onopen = () => {
    state.backoff = 1e3;
  };
  state.eventSource.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);
      const callbacks = state.listeners.get(event.type);
      if (callbacks) {
        for (const cb of callbacks) {
          try {
            cb(event.data, event);
          } catch {
          }
        }
      }
    } catch {
    }
  };
  state.eventSource.onerror = () => {
    if (state.eventSource) {
      state.eventSource.close();
      state.eventSource = null;
    }
    if (state.refCount > 0) {
      state.reconnectTimer = setTimeout(() => {
        state.reconnectTimer = null;
        if (state.refCount > 0) connect();
      }, state.backoff);
      state.backoff = Math.min(state.backoff * 2, 3e4);
    }
  };
}
function disconnect() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }
  if (state.eventSource) {
    state.eventSource.close();
    state.eventSource = null;
  }
  state.backoff = 1e3;
}
function useEventStream(eventType, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  useEffect(() => {
    const stableCallback = (...args) => callbackRef.current(...args);
    if (!state.listeners.has(eventType)) state.listeners.set(eventType, /* @__PURE__ */ new Set());
    state.listeners.get(eventType).add(stableCallback);
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
export {
  useEventStream
};

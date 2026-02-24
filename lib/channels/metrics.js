import { emitEvent } from '../events/bus.js';

const KEY = '__mantis_channel_metrics';

if (!globalThis[KEY]) {
  globalThis[KEY] = {};
}

/**
 * Record a channel message (inbound or outbound).
 * @param {string} channelId
 * @param {'inbound'|'outbound'} direction
 */
export function recordChannelMessage(channelId, direction) {
  const metrics = globalThis[KEY];
  if (!metrics[channelId]) {
    metrics[channelId] = { inbound: 0, outbound: 0, lastMessageAt: null };
  }
  metrics[channelId][direction]++;
  metrics[channelId].lastMessageAt = Date.now();

  emitEvent('channel:message', {
    channelId,
    direction,
    inbound: metrics[channelId].inbound,
    outbound: metrics[channelId].outbound,
    lastMessageAt: metrics[channelId].lastMessageAt,
  });
}

/**
 * Get all channel metrics.
 * @returns {Object<string, { inbound: number, outbound: number, lastMessageAt: number|null }>}
 */
export function getChannelMetrics() {
  return { ...globalThis[KEY] };
}

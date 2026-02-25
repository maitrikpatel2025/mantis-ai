import { emitEvent } from '../events/bus.js';

interface ChannelMetricsEntry {
  inbound: number;
  outbound: number;
  lastMessageAt: number | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __mantis_channel_metrics: Record<string, ChannelMetricsEntry> | undefined;
}

const KEY = '__mantis_channel_metrics' as const;

if (!globalThis[KEY]) {
  globalThis[KEY] = {};
}

/**
 * Record a channel message (inbound or outbound).
 */
export function recordChannelMessage(channelId: string, direction: 'inbound' | 'outbound'): void {
  const metrics = globalThis[KEY]!;
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
 */
export function getChannelMetrics(): Record<string, ChannelMetricsEntry> {
  return { ...globalThis[KEY]! };
}

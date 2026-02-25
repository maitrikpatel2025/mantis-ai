import { emitEvent } from "../events/bus.js";
const KEY = "__mantis_channel_metrics";
if (!globalThis[KEY]) {
  globalThis[KEY] = {};
}
function recordChannelMessage(channelId, direction) {
  const metrics = globalThis[KEY];
  if (!metrics[channelId]) {
    metrics[channelId] = { inbound: 0, outbound: 0, lastMessageAt: null };
  }
  metrics[channelId][direction]++;
  metrics[channelId].lastMessageAt = Date.now();
  emitEvent("channel:message", {
    channelId,
    direction,
    inbound: metrics[channelId].inbound,
    outbound: metrics[channelId].outbound,
    lastMessageAt: metrics[channelId].lastMessageAt
  });
}
function getChannelMetrics() {
  return { ...globalThis[KEY] };
}
export {
  getChannelMetrics,
  recordChannelMessage
};

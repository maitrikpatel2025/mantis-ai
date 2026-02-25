import { verifyPairingCode } from "../security/pairing.js";
class ChannelAdapter {
  channelConfig;
  constructor(channelConfig) {
    this.channelConfig = channelConfig || {};
  }
  /**
   * Check channel policies against message metadata.
   * Returns { allowed: true } or { allowed: false, reason: string }.
   */
  checkPolicy(metadata) {
    const policies = this.channelConfig?.policies;
    if (!policies) return { allowed: true };
    const { senderId, isGroup, text, channelId } = metadata;
    if (isGroup) {
      const groupPolicy = policies.group || "open";
      if (groupPolicy === "disabled") {
        return { allowed: false, reason: "Group messages are disabled for this channel" };
      }
      if (groupPolicy === "allowlist") {
        const allowed = policies.groupAllowFrom || [];
        if (!allowed.includes(String(senderId))) {
          return { allowed: false, reason: "Sender not in group allowlist" };
        }
      }
    } else {
      const dmPolicy = policies.dm || "open";
      if (dmPolicy === "allowlist") {
        const allowed = policies.allowFrom || [];
        if (!allowed.includes(String(senderId))) {
          if (text && channelId && /^[A-Z0-9]{6}$/i.test(text.trim())) {
            try {
              if (verifyPairingCode(channelId, String(senderId), text.trim())) {
                console.log(`[security] Pairing successful: ${senderId} paired with ${channelId}`);
                return { allowed: true };
              }
            } catch {
            }
          }
          return { allowed: false, reason: "Sender not in DM allowlist" };
        }
      }
    }
    return { allowed: true };
  }
  /**
   * Handle an incoming webhook request from this channel.
   * Returns normalized message data or null if no action needed.
   */
  async receive(_request) {
    throw new Error("Not implemented");
  }
  /**
   * Called when message is received — adapter shows acknowledgment.
   */
  async acknowledge(_metadata) {
  }
  /**
   * Called while AI is processing — adapter shows activity.
   * Returns a stop function.
   */
  startProcessingIndicator(_metadata) {
    return () => {
    };
  }
  /**
   * Send a complete (non-streaming) response back to the channel.
   */
  async sendResponse(_threadId, _text, _metadata) {
    throw new Error("Not implemented");
  }
  /**
   * Whether this channel supports real streaming (e.g., web chat via Vercel AI SDK).
   */
  get supportsStreaming() {
    return false;
  }
  /**
   * Whether this channel supports chunked delivery (edit-in-place streaming).
   * Phase 5: Telegram, Slack, Discord can edit messages for pseudo-streaming.
   */
  get supportsChunkedDelivery() {
    return false;
  }
  /**
   * Send a stream chunk (edit-in-place). Override in adapters that support it.
   */
  async sendStreamChunk(_threadId, _chunk, _fullText, _metadata) {
  }
  /**
   * Finalize a streamed response. Override in adapters that support it.
   */
  async sendStreamEnd(_threadId, _fullText, _metadata) {
  }
}
export {
  ChannelAdapter
};

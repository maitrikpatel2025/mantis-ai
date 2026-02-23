/**
 * Base channel adapter interface.
 * Every chat channel (Telegram, Slack, web, etc.) implements this contract.
 */
class ChannelAdapter {
  /**
   * @param {object} [channelConfig] - Full channel config from CHANNELS.json (includes policies)
   */
  constructor(channelConfig) {
    this.channelConfig = channelConfig || {};
  }

  /**
   * Check channel policies against message metadata.
   * Returns { allowed: true } or { allowed: false, reason: string }.
   *
   * Policy schema (in CHANNELS.json):
   *   policies.dm: "open" | "allowlist" — controls DM access (default: "open")
   *   policies.group: "open" | "allowlist" | "disabled" — controls group access (default: "open")
   *   policies.allowFrom: string[] — allowed sender IDs for DMs (when dm: "allowlist")
   *   policies.groupAllowFrom: string[] — allowed sender IDs in groups (when group: "allowlist")
   *   policies.mediaMaxMb: number — max media size in MB
   *
   * @param {object} metadata - Must include `senderId` and `isGroup`
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkPolicy(metadata) {
    const policies = this.channelConfig?.policies;
    if (!policies) return { allowed: true };

    const { senderId, isGroup } = metadata;

    if (isGroup) {
      const groupPolicy = policies.group || 'open';
      if (groupPolicy === 'disabled') {
        return { allowed: false, reason: 'Group messages are disabled for this channel' };
      }
      if (groupPolicy === 'allowlist') {
        const allowed = policies.groupAllowFrom || [];
        if (!allowed.includes(String(senderId))) {
          return { allowed: false, reason: 'Sender not in group allowlist' };
        }
      }
    } else {
      const dmPolicy = policies.dm || 'open';
      if (dmPolicy === 'allowlist') {
        const allowed = policies.allowFrom || [];
        if (!allowed.includes(String(senderId))) {
          return { allowed: false, reason: 'Sender not in DM allowlist' };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Handle an incoming webhook request from this channel.
   * Returns normalized message data or null if no action needed.
   *
   * @param {Request} request - Incoming HTTP request
   * @returns {Promise<{ threadId: string, text: string, attachments: Array, metadata: object } | null>}
   *
   * Attachments array (may be empty) — only non-text content that the LLM needs to see:
   *   { category: "image", mimeType: "image/png", data: Buffer }  — send to LLM as vision
   *   { category: "document", mimeType: "application/pdf", data: Buffer } — future: extract/attach
   *
   * The adapter downloads authenticated files and normalizes them.
   * Voice/audio messages are fully resolved by the adapter — transcribed to text
   * and included in the `text` field. They are NOT passed as attachments.
   */
  async receive(request) {
    throw new Error('Not implemented');
  }

  /**
   * Called when message is received — adapter shows acknowledgment.
   * Telegram: thumbs up reaction. Slack: emoji reaction. Web: no-op.
   */
  async acknowledge(metadata) {}

  /**
   * Called while AI is processing — adapter shows activity.
   * Telegram: typing indicator. Slack: typing indicator. Web: no-op (streaming handles this).
   * Returns a stop function.
   */
  startProcessingIndicator(metadata) {
    return () => {};
  }

  /**
   * Send a complete (non-streaming) response back to the channel.
   */
  async sendResponse(threadId, text, metadata) {
    throw new Error('Not implemented');
  }

  /**
   * Whether this channel supports real streaming (e.g., web chat via Vercel AI SDK).
   * If true, the AI layer provides a stream instead of a complete response.
   */
  get supportsStreaming() {
    return false;
  }
}

export { ChannelAdapter };

import type { NormalizedMessage, PolicyResult, ChannelMetadata, ChannelPolicies } from '../types.js';
import { verifyPairingCode } from '../security/pairing.js';

/**
 * Base channel adapter interface.
 * Every chat channel (Telegram, Slack, web, etc.) implements this contract.
 */
class ChannelAdapter {
  channelConfig: Record<string, unknown>;

  constructor(channelConfig?: Record<string, unknown>) {
    this.channelConfig = channelConfig || {};
  }

  /**
   * Check channel policies against message metadata.
   * Returns { allowed: true } or { allowed: false, reason: string }.
   */
  checkPolicy(metadata: { senderId: string; isGroup: boolean; text?: string; channelId?: string }): PolicyResult {
    const policies = (this.channelConfig as { policies?: ChannelPolicies })?.policies;
    if (!policies) return { allowed: true };

    const { senderId, isGroup, text, channelId } = metadata;

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
          // Check if message text is a pairing code
          if (text && channelId && /^[A-Z0-9]{6}$/i.test(text.trim())) {
            try {
              if (verifyPairingCode(channelId, String(senderId), text.trim())) {
                console.log(`[security] Pairing successful: ${senderId} paired with ${channelId}`);
                return { allowed: true };
              }
            } catch {
              // Pairing module not available or DB not initialized — fall through to deny
            }
          }
          return { allowed: false, reason: 'Sender not in DM allowlist' };
        }
      }
    }

    return { allowed: true };
  }

  /**
   * Handle an incoming webhook request from this channel.
   * Returns normalized message data or null if no action needed.
   */
  async receive(_request: Request): Promise<NormalizedMessage | null> {
    throw new Error('Not implemented');
  }

  /**
   * Called when message is received — adapter shows acknowledgment.
   */
  async acknowledge(_metadata: ChannelMetadata): Promise<void> {}

  /**
   * Called while AI is processing — adapter shows activity.
   * Returns a stop function.
   */
  startProcessingIndicator(_metadata: ChannelMetadata): () => void {
    return () => {};
  }

  /**
   * Send a complete (non-streaming) response back to the channel.
   */
  async sendResponse(_threadId: string, _text: string, _metadata?: ChannelMetadata): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Whether this channel supports real streaming (e.g., web chat via Vercel AI SDK).
   */
  get supportsStreaming(): boolean {
    return false;
  }

  /**
   * Whether this channel supports chunked delivery (edit-in-place streaming).
   * Phase 5: Telegram, Slack, Discord can edit messages for pseudo-streaming.
   */
  get supportsChunkedDelivery(): boolean {
    return false;
  }

  /**
   * Send a stream chunk (edit-in-place). Override in adapters that support it.
   */
  async sendStreamChunk(
    _threadId: string,
    _chunk: string,
    _fullText: string,
    _metadata?: ChannelMetadata
  ): Promise<string | void> {}

  /**
   * Finalize a streamed response. Override in adapters that support it.
   */
  async sendStreamEnd(
    _threadId: string,
    _fullText: string,
    _metadata?: ChannelMetadata
  ): Promise<void> {}
}

export { ChannelAdapter };

import { createHash } from 'crypto';
import { ChannelAdapter } from './base.js';
import {
  sendMessage,
  downloadAttachment,
  addReaction,
  triggerTyping,
  deferInteraction,
  editDeferredResponse,
  markdownToDiscord,
} from '../tools/discord.js';
import { isWhisperEnabled, transcribeAudio } from '../tools/openai.js';

class DiscordAdapter extends ChannelAdapter {
  /**
   * @param {string} botToken - Discord bot token
   * @param {string} applicationId - Discord application ID
   * @param {string} publicKey - Discord application public key (Ed25519)
   */
  constructor(botToken, applicationId, publicKey) {
    super();
    this.botToken = botToken;
    this.applicationId = applicationId;
    this.publicKey = publicKey;
  }

  /**
   * Verify Discord Ed25519 signature.
   * @param {string} rawBody - Raw request body
   * @param {string} signature - X-Signature-Ed25519
   * @param {string} timestamp - X-Signature-Timestamp
   * @returns {Promise<boolean>}
   */
  async verifySignature(rawBody, signature, timestamp) {
    if (!signature || !timestamp || !this.publicKey) return false;

    try {
      const { verify } = await import('crypto');
      const message = Buffer.from(timestamp + rawBody);
      const sig = Buffer.from(signature, 'hex');
      const key = Buffer.from(this.publicKey, 'hex');

      // Use SubtleCrypto for Ed25519 verification
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'Ed25519' },
        false,
        ['verify']
      );

      return await crypto.subtle.verify('Ed25519', cryptoKey, sig, message);
    } catch {
      return false;
    }
  }

  async receive(request) {
    const rawBody = await request.text();
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');

    // Verify signature
    const valid = await this.verifySignature(rawBody, signature, timestamp);
    if (!valid) return null;

    const body = JSON.parse(rawBody);

    // Handle Discord PING (type 1)
    if (body.type === 1) {
      return { _pong: true };
    }

    // Handle MESSAGE_CREATE from gateway-like webhook
    // and APPLICATION_COMMAND interactions (type 2)
    if (body.type === 2) {
      // Slash command interaction
      const option = body.data?.options?.[0];
      const text = option?.value || body.data?.name || '';

      return {
        threadId: body.channel_id,
        text,
        attachments: [],
        metadata: {
          channelId: body.channel_id,
          messageId: body.id,
          guildId: body.guild_id,
          interactionId: body.id,
          interactionToken: body.token,
          isInteraction: true,
        },
      };
    }

    // Handle regular messages (type 0 = regular message event via webhook)
    if (body.t === 'MESSAGE_CREATE') {
      const msg = body.d;
      if (!msg || msg.author?.bot) return null;

      let text = msg.content || '';
      const attachments = [];

      // Handle attachments
      if (msg.attachments?.length > 0) {
        for (const att of msg.attachments) {
          try {
            if (att.content_type?.startsWith('audio/') && isWhisperEnabled()) {
              const buffer = await downloadAttachment(att.url);
              const transcription = await transcribeAudio(buffer, att.filename || 'audio.ogg');
              text = text ? `${text}\n${transcription}` : transcription;
            } else if (att.content_type?.startsWith('image/')) {
              const buffer = await downloadAttachment(att.url);
              attachments.push({ category: 'image', mimeType: att.content_type, data: buffer });
            } else {
              const buffer = await downloadAttachment(att.url);
              attachments.push({
                category: 'document',
                mimeType: att.content_type || 'application/octet-stream',
                data: buffer,
              });
            }
          } catch (err) {
            console.error('[discord] Failed to download attachment:', err);
          }
        }
      }

      if (!text && attachments.length === 0) return null;

      return {
        threadId: msg.channel_id,
        text,
        attachments,
        metadata: {
          channelId: msg.channel_id,
          messageId: msg.id,
          guildId: msg.guild_id,
          isInteraction: false,
        },
      };
    }

    return null;
  }

  async acknowledge(metadata) {
    if (metadata.isInteraction) {
      // Defer the interaction to show "Bot is thinking..."
      await deferInteraction(metadata.interactionId, metadata.interactionToken).catch(() => {});
    } else {
      await addReaction(this.botToken, metadata.channelId, metadata.messageId).catch(() => {});
    }
  }

  startProcessingIndicator(metadata) {
    if (metadata.isInteraction) {
      // Already deferred — no need for typing
      return () => {};
    }

    // Discord typing indicator lasts ~10 seconds
    let timeout;
    let stopped = false;

    function schedule(botToken, channelId) {
      if (stopped) return;
      timeout = setTimeout(() => {
        if (stopped) return;
        triggerTyping(botToken, channelId).catch(() => {});
        schedule(botToken, channelId);
      }, 8000);
    }

    triggerTyping(this.botToken, metadata.channelId).catch(() => {});
    schedule(this.botToken, metadata.channelId);

    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }

  async sendResponse(threadId, text, metadata) {
    const formatted = markdownToDiscord(text);

    if (metadata?.isInteraction) {
      await editDeferredResponse(
        this.applicationId,
        metadata.interactionToken,
        formatted
      );
    } else {
      await sendMessage(this.botToken, threadId, formatted);
    }
  }

  get supportsStreaming() {
    return false;
  }
}

export { DiscordAdapter };

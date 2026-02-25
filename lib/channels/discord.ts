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
import type { NormalizedMessage, ChannelMetadata, Attachment } from '../types.js';

class DiscordAdapter extends ChannelAdapter {
  botToken: string;
  applicationId: string;
  publicKey: string;

  /**
   * @param botToken - Discord bot token
   * @param applicationId - Discord application ID
   * @param publicKey - Discord application public key (Ed25519)
   * @param channelConfig - Full channel config from CHANNELS.json
   */
  constructor(botToken: string, applicationId: string, publicKey: string, channelConfig?: Record<string, unknown>) {
    super(channelConfig);
    this.botToken = botToken;
    this.applicationId = applicationId;
    this.publicKey = publicKey;
  }

  /**
   * Verify Discord Ed25519 signature.
   */
  async verifySignature(rawBody: string, signature: string | null, timestamp: string | null): Promise<boolean> {
    if (!signature || !timestamp || !this.publicKey) return false;

    try {
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

  async receive(request: Request): Promise<NormalizedMessage | null> {
    const rawBody = await request.text();
    const signature = request.headers.get('x-signature-ed25519');
    const timestamp = request.headers.get('x-signature-timestamp');

    // Verify signature
    const valid = await this.verifySignature(rawBody, signature, timestamp);
    if (!valid) return null;

    const body = JSON.parse(rawBody);

    // Handle Discord PING (type 1)
    if (body.type === 1) {
      return { _pong: true } as unknown as NormalizedMessage;
    }

    // Handle APPLICATION_COMMAND interactions (type 2)
    if (body.type === 2) {
      // Slash command interaction
      const option = body.data?.options?.[0];
      const text: string = option?.value || body.data?.name || '';

      const senderId: string = body.member?.user?.id || body.user?.id || '';
      const isGroup: boolean = !!body.guild_id;

      const policy = this.checkPolicy({ senderId, isGroup, text, channelId: (this.channelConfig as Record<string, unknown>).id as string | undefined });
      if (!policy.allowed) {
        console.log(`[discord] Policy blocked: ${policy.reason} (sender: ${senderId})`);
        return null;
      }

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
          senderId,
          isGroup,
        },
      };
    }

    // Handle regular messages (type 0 = regular message event via webhook)
    if (body.t === 'MESSAGE_CREATE') {
      const msg = body.d;
      if (!msg || msg.author?.bot) return null;

      let text: string = msg.content || '';
      const attachments: Attachment[] = [];

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

      const senderId: string = msg.author?.id || '';
      const isGroup: boolean = !!msg.guild_id;

      const policy = this.checkPolicy({ senderId, isGroup, text, channelId: (this.channelConfig as Record<string, unknown>).id as string | undefined });
      if (!policy.allowed) {
        console.log(`[discord] Policy blocked: ${policy.reason} (sender: ${senderId})`);
        return null;
      }

      return {
        threadId: msg.channel_id,
        text,
        attachments,
        metadata: {
          channelId: msg.channel_id,
          messageId: msg.id,
          guildId: msg.guild_id,
          isInteraction: false,
          senderId,
          isGroup,
        },
      };
    }

    return null;
  }

  async acknowledge(metadata: ChannelMetadata): Promise<void> {
    if (metadata.isInteraction) {
      // Defer the interaction to show "Bot is thinking..."
      await deferInteraction(metadata.interactionId as string, metadata.interactionToken as string).catch(() => {});
    } else {
      await addReaction(this.botToken, metadata.channelId as string, metadata.messageId as string).catch(() => {});
    }
  }

  startProcessingIndicator(metadata: ChannelMetadata): () => void {
    if (metadata.isInteraction) {
      // Already deferred — no need for typing
      return () => {};
    }

    // Discord typing indicator lasts ~10 seconds
    let timeout: ReturnType<typeof setTimeout>;
    let stopped = false;

    const schedule = (botToken: string, channelId: string): void => {
      if (stopped) return;
      timeout = setTimeout(() => {
        if (stopped) return;
        triggerTyping(botToken, channelId).catch(() => {});
        schedule(botToken, channelId);
      }, 8000);
    };

    triggerTyping(this.botToken, metadata.channelId as string).catch(() => {});
    schedule(this.botToken, metadata.channelId as string);

    return () => {
      stopped = true;
      clearTimeout(timeout);
    };
  }

  async sendResponse(threadId: string, text: string, metadata?: ChannelMetadata): Promise<void> {
    const formatted = markdownToDiscord(text);

    if (metadata?.isInteraction) {
      await editDeferredResponse(
        this.applicationId,
        metadata.interactionToken as string,
        formatted
      );
    } else {
      await sendMessage(this.botToken, threadId, formatted);
    }
  }

  get supportsStreaming(): boolean {
    return false;
  }
}

export { DiscordAdapter };

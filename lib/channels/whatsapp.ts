import { createHmac, timingSafeEqual } from 'crypto';
import { ChannelAdapter } from './base.js';
import {
  sendMessage,
  downloadMedia,
  markRead,
} from '../tools/whatsapp.js';
import { isWhisperEnabled, transcribeAudio } from '../tools/openai.js';
import type { NormalizedMessage, ChannelMetadata, Attachment } from '../types.js';

class WhatsAppAdapter extends ChannelAdapter {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string | undefined;
  appSecret: string | undefined;

  /**
   * @param phoneNumberId - WhatsApp Business phone number ID
   * @param accessToken - WhatsApp access token
   * @param verifyToken - Webhook verification token
   * @param appSecret - App secret for signature verification
   * @param channelConfig - Full channel config from CHANNELS.json
   */
  constructor(
    phoneNumberId: string,
    accessToken: string,
    verifyToken?: string,
    appSecret?: string,
    channelConfig?: Record<string, unknown>
  ) {
    super(channelConfig);
    this.phoneNumberId = phoneNumberId;
    this.accessToken = accessToken;
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
  }

  /**
   * Verify X-Hub-Signature-256 from Meta webhook.
   */
  verifySignature(rawBody: string, signature: string | null): boolean {
    if (!this.appSecret || !signature) return !this.appSecret;

    const expected = 'sha256=' + createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');

    const bufA = Buffer.from(expected);
    const bufB = Buffer.from(signature);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  async receive(request: Request): Promise<NormalizedMessage | null> {
    const rawBody = await request.text();

    // Handle GET verification challenge
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      if (mode === 'subscribe' && token === this.verifyToken) {
        return { _challenge: challenge } as unknown as NormalizedMessage;
      }
      return null;
    }

    // Verify signature
    const signature = request.headers.get('x-hub-signature-256');
    if (!this.verifySignature(rawBody, signature)) {
      return null;
    }

    const body = JSON.parse(rawBody);

    // Extract message from WhatsApp webhook structure
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value || !value.messages || value.messages.length === 0) return null;

    const message = value.messages[0];
    const from: string = message.from; // sender phone number

    let text = '';
    const attachments: Attachment[] = [];

    switch (message.type) {
      case 'text':
        text = message.text?.body || '';
        break;

      case 'audio':
      case 'voice':
        if (isWhisperEnabled() && message[message.type]?.id) {
          try {
            const { buffer } = await downloadMedia(
              this.accessToken,
              message[message.type].id
            );
            text = await transcribeAudio(buffer, 'audio.ogg');
          } catch (err) {
            console.error('[whatsapp] Failed to transcribe audio:', err);
            return null;
          }
        } else {
          return null;
        }
        break;

      case 'image':
        if (message.image?.id) {
          try {
            const { buffer, mimeType } = await downloadMedia(
              this.accessToken,
              message.image.id
            );
            attachments.push({ category: 'image', mimeType, data: buffer });
            if (message.image.caption) text = message.image.caption;
          } catch (err) {
            console.error('[whatsapp] Failed to download image:', err);
          }
        }
        break;

      case 'document':
        if (message.document?.id) {
          try {
            const { buffer, mimeType } = await downloadMedia(
              this.accessToken,
              message.document.id
            );
            attachments.push({ category: 'document', mimeType, data: buffer });
            if (message.document.caption) text = message.document.caption;
          } catch (err) {
            console.error('[whatsapp] Failed to download document:', err);
          }
        }
        break;

      default:
        return null;
    }

    if (!text && attachments.length === 0) return null;

    const senderId: string = from;
    // WhatsApp Business API: groups not typically supported, but future-proof
    const isGroup = false;

    const policy = this.checkPolicy({ senderId, isGroup, text, channelId: (this.channelConfig as Record<string, unknown>).id as string | undefined });
    if (!policy.allowed) {
      console.log(`[whatsapp] Policy blocked: ${policy.reason} (sender: ${senderId})`);
      return null;
    }

    return {
      threadId: from,
      text,
      attachments,
      metadata: {
        from,
        messageId: message.id,
        phoneNumberId: this.phoneNumberId,
        senderId,
        isGroup,
      },
    };
  }

  async acknowledge(metadata: ChannelMetadata): Promise<void> {
    // Mark message as read (shows blue checkmarks)
    await markRead(this.phoneNumberId, this.accessToken, metadata.messageId as string).catch(() => {});
  }

  startProcessingIndicator(_metadata: ChannelMetadata): () => void {
    // WhatsApp doesn't have a typing indicator API for business
    return () => {};
  }

  async sendResponse(threadId: string, text: string, _metadata?: ChannelMetadata): Promise<void> {
    await sendMessage(this.phoneNumberId, this.accessToken, threadId, text);
  }

  get supportsStreaming(): boolean {
    return false;
  }
}

export { WhatsAppAdapter };
